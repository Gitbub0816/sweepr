import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import type { BookingRow, CleanerRow } from "@sweepr/db";

const PLATFORM_FEE_RATE = 0.2; // 20% platform fee → 80% cleaner payout

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

const intentSchema = z.object({
  amount: z.number().int().min(50), // cents
  currency: z.string().default("usd"),
  bookingId: z.string().optional(),
});

export const paymentsRouter = new Hono<AppBindings>();

paymentsRouter.post(
  "/create-intent",
  requireAuth,
  zValidator("json", intentSchema),
  async (c) => {
    const { amount, currency, bookingId } = c.req.valid("json");
    const user = c.get("user");
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        clerkId: user.clerkId,
        bookingId: bookingId ?? "",
      },
    });

    return c.json({ clientSecret: intent.client_secret, id: intent.id });
  }
);

// ---------------------------------------------------------------------------
// Admin: release payout to cleaner's Connect account
// ---------------------------------------------------------------------------

const releaseSchema = z.object({ bookingId: z.string() });

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

    const platformFee = Math.round(booking.total_price * PLATFORM_FEE_RATE);
    const cleanerPayout = booking.total_price - platformFee;

    const transfer = await stripe.transfers.create({
      amount: cleanerPayout, // cents
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
            amount = ${cleanerPayout}, paid_at = NOW()
        WHERE booking_id = ${bookingId}
      `;
    } else {
      await sql`
        INSERT INTO payouts (booking_id, cleaner_id, amount, status, stripe_transfer_id, paid_at)
        VALUES (${bookingId}, ${booking.cleaner_id}, ${cleanerPayout}, 'paid', ${transfer.id}, NOW())
      `;
    }
    await sql`
      UPDATE bookings
      SET platform_fee = ${platformFee}, cleaner_payout = ${cleanerPayout}, updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    return c.json({ ok: true, transferId: transfer.id, cleanerPayout, platformFee });
  }
);

// ---------------------------------------------------------------------------
// Admin: refund (full or partial)
// ---------------------------------------------------------------------------

const refundSchema = z.object({
  bookingId: z.string(),
  amount: z.number().int().positive().optional(), // cents; omit for full refund
  email: z.string().email().optional(),
});

paymentsRouter.post(
  "/refund",
  requireAuth,
  requireAdmin,
  zValidator("json", refundSchema),
  async (c) => {
    const { bookingId, amount, email } = c.req.valid("json");
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
    });

    await sql`
      UPDATE bookings SET status = 'refunded', updated_at = NOW()
      WHERE id = ${bookingId}
    `;

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
