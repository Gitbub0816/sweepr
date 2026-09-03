/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { logger } from "../lib/logger";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import { sendEmail, wrapBodyInTemplate } from "../lib/mailer";
import { et } from "../lib/emailI18n";
import { sendNotification } from "../lib/notifications";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { loadFeeSettings, calculatePayout, getTierMultiplier } from "../lib/payoutEngine";
import { sumAccessDelayFeeCents, splitAccessDelayFeeCents } from "../lib/accessDelayFee";
import { foundingPayoutMultiplier } from "../lib/foundingMember";
import { isTeamFlagEnabled } from "../lib/crew/crewConfig";
import { releaseCrewPayouts } from "../lib/crew/crewPayout";
import { audit } from "../lib/audit";
import { serverTrack } from "../lib/posthog";
import { isValidTransition } from "../lib/statusMachine";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

const intentSchema = z.object({
  bookingId: z.string().uuid(),
});

export const paymentsRouter = new Hono<AppBindings>();

/** List the signed-in customer's saved Stripe cards (empty if none). */
paymentsRouter.get("/methods", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ methods: [] });
  const rows = (await sql`
    SELECT stripe_customer_id FROM customers WHERE user_id = ${user.id} LIMIT 1
  `) as Array<{ stripe_customer_id: string | null }>;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return c.json({ methods: [] });
  try {
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const list = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
    const def = (await stripe.customers.retrieve(customerId)) as { invoice_settings?: { default_payment_method?: string } };
    const defaultPm = def?.invoice_settings?.default_payment_method;
    return c.json({
      methods: list.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "card",
        last4: pm.card?.last4 ?? "",
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        isDefault: pm.id === defaultPm,
      })),
    });
  } catch {
    return c.json({ methods: [] });
  }
});

/**
 * Payment state of a booking's intent — the native apps poll this while the
 * customer confirms in the hosted pay page (bookings are created 'booked'
 * before payment, so booking status alone can't signal authorization).
 * `paid` = the manual-capture intent is authorized (requires_capture) or has
 * settled (processing/succeeded). Read-only, owner-gated.
 */
