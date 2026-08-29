/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId, getCustomerByUserId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { requireAuth } from "../middleware/auth";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import { isTeamFlagEnabled } from "../lib/crew/crewConfig";
import { splitPoolCents } from "../lib/crew/crewPayout";
import type { AppBindings } from "../types";

/**
 * How a customer tip is divided across a crew. EQUAL today; the fraction vector
 * is computed here so PROPORTIONAL_TO_EARNINGS (weight by earnings_cents) is a
 * drop-in later. Fractions are primary(LEAD)-first and sum to 1; splitPoolCents
 * conserves the cents exactly (LEAD absorbs the rounding remainder).
 */
export type TipSplitStrategy = "EQUAL" | "PROPORTIONAL_TO_EARNINGS";
const TIP_SPLIT_STRATEGY: TipSplitStrategy = "EQUAL";

export function tipSplitFractions(
  strategy: TipSplitStrategy,
  members: Array<{ earnings_cents: number }>,
): number[] {
  const n = members.length;
  if (n === 0) return [];
  if (strategy === "PROPORTIONAL_TO_EARNINGS") {
    const total = members.reduce((a, m) => a + Math.max(0, m.earnings_cents), 0);
    if (total > 0) return members.map((m) => Math.max(0, m.earnings_cents) / total);
  }
  return Array.from({ length: n }, () => 1 / n); // EQUAL (and the fallback)
}

export const tipsRouter = new Hono<AppBindings>();

// Tips are a SEPARATE payment from the booking, captured immediately, and paid
// out 100% to the cleaner (no platform fee, no tier multiplier). They must NOT
// touch the booking PaymentIntent, and stay invisible to the cleaner until the
// booking payout is released (visible_to_cleaner).

const TIP_WINDOW_DAYS = 3;

const createTipSchema = z.object({
  bookingId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(50000),
});

