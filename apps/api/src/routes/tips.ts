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
import type { AppBindings } from "../types";

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
    SELECT id, customer_id, cleaner_id, status, completed_at
    FROM bookings WHERE id = ${bookingId} LIMIT 1
  `) as Array<{
    id: string;
    customer_id: string;
    cleaner_id: string | null;
    status: string;
    completed_at: string | null;
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

  // Claim-then-act: the tip row (UNIQUE on booking_id) is the lock. Only insert,
  // or revive a previously failed/refunded attempt — never overwrite a pending
  // or succeeded tip. If nothing is returned, a live tip already exists.
  const claimed = (await sql`
    INSERT INTO booking_tips (booking_id, customer_id, cleaner_id, amount_cents, status)
    VALUES (${bookingId}, ${customer.id}, ${booking.cleaner_id}, ${amountCents}, 'pending')
    ON CONFLICT (booking_id) DO UPDATE
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