paymentsRouter.get("/intent-status/:bookingId", requireAuth, async (c) => {
  const bookingId = c.req.param("bookingId");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    SELECT b.stripe_payment_intent_id, cust.user_id AS customer_user_id
    FROM bookings b
    JOIN customers cust ON cust.id = b.customer_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `) as Array<{ stripe_payment_intent_id: string | null; customer_user_id: string }>;
  const row = rows[0];
  if (!row) return c.json({ error: "Booking not found" }, 404);
  const users = (await sql`SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId}`) as Array<{ id: string }>;
  if (!users[0] || users[0].id !== row.customer_user_id) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const pid = row.stripe_payment_intent_id;
  if (!pid || pid.startsWith("pending:")) return c.json({ status: null, paid: false });
  try {
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.retrieve(pid);
    const paid = ["requires_capture", "processing", "succeeded"].includes(intent.status);
    return c.json({ status: intent.status, paid });
  } catch {
    return c.json({ status: null, paid: false });
  }
});

paymentsRouter.post(
  "/create-intent",
  requireAuth,
  zValidator("json", intentSchema),
  async (c) => {
    const { bookingId } = c.req.valid("json");
    const user = c.get("user");
    const sql = getDb(c.env.DATABASE_URL);
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    // Load booking from DB — never trust a client-supplied amount.
    const bookings = (await sql`
      SELECT b.id, b.total_price, b.status, b.stripe_payment_intent_id,
             b.stripe_payment_intent_created_at,
             cust.user_id AS customer_user_id
      FROM bookings b
      JOIN customers cust ON cust.id = b.customer_id
      WHERE b.id = ${bookingId}
      LIMIT 1
    `) as Array<{
      id: string;
      total_price: number;
      status: string;
      stripe_payment_intent_id: string | null;
      stripe_payment_intent_created_at: string | null;
      customer_user_id: string;
    }>;
    const booking = bookings[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);

    // Verify caller owns this booking.
    const users = (await sql`SELECT id FROM users WHERE clerk_id = ${user.clerkId}`) as Array<{ id: string }>;
    if (!users[0] || users[0].id !== booking.customer_user_id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // Block payment only when the booking is already in a terminal or paid state.
    // "booked" is the initial state and IS the correct state for first payment.
    if (["completed", "cancelled_by_customer", "cancelled_by_cleaner", "refunded"].includes(booking.status)) {
      return c.json({ error: `Booking is already in '${booking.status}' state` }, 400);
    }

    // Idempotency: return existing intent if already created within 24 h.
    // Only reuse a MANUAL-capture intent — the platform authorizes at booking
    // time and captures after the service is completed (capture cron in
    // index.ts gates on status === "requires_capture"). A cached auto-capture
    // intent left over from before this behavior is cancelled and replaced.
    if (booking.stripe_payment_intent_id && booking.stripe_payment_intent_created_at) {
      const age = Date.now() - new Date(booking.stripe_payment_intent_created_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        const existing = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        if (existing.status !== "canceled" && existing.capture_method === "manual") {
          return c.json({ clientSecret: existing.client_secret, id: existing.id, amount: booking.total_price });
        }
        // Stale auto-capture intent: cancel it (only cancelable pre-capture)
        // and fall through to create a fresh manual-capture intent.
        if (existing.status !== "canceled" && existing.capture_method !== "manual") {
          try {
            await stripe.paymentIntents.cancel(existing.id);
          } catch {
            // Already uncancelable (e.g. captured) — nothing to reuse; continue.
          }
        }
      }
    }

    if (!booking.total_price || booking.total_price < 50) {
      return c.json({ error: "Booking has no valid price" }, 400);
    }

    // Claim-then-act: the reuse check above reads a snapshot, so two
    // concurrent create-intent calls for the same booking (double-tap on
    // checkout, or a client retry racing the original) could both pass it and
    // each call Stripe, leaving one PaymentIntent orphaned and racing to
    // overwrite bookings.stripe_payment_intent_id. Claim the row with a
    // sentinel value FIRST — only one request can win — before calling
    // Stripe. A losing request either reuses the winner's real intent (once
    // it lands) or gets a 409 telling the client to retry.
    const CLAIM_SENTINEL = "pending:creating";
    const claim = (await sql`
      UPDATE bookings
      SET stripe_payment_intent_id = ${CLAIM_SENTINEL}, stripe_payment_intent_created_at = NOW()
      WHERE id = ${bookingId}
        AND (
          stripe_payment_intent_id IS NULL
          OR (stripe_payment_intent_id = ${CLAIM_SENTINEL} AND stripe_payment_intent_created_at < NOW() - INTERVAL '30 seconds')
          OR (stripe_payment_intent_created_at IS NOT NULL AND stripe_payment_intent_created_at < NOW() - INTERVAL '24 hours')
        )
      RETURNING id
    `) as Array<{ id: string }>;
    if (!claim[0]) {
      // Someone else is actively creating (or already holds) an intent for
      // this booking. Re-check: if a real intent has since landed, hand it
      // back instead of erroring the client.
      const recheck = (await sql`
        SELECT stripe_payment_intent_id FROM bookings WHERE id = ${bookingId} LIMIT 1
      `) as Array<{ stripe_payment_intent_id: string | null }>;
      const pid = recheck[0]?.stripe_payment_intent_id;
      if (pid && pid !== CLAIM_SENTINEL) {
        const existing = await stripe.paymentIntents.retrieve(pid);
        if (existing.status !== "canceled") {
          return c.json({ clientSecret: existing.client_secret, id: existing.id, amount: booking.total_price });
        }
      }
      return c.json({ error: "payment_intent_in_progress", message: "Please retry in a moment." }, 409);
    }

    // Manual capture: authorize now, capture after the clean is completed.
    // NOTE: Stripe automatically cancels an uncaptured manual-capture
    // PaymentIntent after 7 days, so the booking must be captured within that
    // window (the hourly capture cron handles completed bookings promptly).
    let intent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: booking.total_price,
        currency: "usd",
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        metadata: {
          clerkId: user.clerkId,
          bookingId,
        },
      });
    } catch (err) {
      // Release the claim so a legitimate retry isn't permanently blocked.
      await sql`
        UPDATE bookings SET stripe_payment_intent_id = NULL, stripe_payment_intent_created_at = NULL
        WHERE id = ${bookingId} AND stripe_payment_intent_id = ${CLAIM_SENTINEL}
      `;
      throw err;
    }

    await sql`
      UPDATE bookings
      SET stripe_payment_intent_id = ${intent.id},
          stripe_payment_intent_created_at = NOW(),
          updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    await audit(sql, {
      action: "payment.intent_created",
      actorClerkId: user.clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { intentId: intent.id, amount: booking.total_price },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ clientSecret: intent.client_secret, id: intent.id, amount: booking.total_price });
  }
);

