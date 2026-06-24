/**
 * Automation Engine — admin-triggered and cron-compatible operations.
 *
 * All endpoints return { ok, result } on success and log to automation_runs.
 * They can be called by admins from the console or by Cloudflare Cron Triggers
 * (which include an X-Cloudflare-Cron header).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { requireAuth } from "../middleware/auth";
import { requireAdminRole } from "../middleware/adminRoles";
import { initiateAssignment, processExpiredOffers } from "../lib/assignment";
import { sendNotification } from "../lib/notifications";
import { audit } from "../lib/audit";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";
import type { BookingRow } from "@sweepr/db";

export const adminAutomationRouter = new Hono<AppBindings>();

// All routes require auth + admin (ops or finance for most, super_admin/admin for settings).
adminAutomationRouter.use("*", requireAuth, requireAdminRole("super_admin", "admin", "ops", "finance"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logRun(
  sql: ReturnType<typeof getDb>,
  jobType: string,
  triggeredBy: string,
  fn: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const rows = await sql`
    INSERT INTO automation_runs (job_type, triggered_by)
    VALUES (${jobType}, ${triggeredBy})
    RETURNING id
  ` as { id: string }[];
  const runId = rows[0]?.id;

  try {
    const result = await fn();
    if (runId) {
      await sql`
        UPDATE automation_runs
        SET status = 'completed', finished_at = NOW(), result = ${JSON.stringify(result)}::jsonb
        WHERE id = ${runId}
      `;
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId) {
      await sql`
        UPDATE automation_runs
        SET status = 'failed', finished_at = NOW(), error_message = ${msg}
        WHERE id = ${runId}
      `;
    }
    throw err;
  }
}

// ─── Assignment ───────────────────────────────────────────────────────────────

/** Re-run cleaner assignment for a specific booking. */
adminAutomationRouter.post("/assign/:bookingId", async (c) => {
  const bookingId = c.req.param("bookingId");
  const sql = getDb(c.env.DATABASE_URL);
  const actorClerkId = c.get("user").clerkId;

  const result = await logRun(sql, "assignment.manual", actorClerkId, async () => {
    // Clear existing queue entries so we get a fresh ranking.
    await sql`
      UPDATE assignment_queue SET status = 'skipped'
      WHERE booking_id = ${bookingId} AND status = 'pending'
    `;
    await initiateAssignment(sql, bookingId);
    const queue = await sql`
      SELECT position, cleaner_id, status, score FROM assignment_queue
      WHERE booking_id = ${bookingId}
      ORDER BY position
    `;
    return { bookingId, queueLength: (queue as unknown[]).length };
  });

  await audit(sql, {
    action: "booking.status_changed",
    actorClerkId,
    targetType: "booking",
    targetId: bookingId,
    metadata: { automation: "manual_reassign" },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, result });
});

/** Process all expired offer queue entries (cron-compatible). */
adminAutomationRouter.post("/expire-offers", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const triggeredBy = c.req.header("X-Cloudflare-Cron") ? "cron" : c.get("user").clerkId;

  const result = await logRun(sql, "assignment.expire_offers", triggeredBy, async () => {
    await processExpiredOffers(sql);
    const expired = await sql`
      SELECT COUNT(*)::int AS count
      FROM assignment_queue
      WHERE status = 'expired' AND updated_at > NOW() - INTERVAL '5 minutes'
    ` as { count: number }[];
    return { expiredOffers: expired[0]?.count ?? 0 };
  });

  return c.json({ ok: true, result });
});