tipsRouter.post("/", requireAuth, zValidator("json", createTipSchema), async (c) => {
  const { bookingId, amountCents } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ error: "Forbidden" }, 403);

  const bookingRows = (await sql`
    SELECT id, customer_id, cleaner_id, status, completed_at, crew_status
    FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as Array<{
    id: string;
    customer_id: string;
    cleaner_id: string | null;
    status: string;
    completed_at: string | null;
    crew_status: string | null;
  }>;
  const booking = bookingRows[0];
  if (!booking) return c.json({ error: "Booking not found" }, 404);
  if (booking.customer_id !== customer.id) return c.json({ error: "Forbidden" }, 403);
  if (booking.status !== "completed" || !booking.completed_at) {
    return c.json({ error: "Only completed bookings can be tipped" }, 409);
  }
  const ageMs = Date.now() - new Date(booking.completed_at).getTime();
  if (ageMs > TIP_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return c.json(
      { error: "tip_window_closed", message: `Tips can only be added within ${TIP_WINDOW_DAYS} days of completion` },
      409,
    );
  }
  if (!booking.cleaner_id) return c.json({ error: "No cleaner to tip" }, 400);

  // ─── Crew booking: split the single customer tip across present crew ───────
  // One PaymentIntent for the full amount (the customer pays once); one
  // booking_tips row PER completed crew member, each holding that member's
  // share of the SAME PI. The webhook settles every row sharing the PI id, and
  // the crew payout path (payments.ts) transfers each row to its member — so a
  // crew tip is NEVER 100% to the lead.
  if (booking.crew_status && (await isTeamFlagEnabled(sql, "enabled"))) {
    const members = (await sql`
      SELECT id, cleaner_id, role, seat_index, earnings_cents
      FROM booking_crew_assignments
      WHERE booking_id = ${bookingId} AND status = 'COMPLETED' AND cleaner_id IS NOT NULL
      ORDER BY (role = 'LEAD') DESC, seat_index ASC
    `) as Array<{ id: string; cleaner_id: string; role: string; seat_index: number; earnings_cents: number }>;
    if (members.length === 0) return c.json({ error: "No crew to tip" }, 400);

    // Any live (pending/succeeded) tip row for this booking blocks a new tip.
    const live = (await sql`
      SELECT 1 FROM booking_tips
      WHERE booking_id = ${bookingId} AND status IN ('pending', 'succeeded') LIMIT 1
    `) as Array<unknown>;
    if (live[0]) return c.json({ error: "A tip already exists for this booking" }, 409);

    const fractions = tipSplitFractions(TIP_SPLIT_STRATEGY, members);
    const shares = splitPoolCents(amountCents, fractions);

    // Insert (or revive a failed/refunded) row per member. Claim-then-act: the
    // (booking_id, cleaner_id) UNIQUE is the per-member lock; a live row would
    // fail the WHERE and not be returned.
    const tipIds: string[] = [];
    for (let i = 0; i < members.length; i++) {
      const share = shares[i] ?? 0;
      if (share <= 0) continue; // never create a zero-amount tip row
      const claimed = (await sql`
        INSERT INTO booking_tips (booking_id, customer_id, cleaner_id, amount_cents, status)
        VALUES (${bookingId}, ${customer.id}, ${members[i].cleaner_id}, ${share}, 'pending')
        ON CONFLICT (booking_id, cleaner_id) DO UPDATE
          SET amount_cents = EXCLUDED.amount_cents, status = 'pending', updated_at = NOW()
          WHERE booking_tips.status IN ('failed', 'refunded')
        RETURNING id
      `) as Array<{ id: string }>;
      if (claimed[0]) tipIds.push(claimed[0].id);
    }
    if (tipIds.length === 0) {
      return c.json({ error: "A tip already exists for this booking" }, 409);
    }

    let intent;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          metadata: {
            type: "tip",
            booking_id: bookingId,
            crew: "true",
            tip_ids: tipIds.join(","),
            clerkId: c.get("user").clerkId,
          },
        },
        { idempotencyKey: `tip_pi_crew_${bookingId}` },
      );
    } catch (err) {
      await sql`
        UPDATE booking_tips SET status = 'failed', updated_at = NOW()
        WHERE id = ANY(${tipIds})
      `;
      logger.error("crew tip intent create failed", err, { bookingId, tipIds });
      return c.json({ error: "tip_failed", message: "Could not start the tip payment. Please try again." }, 502);
    }

    await sql`
      UPDATE booking_tips SET stripe_payment_intent_id = ${intent.id}, updated_at = NOW()
      WHERE id = ANY(${tipIds})
    `;

    await audit(sql, {
      action: "tip.created",
      actorClerkId: c.get("user").clerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { crew: true, tipIds, amountCents, strategy: TIP_SPLIT_STRATEGY, intentId: intent.id },
      ipAddress: c.req.header("CF-Connecting-IP"),
      userAgent: c.req.header("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    return c.json({ clientSecret: intent.client_secret, id: intent.id, tipIds, amountCents, crew: true });
  }

  // Claim-then-act: the tip row (UNIQUE on booking_id) is the lock. Only insert,
  // or revive a previously failed/refunded attempt — never overwrite a pending
  // or succeeded tip. If nothing is returned, a live tip already exists.
  const claimed = (await sql`
    INSERT INTO booking_tips (booking_id, customer_id, cleaner_id, amount_cents, status)
    VALUES (${bookingId}, ${customer.id}, ${booking.cleaner_id}, ${amountCents}, 'pending')
    ON CONFLICT (booking_id, cleaner_id) DO UPDATE
      SET amount_cents = EXCLUDED.amount_cents, status = 'pending', updated_at = NOW()
      WHERE booking_tips.status IN ('failed', 'refunded')
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) {
    return c.json({ error: "A tip already exists for this booking" }, 409);
  }
  const tipId = claimed[0].id;

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { type: "tip", booking_id: bookingId, tip_id: tipId, clerkId: c.get("user").clerkId },
      },
      { idempotencyKey: `tip_pi_${tipId}` },
    );
  } catch (err) {
    await sql`UPDATE booking_tips SET status = 'failed', updated_at = NOW() WHERE id = ${tipId}`;
    logger.error("tip intent create failed", err, { bookingId, tipId });
    return c.json({ error: "tip_failed", message: "Could not start the tip payment. Please try again." }, 502);
  }

  await sql`
    UPDATE booking_tips SET stripe_payment_intent_id = ${intent.id}, updated_at = NOW()
    WHERE id = ${tipId}
  `;

  await audit(sql, {
    action: "tip.created",
    actorClerkId: c.get("user").clerkId,
    targetType: "booking",
    targetId: bookingId,
    metadata: { tipId, amountCents, intentId: intent.id },
    ipAddress: c.req.header("CF-Connecting-IP"),
    userAgent: c.req.header("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  return c.json({ clientSecret: intent.client_secret, id: intent.id, tipId, amountCents });
});

/** Tip status for a booking (customer UI). */
tipsRouter.get("/booking/:bookingId", requireAuth, async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const bookingId = c.req.param("bookingId");

  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const customer = await getCustomerByUserId(sql, user.id);
  if (!customer) return c.json({ error: "Forbidden" }, 403);

  const rows = (await sql`
    SELECT t.id, t.amount_cents, t.status, t.created_at
    FROM booking_tips t
    JOIN bookings b ON b.id = t.booking_id
    WHERE t.booking_id = ${bookingId} AND b.customer_id = ${customer.id}
    LIMIT 1
  `) as Array<{ id: string; amount_cents: number; status: string; created_at: string }>;

  if (!rows[0]) return c.json({ tip: null });
  return c.json({ tip: rows[0] });
});
