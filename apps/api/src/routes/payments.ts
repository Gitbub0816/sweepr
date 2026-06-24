import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { sendNotification } from "../lib/notifications";
import { requireAuth } from "../middleware/auth";
import { loadFeeSettings, calculatePayout, getTierMultiplier } from "../lib/payoutEngine";
import { audit } from "../lib/audit";
import { serverTrack } from "../lib/posthog";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";


const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const intentSchema = z.object({
  bookingId: z.string().uuid(),
});

export const paymentsRouter = new Hono<AppBindings>();

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

    // Prevent paying for already-paid, cancelled, or refunded bookings.
    if (["booked", "confirmed", "completed", "cancelled", "refunded"].includes(booking.status)) {
      return c.json({ error: `Booking is already in '${booking.status}' state` }, 400);
    }

    // Idempotency: return existing intent if already created within 24 h.
    if (booking.stripe_payment_intent_id && booking.stripe_payment_intent_created_at) {
      const age = Date.now() - new Date(booking.stripe_payment_intent_created_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        const existing = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        if (existing.status !== "canceled") {
          return c.json({ clientSecret: existing.client_secret, id: existing.id });
        }
      }
    }

    if (!booking.total_price || booking.total_price < 50) {
      return c.json({ error: "Booking has no valid price" }, 400);
    }

    const intent = await stripe.paymentIntents.create({
      amount: booking.total_price,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        clerkId: user.clerkId,
        bookingId,
      },
    });

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

    return c.json({ clientSecret: intent.client_secret, id: intent.id });
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

    const feeSettings = await loadFeeSettings(sql);
    const cleanerTier = (cleaner as unknown as Record<string, unknown>).tier as string ?? "standard";
    const tierMultiplier = await getTierMultiplier(sql, cleanerTier);
    const breakdown = calculatePayout(booking.total_price, feeSettings, tierMultiplier);

    const transfer = await stripe.transfers.create({
      amount: breakdown.cleanerPayout,
      currency: "usd",
      destination: cleaner.stripe_connect_id,
      transfer_group: `booking_${bookingId}`,
    });

    const existing = (await sql`
      SELECT id FROM payouts WHERE booking_id = ${bookingId} LIMIT 1
    `) as Array<{ id: string }>;
    if (existing[0]) {
      await sql`
        UPDATE payouts
        SET status = 'paid', stripe_transfer_id = ${transfer.id},
            amount = ${breakdown.cleanerPayout}, platform_fee = ${breakdown.platformFee},
            gross_amount = ${breakdown.grossAmount}, net_amount = ${breakdown.cleanerPayout},
            fee_rate = ${breakdown.feeRate}, tier_multiplier = ${tierMultiplier},
            paid_at = NOW()
        WHERE booking_id = ${bookingId}
      `;
    } else {
      await sql`
        INSERT INTO payouts (
          booking_id, cleaner_id, amount, status, stripe_transfer_id, paid_at,
          platform_fee, gross_amount, net_amount, fee_rate, tier_multiplier
        ) VALUES (
          ${bookingId}, ${booking.cleaner_id}, ${breakdown.cleanerPayout}, 'paid',
          ${transfer.id}, NOW(), ${breakdown.platformFee}, ${breakdown.grossAmount},
          ${breakdown.cleanerPayout}, ${breakdown.feeRate}, ${tierMultiplier}
        )
      `;
    }
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

    return c.json({ ok: true, transferId: transfer.id, cleanerPayout, platformFee });
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

    const refund = await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      ...(amount ? { amount } : {}),
      ...(reason ? { reason } : {}),
    });

    await sql`
      UPDATE bookings SET status = 'refunded', updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    await audit(sql, {
      action: "payment.refunded",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { amount: amount ?? "full", reason: reason ?? null, refundId: refund.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    if (email) {
      try {
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: email,
          subject: "Your Sweepr refund has been processed",
          html: `<p>Your refund for booking ${bookingId} has been processed and will appear on your statement within 5–10 business days.</p>`,
        });
      } catch {
        // Non-fatal: refund already succeeded.
      }
    }

    return c.json({ ok: true, refundId: refund.id });
  }
);