/** View current assignment queue. */
adminAutomationRouter.get("/queue", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT aq.booking_id, aq.cleaner_id, aq.position, aq.status, aq.score,
           aq.offered_at, aq.expires_at,
           b.service_type, b.scheduled_at, b.status AS booking_status,
           c.first_name || ' ' || c.last_name AS cleaner_name
    FROM assignment_queue aq
    JOIN bookings b ON b.id = aq.booking_id
    JOIN cleaners c ON c.id = aq.cleaner_id
    WHERE aq.status IN ('pending', 'offered')
      AND b.status NOT IN ('completed', 'cancelled_by_customer', 'cancelled_by_admin')
    ORDER BY b.scheduled_at ASC, aq.position ASC
    LIMIT 200
  `;
  return c.json({ queue: rows });
});

// ─── Payment Capture ──────────────────────────────────────────────────────────

/** Capture a Stripe payment intent for a completed booking. */
adminAutomationRouter.post("/capture/:bookingId", async (c) => {
  const bookingId = c.req.param("bookingId");
  const sql = getDb(c.env.DATABASE_URL);
  const actorClerkId = c.get("user").clerkId;
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  const result = await logRun(sql, "payment.capture_single", actorClerkId, async () => {
    const bookings = await sql`
      SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1
    ` as BookingRow[];
    const booking = bookings[0];
    if (!booking) throw new Error("Booking not found");
    if (!booking.stripe_payment_intent_id) throw new Error("No payment intent on booking");
    if (booking.status !== "completed") throw new Error("Booking is not completed");

    const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
    if (pi.status === "succeeded") {
      return { alreadyCaptured: true, paymentIntentId: pi.id };
    }
    if (pi.status !== "requires_capture") {
      throw new Error(`Cannot capture: PI status is '${pi.status}'`);
    }

    const captured = await stripe.paymentIntents.capture(pi.id);

    // Update payments table.
    await sql`
      UPDATE payments SET status = 'captured'
      WHERE booking_id = ${bookingId}
    `;

    // Mark capture queue item resolved.
    await sql`
      UPDATE payment_capture_queue
      SET status = 'captured', resolved_at = NOW()
      WHERE booking_id = ${bookingId}
    `;

    await audit(sql, {
      action: "payment.captured",
      actorClerkId,
      targetType: "booking",
      targetId: bookingId,
      metadata: { paymentIntentId: pi.id, amount: captured.amount },
      timestamp: new Date().toISOString(),
    });

    return { captured: true, paymentIntentId: pi.id, amount: captured.amount };
  });

  return c.json({ ok: true, result });
});

/** Batch-capture all completed bookings with uncaptured payment intents. */
adminAutomationRouter.post("/capture-completed", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const triggeredBy = c.req.header("X-Cloudflare-Cron") ? "cron" : c.get("user").clerkId;
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  const result = await logRun(sql, "payment.capture_batch", triggeredBy, async () => {
    // Find completed bookings with a PI and no captured payment.
    const pending = await sql`
      SELECT b.id, b.stripe_payment_intent_id, b.total_price
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
      WHERE b.status = 'completed'
        AND b.stripe_payment_intent_id IS NOT NULL
        AND p.id IS NULL
      LIMIT 100
    ` as { id: string; stripe_payment_intent_id: string; total_price: number }[];

    let captured = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
        if (pi.status === "succeeded") { skipped++; continue; }
        if (pi.status !== "requires_capture") { skipped++; continue; }
        await stripe.paymentIntents.capture(pi.id);
        await sql`UPDATE payments SET status = 'captured' WHERE booking_id = ${row.id}`;
        captured++;
      } catch (err) {
        logger.error("batch capture failed", err, { bookingId: row.id });
        failed++;
      }
    }

    return { processed: pending.length, captured, skipped, failed };
  });

  return c.json({ ok: true, result });
});

// ─── Payouts ──────────────────────────────────────────────────────────────────

const payoutSchema = z.object({
  bookingId: z.string().uuid(),
});

/** Release payout for a single completed booking. */
adminAutomationRouter.post(
  "/release-payout",
  zValidator("json", payoutSchema),
  async (c) => {
    const { bookingId } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const actorClerkId = c.get("user").clerkId;
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const result = await logRun(sql, "payout.single", actorClerkId, async () => {
      const bookings = await sql`
        SELECT b.*, c.stripe_connect_id
        FROM bookings b
        JOIN cleaners c ON c.id = b.cleaner_id
        WHERE b.id = ${bookingId} LIMIT 1
      ` as (BookingRow & { stripe_connect_id: string | null })[];
      const booking = bookings[0];
      if (!booking) throw new Error("Booking not found");
      if (!booking.stripe_connect_id) throw new Error("Cleaner has no Stripe Connect account");
      if (!booking.cleaner_payout) throw new Error("No payout amount on booking");

      const existing = await sql`
        SELECT id FROM payouts WHERE booking_id = ${bookingId} AND status = 'paid' LIMIT 1
      ` as { id: string }[];
      if (existing[0]) return { alreadyPaid: true };

      const transfer = await stripe.transfers.create({
        amount: booking.cleaner_payout,
        currency: "usd",
        destination: booking.stripe_connect_id,
        transfer_group: `booking_${bookingId}`,
      });

      await sql`
        UPDATE payouts SET status = 'paid', stripe_transfer_id = ${transfer.id}, paid_at = NOW()
        WHERE booking_id = ${bookingId}
      `;

      // Notify cleaner.
      const cleanerUser = await sql`
        SELECT u.id FROM cleaners c JOIN users u ON u.id = c.user_id WHERE c.id = ${booking.cleaner_id} LIMIT 1
      ` as { id: string }[];
      if (cleanerUser[0]) {
        await sendNotification(sql, cleanerUser[0].id, {
          type: "payout_released",
          title: "Payment released!",
          body: `$${(booking.cleaner_payout / 100).toFixed(2)} has been transferred to your account.`,
          data: { href: "/earnings" },
        });
      }

      await audit(sql, {
        action: "payout.released",
        actorClerkId,
        targetType: "booking",
        targetId: bookingId,
        metadata: { amount: booking.cleaner_payout, transferId: transfer.id },
        timestamp: new Date().toISOString(),
      });

      return { transferred: true, amount: booking.cleaner_payout, transferId: transfer.id };
    });

    return c.json({ ok: true, result });
  }
);

/** Batch release all pending payouts for completed, non-disputed bookings. */
adminAutomationRouter.post("/batch-payouts", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const triggeredBy = c.req.header("X-Cloudflare-Cron") ? "cron" : c.get("user").clerkId;
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

  const result = await logRun(sql, "payout.batch", triggeredBy, async () => {
    // Pending payouts on completed, non-disputed, non-open-dispute bookings.
    const pending = await sql`
      SELECT p.id, p.booking_id, p.amount, c.stripe_connect_id,
             b.cleaner_id, b.status AS booking_status
      FROM payouts p
      JOIN bookings b ON b.id = p.booking_id
      JOIN cleaners c ON c.id = b.cleaner_id
      WHERE p.status = 'pending'
        AND b.status = 'completed'
        AND c.stripe_connect_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM disputes d
          WHERE d.booking_id = b.id AND d.status = 'open'
        )
      LIMIT 200
    ` as { id: string; booking_id: string; amount: number; stripe_connect_id: string; cleaner_id: string }[];

    let released = 0;
    let failed = 0;
    const totalAmount = pending.reduce((s, r) => s + r.amount, 0);

    for (const row of pending) {
      try {
        const transfer = await stripe.transfers.create({
          amount: row.amount,
          currency: "usd",
          destination: row.stripe_connect_id,
          transfer_group: `booking_${row.booking_id}`,
        });
        await sql`
          UPDATE payouts SET status = 'paid', stripe_transfer_id = ${transfer.id}, paid_at = NOW()
          WHERE id = ${row.id}
        `;

        const cleanerUser = await sql`
          SELECT u.id FROM cleaners c JOIN users u ON u.id = c.user_id WHERE c.id = ${row.cleaner_id} LIMIT 1
        ` as { id: string }[];
        if (cleanerUser[0]) {
          await sendNotification(sql, cleanerUser[0].id, {
            type: "payout_released",
            title: "Payment released!",
            body: `$${(row.amount / 100).toFixed(2)} has been transferred to your account.`,
            data: { href: "/earnings" },
          });
        }
        released++;
      } catch (err) {
        logger.error("batch payout failed", err, { payoutId: row.id });
        failed++;
      }
    }

    return { processed: pending.length, released, failed, totalCents: totalAmount };
  });

  return c.json({ ok: true, result });
});

// ─── Reminders ────────────────────────────────────────────────────────────────

/** Send 24h-before reminders to customers and cleaners (cron-compatible). */
adminAutomationRouter.post("/send-reminders", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const triggeredBy = c.req.header("X-Cloudflare-Cron") ? "cron" : c.get("user").clerkId;

  const result = await logRun(sql, "notifications.reminders", triggeredBy, async () => {
    // Bookings scheduled between 23h and 25h from now, not yet reminded.
    const bookings = await sql`
      SELECT b.id, b.customer_id, b.cleaner_id, b.service_type, b.scheduled_at,
             b.total_price,
             u_cust.id AS customer_user_id,
             u_clean.id AS cleaner_user_id
      FROM bookings b
      JOIN customers cust ON cust.id = b.customer_id
      JOIN users u_cust ON u_cust.id = cust.user_id
      LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
      LEFT JOIN users u_clean ON u_clean.id = cl.user_id
      WHERE b.status IN ('cleaner_accepted', 'confirmed', 'scheduled')
        AND b.scheduled_at BETWEEN NOW() + INTERVAL '23 hours'
                                AND NOW() + INTERVAL '25 hours'
        AND NOT EXISTS (
          SELECT 1 FROM booking_reminders br
          WHERE br.booking_id = b.id AND br.reminder_type = '24h_customer'
        )
      LIMIT 100
    ` as {
      id: string; customer_user_id: string; cleaner_user_id: string | null;
      service_type: string; scheduled_at: string;
    }[];

    let sent = 0;
    for (const b of bookings) {
      const scheduledStr = new Date(b.scheduled_at).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      });

      // Customer reminder.
      await sendNotification(sql, b.customer_user_id, {
        type: "booking_reminder",
        title: "Your clean is tomorrow",
        body: `Reminder: your ${b.service_type} clean is scheduled for ${scheduledStr}.`,
        data: { href: `/bookings/${b.id}` },
      });
      await sql`
        INSERT INTO booking_reminders (booking_id, reminder_type)
        VALUES (${b.id}, '24h_customer')
        ON CONFLICT DO NOTHING
      `;

      // Cleaner reminder.
      if (b.cleaner_user_id) {
        await sendNotification(sql, b.cleaner_user_id, {
          type: "job_reminder",
          title: "Job tomorrow",
          body: `You have a ${b.service_type} job scheduled for ${scheduledStr}.`,
          data: { href: `/jobs/${b.id}` },
        });
        await sql`
          INSERT INTO booking_reminders (booking_id, reminder_type)
          VALUES (${b.id}, '24h_cleaner')
          ON CONFLICT DO NOTHING
        `;
      }
      sent++;
    }

    return { remindersProcessed: bookings.length, notificationsSent: sent * 2 };
  });

  return c.json({ ok: true, result });
});

// ─── No-show Detection ────────────────────────────────────────────────────────

/** Flag bookings where the cleaner hasn't started route 2h past scheduled time. */
adminAutomationRouter.post("/noshow-check", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const triggeredBy = c.req.header("X-Cloudflare-Cron") ? "cron" : c.get("user").clerkId;

  const result = await logRun(sql, "ops.noshow_check", triggeredBy, async () => {
    const stale = await sql`
      SELECT b.id, b.customer_id, b.cleaner_id, b.scheduled_at, b.service_type,
             u_cust.id AS customer_user_id
      FROM bookings b
      JOIN customers cust ON cust.id = b.customer_id
      JOIN users u_cust ON u_cust.id = cust.user_id
      WHERE b.status IN ('cleaner_accepted', 'confirmed', 'scheduled')
        AND b.scheduled_at < NOW() - INTERVAL '2 hours'
        AND b.day_status IS NULL
      LIMIT 50
    ` as { id: string; customer_user_id: string; service_type: string; scheduled_at: string }[];

    // Notify admins.
    const admins = await sql`
      SELECT id FROM users WHERE role IN ('admin', 'super_admin')
    ` as { id: string }[];

    for (const b of stale) {
      for (const admin of admins) {
        await sendNotification(sql, admin.id, {
          type: "noshow_alert",
          title: "Possible no-show",
          body: `Booking ${b.id.slice(0, 8)} was scheduled ${new Date(b.scheduled_at).toLocaleString()} — cleaner hasn't started.`,
          data: { href: `/jobs/${b.id}` },
        });
      }
      // Notify customer.
      await sendNotification(sql, b.customer_user_id, {
        type: "booking_delayed",
        title: "Your cleaner is running late",
        body: "We're looking into it and will update you shortly.",
        data: { href: `/bookings/${b.id}` },
      });
    }

    return { noshowsDetected: stale.length };
  });

  return c.json({ ok: true, result });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