// ---------------------------------------------------------------------------
// Admin: release payout to cleaner's Connect account
// ---------------------------------------------------------------------------

const releaseSchema = z.object({ bookingId: z.string().uuid() });

paymentsRouter.post(
  "/release-payout",
  requireAuth,
  requireAdmin,
  zValidator("json", releaseSchema),
  async (c) => {
    const { bookingId } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const bookings = (await sql`
      SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1
    `) as BookingRow[];
    const booking = bookings[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    if (!booking.cleaner_id) return c.json({ error: "No cleaner assigned" }, 400);
    if (!booking.total_price) return c.json({ error: "No charge to split" }, 400);

    const cleaners = (await sql`
      SELECT * FROM cleaners WHERE id = ${booking.cleaner_id} LIMIT 1
    `) as CleanerRow[];
    const cleaner = cleaners[0];
    if (!cleaner?.stripe_connect_id) {
      return c.json({ error: "Cleaner has no payout account" }, 400);
    }

    // Never pay a cleaner before the customer's funds have actually been
    // captured. A payout transfer draws from the platform balance, so releasing
    // it against an uncaptured (or failed) charge pays out money we never
    // collected. Require a settled `payments` row for this booking first.
    const capturedRows = (await sql`
      SELECT 1 FROM payments
      WHERE booking_id = ${bookingId} AND status IN ('captured', 'succeeded')
      LIMIT 1
    `) as Array<unknown>;
    if (!capturedRows[0]) {
      return c.json(
        { error: "payment_not_captured", message: "Customer payment has not been captured for this booking yet." },
        409,
      );
    }

    // Team Cleans branch: a crew booking (crew_status set) splits the SAME
    // cleaner-payout pool across present members with one Stripe transfer each
    // (claim-then-act per seat). Solo bookings (crew_status NULL) fall through to
    // the unchanged single-transfer path below. Gated on the master flag so the
    // solo path stays byte-for-byte identical while the feature is off.
    const crewStatus = (booking as unknown as Record<string, unknown>).crew_status as string | null;
    if (crewStatus && (await isTeamFlagEnabled(sql, "enabled"))) {
      let summary;
      try {
        summary = await releaseCrewPayouts(sql, stripe, bookingId);
      } catch (err) {
        logger.error("crew payout release failed", err, { bookingId });
        return c.json({ error: "payout_failed", message: "Crew payout transfer failed. Please try again." }, 502);
      }

      // Notify each paid member; audit the fan-out at booking level.
      for (const t of summary.transfers) {
        if (t.status !== "transferred") continue;
        const [cl] = (await sql`
          SELECT user_id FROM cleaners WHERE id = ${t.cleanerId} LIMIT 1
        `) as Array<{ user_id: string }>;
        if (cl?.user_id) {
          await sendNotification(sql, cl.user_id, {
            type: "payout_released",
            title: "Payout on the way",
            body: `Your payout of $${(t.earningsCents / 100).toFixed(2)} has been released.`,
            data: { href: "/earnings", bookingId },
          });
        }
      }

      // Crew tips: each succeeded, unpaid booking_tips row (one per tipped crew
      // member — see routes/tips.ts) is transferred 100% to THAT member as a
      // separate transfer. Claim-then-act per row (paid_out_at) + idempotency
      // key make each safe on retry; a failed one is released for a later retry.
      const crewTipTransfers: Array<{ tipId: string; amount: number; transferId: string | null }> = [];
      try {
        const tipRows = (await sql`
          SELECT id, cleaner_id, amount_cents FROM booking_tips
          WHERE booking_id = ${bookingId} AND status = 'succeeded' AND paid_out_at IS NULL
        `) as Array<{ id: string; cleaner_id: string | null; amount_cents: number }>;
        for (const tip of tipRows) {
          if (!tip.cleaner_id) continue;
          const [ct] = (await sql`
            SELECT stripe_connect_id FROM cleaners WHERE id = ${tip.cleaner_id} LIMIT 1
          `) as Array<{ stripe_connect_id: string | null }>;
          if (!ct?.stripe_connect_id) continue;
          const claimedTip = (await sql`
            UPDATE booking_tips
            SET paid_out_at = NOW(), visible_to_cleaner = TRUE, updated_at = NOW()
            WHERE id = ${tip.id} AND paid_out_at IS NULL
            RETURNING id
          `) as Array<{ id: string }>;
          if (!claimedTip[0]) continue;
          try {
            const tipTransfer = await stripe.transfers.create(
              {
                amount: tip.amount_cents,
                currency: "usd",
                destination: ct.stripe_connect_id,
                transfer_group: `booking_${bookingId}`,
                metadata: { type: "tip", booking_id: bookingId, tip_id: tip.id, cleaner_id: tip.cleaner_id },
              },
              { idempotencyKey: `tip_${tip.id}` },
            );
            crewTipTransfers.push({ tipId: tip.id, amount: tip.amount_cents, transferId: tipTransfer.id });
          } catch (err) {
            await sql`
              UPDATE booking_tips SET paid_out_at = NULL, visible_to_cleaner = FALSE, updated_at = NOW()
              WHERE id = ${tip.id}
            `;
            logger.error("crew tip-transfer failed", err, { bookingId, tipId: tip.id });
          }
        }
      } catch (err) {
        logger.error("crew tip payout lookup failed", err, { bookingId });
      }

      await audit(sql, {
        action: "payout.released",
        actorClerkId: c.get("user").clerkId,
        targetType: "booking",
        targetId: bookingId,
        metadata: {
          crew: true,
          tipTransfers: crewTipTransfers,
          poolCents: summary.poolCents,
          presentCrewSize: summary.presentCrewSize,
          transfers: summary.transfers.map((t) => ({
            crewAssignmentId: t.assignmentId,
            amount: t.earningsCents,
            transferId: t.transferId,
            status: t.status,
          })),
        },
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
        timestamp: new Date().toISOString(),
      });

      await serverTrack(c.env, "payout_released", c.get("user").clerkId, {
        bookingId,
        crew: true,
        poolCents: summary.poolCents,
        presentCrewSize: summary.presentCrewSize,
      });

      return c.json({
        ok: true,
        crew: true,
        poolCents: summary.poolCents,
        presentCrewSize: summary.presentCrewSize,
        transfers: summary.transfers,
      });
    }

    const feeSettings = await loadFeeSettings(sql);
    const cleanerTier = (cleaner as unknown as Record<string, unknown>).tier as string ?? "standard";
    const tierMultiplier = await getTierMultiplier(sql, cleanerTier);
    // Founding Members earn a permanent bonus (default 5%) on every payout while
    // in good standing. Compounds onto the tier multiplier so both apply.
    const foundingMult = await foundingPayoutMultiplier(sql, booking.cleaner_id);

    // Access-delay/lockout fees are allocated 80% cleaner / 20% Sweepr (owner
    // ruleset), NOT the standard fee split: carve them out of the total, run
    // the normal payout math on the remainder, then add the fixed 80% share
    // (tier/founding multipliers deliberately do not apply to the fee portion).
    const accessFeeCents = Math.min(await sumAccessDelayFeeCents(sql, bookingId), booking.total_price);
    const accessShare = splitAccessDelayFeeCents(accessFeeCents);

    const rawBreakdown = calculatePayout(
      booking.total_price - accessFeeCents,
      feeSettings,
      tierMultiplier * foundingMult,
      booking.founding_customer_discount_cents ?? 0,
    );
    const breakdown = {
      ...rawBreakdown,
      grossAmount: booking.total_price,
      cleanerPayout: rawBreakdown.cleanerPayout + accessShare.cleanerCents,
      platformFee: rawBreakdown.platformFee + accessShare.sweeprCents,
      feeRate:
        booking.total_price > 0
          ? (rawBreakdown.platformFee + accessShare.sweeprCents) / booking.total_price
          : 0,
    };

    // Atomic lock BEFORE calling Stripe: claim the payout row first so a
    // concurrent/retried request can't also pass this check and double-transfer.
    // The blocked-status set ('processing','transferred','paid') is unified with
    // the admin override path (adminPayouts.ts) so neither path can transfer
    // while the other holds an in-flight or terminal claim.
    const existing = (await sql`
      SELECT id, status FROM payouts WHERE booking_id = ${bookingId} LIMIT 1
    `) as Array<{ id: string; status: string }>;
    if (existing[0]) {
      const claimed = (await sql`
        UPDATE payouts SET status = 'processing'
        WHERE booking_id = ${bookingId} AND status NOT IN ('paid', 'processing', 'transferred')
        RETURNING id
      `) as Array<{ id: string }>;
      if (!claimed[0]) {
        return c.json({ error: "Payout already released or in progress for this booking" }, 409);
      }
    } else {
      try {
        await sql`
          INSERT INTO payouts (booking_id, cleaner_id, amount, status)
          VALUES (${bookingId}, ${booking.cleaner_id}, ${breakdown.cleanerPayout}, 'processing')
        `;
      } catch {
        return c.json({ error: "Payout already released for this booking" }, 409);
      }
    }

    let transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: breakdown.cleanerPayout,
          currency: "usd",
          destination: cleaner.stripe_connect_id,
          transfer_group: `booking_${bookingId}`,
          metadata: { type: "payout", booking_id: bookingId },
        },
        { idempotencyKey: `payout_${bookingId}` },
      );
    } catch (err) {
      // Release the claim so a legitimate retry isn't permanently blocked.
      await sql`
        UPDATE payouts SET status = 'failed'
        WHERE booking_id = ${bookingId} AND status = 'processing'
      `;
      logger.error("payout-transfer failed", err);
      return c.json({ error: "payout_failed", message: "Payout transfer failed. Please try again." }, 502);
    }

    await sql`
      UPDATE payouts
      SET status = 'paid', stripe_transfer_id = ${transfer.id},
          amount = ${breakdown.cleanerPayout}, platform_fee = ${breakdown.platformFee},
          gross_amount = ${breakdown.grossAmount}, net_amount = ${breakdown.cleanerPayout},
          fee_rate = ${breakdown.feeRate}, tier_multiplier = ${tierMultiplier},
          paid_at = NOW()
      WHERE booking_id = ${bookingId}
    `;
    await sql`
      UPDATE bookings
      SET platform_fee = ${breakdown.platformFee}, cleaner_payout = ${breakdown.cleanerPayout}, updated_at = NOW()
      WHERE id = ${bookingId}
    `;
    const { platformFee, cleanerPayout } = { platformFee: breakdown.platformFee, cleanerPayout: breakdown.cleanerPayout };

    // Payout released -> notify cleaner.
    await sendNotification(sql, cleaner.user_id, {
      type: "payout_released",
      title: "Payout on the way",
      body: `Your payout of $${(cleanerPayout / 100).toFixed(2)} has been released.`,
      data: { href: "/earnings", bookingId },
    });

    await audit(sql, {
      action: "payout.released",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { cleanerPayout, platformFee, transferId: transfer.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    await serverTrack(c.env, "payout_released", c.get("user").clerkId, {
      bookingId,
      cleanerPayout,
      platformFee,
    });

    // Tip payout: a succeeded tip is transferred 100% to the cleaner (no
    // platform fee, no tier multiplier) as a SEPARATE transfer. Claim-then-act:
    // flip paid_out_at first so a retry can't double-transfer, then send. The
    // idempotency key (tip_${id}) makes the Stripe call itself safe on retry.
    let tipTransferId: string | null = null;
    let tipAmount = 0;
    try {
      const tipRows = (await sql`
        SELECT id, amount_cents FROM booking_tips
        WHERE booking_id = ${bookingId} AND status = 'succeeded' AND paid_out_at IS NULL
        LIMIT 1
      `) as Array<{ id: string; amount_cents: number }>;
      const tip = tipRows[0];
      if (tip) {
        const claimedTip = (await sql`
          UPDATE booking_tips
          SET paid_out_at = NOW(), visible_to_cleaner = TRUE, updated_at = NOW()
          WHERE id = ${tip.id} AND paid_out_at IS NULL
          RETURNING id
        `) as Array<{ id: string }>;
        if (claimedTip[0]) {
          try {
            const tipTransfer = await stripe.transfers.create(
              {
                amount: tip.amount_cents,
                currency: "usd",
                destination: cleaner.stripe_connect_id,
                transfer_group: `booking_${bookingId}`,
                metadata: { type: "tip", booking_id: bookingId, tip_id: tip.id },
              },
              { idempotencyKey: `tip_${tip.id}` },
            );
            tipTransferId = tipTransfer.id;
            tipAmount = tip.amount_cents;
            await audit(sql, {
              action: "tip.paid_out",
              actorClerkId: c.get("user").clerkId,
              targetType: "booking",
              targetId: bookingId,
              metadata: { tipId: tip.id, amount: tip.amount_cents, transferId: tipTransfer.id },
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            // Release the claim so a legitimate retry can pay the tip out later.
            await sql`
              UPDATE booking_tips SET paid_out_at = NULL, visible_to_cleaner = FALSE, updated_at = NOW()
              WHERE id = ${tip.id}
            `;
            logger.error("tip-transfer failed", err, { bookingId, tipId: tip.id });
          }
        }
      }
    } catch (err) {
      logger.error("tip payout lookup failed", err, { bookingId });
    }

    return c.json({ ok: true, transferId: transfer.id, cleanerPayout, platformFee, tipTransferId, tipAmount });
  }
);

// ---------------------------------------------------------------------------
// Admin: refund (full or partial)
// ---------------------------------------------------------------------------

const refundSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().int().positive().optional(), // cents; omit for full refund
  reason: z
    .enum(["duplicate", "fraudulent", "requested_by_customer"])
    .optional(),
  email: z.string().email().optional(),
});

paymentsRouter.post(
  "/refund",
  requireAuth,
  requireAdmin,
  zValidator("json", refundSchema),
  async (c) => {
    const { bookingId, amount, reason, email } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const bookings = (await sql`
      SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1
    `) as BookingRow[];
    const booking = bookings[0];
    if (!booking) return c.json({ error: "Booking not found" }, 404);
    if (!booking.stripe_payment_intent_id) {
      return c.json({ error: "No payment to refund" }, 400);
    }

    // Inspect the PaymentIntent: an uncaptured manual-capture auth cannot be
    // refunded (no funds were ever collected). It must be CANCELLED instead,
    // which voids the authorization.
    const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    const isUncaptured = pi.status === "requires_capture" ||
      pi.status === "requires_payment_method" ||
      pi.status === "requires_confirmation";

    // A full refund (no explicit amount, or amount ≥ authorized/total) drives the
    // booking to the terminal 'refunded' state. A partial refund leaves money on
    // the booking, so it must NOT move the booking to a terminal status.
    const capturedTotal = booking.total_price ?? pi.amount ?? 0;
    const isFullRefund = amount == null || amount >= capturedTotal;

    if (isUncaptured) {
      // Void the authorization rather than refund. Claim-then-act: transition to
      // a cancelled status before the Stripe call so a retry can't double-void.
      const cancelTarget = isValidTransition(booking.status, "cancelled_by_customer")
        ? "cancelled_by_customer"
        : "refunded";
      const claimedCancel = (await sql`
        UPDATE bookings SET status = ${cancelTarget}, updated_at = NOW()
        WHERE id = ${bookingId} AND status = ${booking.status}
        RETURNING id
      `) as Array<{ id: string }>;
      if (!claimedCancel[0]) {
        return c.json({ error: "Booking has already been cancelled or refunded" }, 409);
      }
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      } catch (err) {
        // Revert the claim so a legitimate retry isn't blocked.
        await sql`
          UPDATE bookings SET status = ${booking.status}, updated_at = NOW()
          WHERE id = ${bookingId} AND status = ${cancelTarget}
        `;
        logger.error("refund: PI cancel failed", err, { bookingId });
        return c.json({ error: "cancel_failed", message: "Could not void the authorization." }, 502);
      }
      await audit(sql, {
        action: "payment.refunded",
        actorClerkId: c.get("user").clerkId,
        targetType: "booking",
        targetId: bookingId,
        metadata: { voided: true, reason: reason ?? null, paymentIntentId: booking.stripe_payment_intent_id, status: cancelTarget },
        ipAddress: c.req.header("CF-Connecting-IP"),
        userAgent: c.req.header("User-Agent"),
        timestamp: new Date().toISOString(),
      });
      if (email) {
        try {
          const [langRow] = await sql`
            SELECT preferred_language FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
          ` as Array<{ preferred_language: string | null }>;
          const lang = langRow?.preferred_language ?? "en";
          const subject = et(lang, "refund.subject");
          await sendEmail(c.env.MAILERSEND_API_KEY, {
            to: email,
            subject,
            html: wrapBodyInTemplate(subject, et(lang, "refund.body", { bookingId }), lang),
          });
        } catch {
          // Non-fatal.
        }
      }
      return c.json({ ok: true, voided: true });
    }

    // Captured charge → refund path.
    if (isFullRefund) {
      if (!isValidTransition(booking.status, "refunded")) {
        return c.json({ error: `Cannot refund a booking in '${booking.status}' status` }, 409);
      }
      // Atomic lock before calling Stripe so a concurrent/retried request can't
      // also pass the check above and issue a second full refund.
      const claimed = (await sql`
        UPDATE bookings SET status = 'refunded', updated_at = NOW()
        WHERE id = ${bookingId} AND status = ${booking.status}
        RETURNING id
      `) as Array<{ id: string }>;
      if (!claimed[0]) {
        return c.json({ error: "Booking has already been refunded" }, 409);
      }
    }
    // Partial refund: intentionally leave booking status unchanged. Double-refund
    // protection for the partial path comes from the deterministic idempotency
    // key below.

    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.stripe_payment_intent_id,
        ...(amount ? { amount } : {}),
        ...(reason ? { reason } : {}),
      },
      { idempotencyKey: `refund_${bookingId}_${amount ?? "full"}` }
    );

    await audit(sql, {
      action: "payment.refunded",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { amount: amount ?? "full", partial: !isFullRefund, reason: reason ?? null, refundId: refund.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    if (email) {
      try {
        const [langRow] = await sql`
          SELECT preferred_language FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
        ` as Array<{ preferred_language: string | null }>;
        const lang = langRow?.preferred_language ?? "en";
        const subject = et(lang, "refund.subject");
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: email,
          subject,
          html: wrapBodyInTemplate(
            subject,
            et(lang, "refund.body", { bookingId }),
            lang,
          ),
        });
      } catch {
        // Non-fatal: refund already succeeded.
      }
    }

    return c.json({ ok: true, refundId: refund.id });
  }
);