/** Automation queue dashboard — counts of pending work. */
adminAutomationRouter.get("/dashboard", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch { return fallback; }
  };

  const [assigns, captures, payouts, reminders, noshows, recentRuns] = await Promise.all([
    settle(sql`
      SELECT COUNT(*)::int AS pending
      FROM assignment_queue aq
      JOIN bookings b ON b.id = aq.booking_id
      WHERE aq.status IN ('pending','offered')
        AND b.status NOT IN ('completed','cancelled_by_customer','cancelled_by_admin')
    `, [{ pending: 0 }] as { pending: number }[]),

    settle(sql`
      SELECT COUNT(*)::int AS pending
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'captured'
      WHERE b.status = 'completed'
        AND b.stripe_payment_intent_id IS NOT NULL
        AND p.id IS NULL
    `, [{ pending: 0 }] as { pending: number }[]),

    settle(sql`
      SELECT COUNT(*)::int AS pending, COALESCE(SUM(amount),0)::bigint AS total_cents
      FROM payouts WHERE status = 'pending'
    `, [{ pending: 0, total_cents: 0 }] as { pending: number; total_cents: number }[]),

    settle(sql`
      SELECT COUNT(*)::int AS due
      FROM bookings b
      WHERE b.status IN ('cleaner_accepted','confirmed','scheduled')
        AND b.scheduled_at BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
        AND NOT EXISTS (
          SELECT 1 FROM booking_reminders br
          WHERE br.booking_id = b.id AND br.reminder_type = '24h_customer'
        )
    `, [{ due: 0 }] as { due: number }[]),

    settle(sql`
      SELECT COUNT(*)::int AS count
      FROM bookings
      WHERE status IN ('cleaner_accepted','confirmed','scheduled')
        AND scheduled_at < NOW() - INTERVAL '2 hours'
        AND day_status IS NULL
    `, [{ count: 0 }] as { count: number }[]),

    settle(sql`
      SELECT job_type, triggered_by, status, started_at, finished_at, result, error_message
      FROM automation_runs
      ORDER BY started_at DESC LIMIT 20
    `, [] as unknown[]),
  ]);

  return c.json({
    pendingAssignments: (assigns as { pending: number }[])[0]?.pending ?? 0,
    pendingCaptures: (captures as { pending: number }[])[0]?.pending ?? 0,
    pendingPayouts: (payouts as { pending: number; total_cents: number }[])[0]?.pending ?? 0,
    pendingPayoutsCents: (payouts as { pending: number; total_cents: number }[])[0]?.total_cents ?? 0,
    remindersDue: (reminders as { due: number }[])[0]?.due ?? 0,
    possibleNoshows: (noshows as { count: number }[])[0]?.count ?? 0,
    recentRuns,
  });
});

/** Get automation run history. */
adminAutomationRouter.get("/runs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
  const rows = await sql`
    SELECT * FROM automation_runs
    ORDER BY started_at DESC
    LIMIT ${limit}
  `;
  return c.json({ runs: rows });
});
