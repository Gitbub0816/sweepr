/**
 * Cleaner-facing endpoints for the full-featured cleaner dashboard.
 * All routes require auth + verified cleaner identity.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { handleOfferResponse } from "../lib/assignment";
import type { Context } from "hono";
import type { AppBindings } from "../types";

export const cleanerDashboardRouter = new Hono<AppBindings>();

cleanerDashboardRouter.use("*", requireAuth);

// ─── Helper: get cleaner + user from clerkId ─────────────────────────────────

async function getCleanerCtx(sql: ReturnType<typeof getDb>, clerkId: string) {
  const rows = await sql`
    SELECT u.id AS user_id, cl.id AS cleaner_id, cl.tier, cl.stripe_connect_id
    FROM users u
    JOIN cleaners cl ON cl.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  ` as Array<{ user_id: string; cleaner_id: string; tier: string | null; stripe_connect_id: string | null }>;
  return rows[0] ?? null;
}

// ─── Dashboard overview stats ─────────────────────────────────────────────────

cleanerDashboardRouter.get("/dashboard", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [upcoming, completed, earningsMonth, pendingPayout, rating, nextJob] =
    await Promise.all([
      sql`SELECT COUNT(*) n FROM bookings WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('confirmed','cleaner_accepted') AND scheduled_at > NOW()`,
      sql`SELECT COUNT(*) n FROM bookings WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'completed' AND completed_at >= ${monthStart}`,
      sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at >= ${monthStart}`,
      sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'pending'`,
      sql`SELECT COALESCE(AVG(rating),0) avg, COUNT(*) cnt FROM reviews WHERE cleaner_id = ${ctx.cleaner_id}`,
      sql`
        SELECT b.scheduled_at, a.street, a.city
        FROM bookings b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.cleaner_id = ${ctx.cleaner_id}
          AND b.status IN ('confirmed','cleaner_accepted')
          AND b.scheduled_at > NOW()
        ORDER BY b.scheduled_at ASC LIMIT 1
      `,
    ]);

  const stripeAcc = ctx.stripe_connect_id
    ? await sql`SELECT charges_enabled, payouts_enabled FROM stripe_connected_accounts WHERE stripe_account_id = ${ctx.stripe_connect_id} LIMIT 1` as Array<{ charges_enabled: boolean; payouts_enabled: boolean }>
    : [];

  const stripeConnected = stripeAcc[0]?.charges_enabled && stripeAcc[0]?.payouts_enabled;
  const nj = (nextJob as Array<{ scheduled_at: string; street: string | null; city: string | null }>)[0];

  return c.json({
    upcomingJobs:        Number((upcoming as Array<{ n: number }>)[0]?.n ?? 0),
    completedThisMonth:  Number((completed as Array<{ n: number }>)[0]?.n ?? 0),
    earningsThisMonth:   Number((earningsMonth as Array<{ v: number }>)[0]?.v ?? 0),
    pendingPayout:       Number((pendingPayout as Array<{ v: number }>)[0]?.v ?? 0),
    rating:              Number((rating as Array<{ avg: number; cnt: number }>)[0]?.avg ?? 0),
    reviewCount:         Number((rating as Array<{ avg: number; cnt: number }>)[0]?.cnt ?? 0),
    tier:                ctx.tier ?? "standard",
    stripeConnected:     !!stripeConnected,
    nextJobAt:           nj?.scheduled_at ?? null,
    nextJobAddress:      nj ? `${nj.street ?? ""} ${nj.city ?? ""}`.trim() : null,
  });
});

// ─── My jobs ─────────────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/my-jobs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const { limit = "20", offset = "0", status } = c.req.query();

  // Two explicit queries instead of an inlined conditional sql`` fragment — the
  // empty-fragment form produced a "syntax error at or near $2" on the driver.
  const jobs = status
    ? await sql`
        SELECT b.id, b.status, b.day_status, b.service_type, b.scheduled_at,
               b.total_price, b.cleaner_payout, b.bedrooms, b.bathrooms,
               a.city AS address_city, a.state AS address_state
        FROM bookings b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.cleaner_id = ${ctx.cleaner_id} AND b.status = ${status}
        ORDER BY b.scheduled_at DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `
    : await sql`
        SELECT b.id, b.status, b.day_status, b.service_type, b.scheduled_at,
               b.total_price, b.cleaner_payout, b.bedrooms, b.bathrooms,
               a.city AS address_city, a.state AS address_state
        FROM bookings b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.cleaner_id = ${ctx.cleaner_id}
        ORDER BY b.scheduled_at DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `;

  return c.json({ jobs });
});

// ─── Job-offer response (accept / decline by booking id) ─────────────────────
// The job board lists bookings offered to this cleaner; these routes resolve
// the cleaner's pending assignment_queue row for the booking and run the
// canonical handleOfferResponse flow (insurance gate, cascade, notifications).
async function respondToOffer(
  c: Context<AppBindings>,
  response: "accepted" | "declined",
) {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);
  const bookingId = c.req.param("id");
  if (!bookingId) return c.json({ error: "Missing job id" }, 400);

  const offers = (await sql`
    SELECT id FROM assignment_queue
    WHERE booking_id = ${bookingId} AND cleaner_id = ${ctx.cleaner_id}
      AND status IN ('pending', 'offered')
    LIMIT 1
  `) as Array<{ id: string }>;
  if (!offers[0]) return c.json({ error: "No active offer for this job" }, 404);

  await handleOfferResponse(sql, bookingId, ctx.cleaner_id, response);
  return c.json({ ok: true, response });
}

cleanerDashboardRouter.post("/jobs/:id/accept", (c) => respondToOffer(c, "accepted"));
cleanerDashboardRouter.post("/jobs/:id/decline", (c) => respondToOffer(c, "declined"));

// ─── Earnings summary ─────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/earnings", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const now = new Date();
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

  const [week, month, lastMonth, allTime, pending, nextPayout, recent] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at >= ${weekStart.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at >= ${monthStart.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at BETWEEN ${lastMonthStart.toISOString()} AND ${lastMonthEnd.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred')`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'pending'`,
    sql`SELECT scheduled_for FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'scheduled' ORDER BY scheduled_for ASC LIMIT 1`,
    sql`SELECT p.paid_at AS date, p.amount, p.status, p.booking_id FROM payouts p WHERE p.cleaner_id = ${ctx.cleaner_id} ORDER BY p.created_at DESC LIMIT 10`,
  ]);

  const stripeAcc = ctx.stripe_connect_id
    ? await sql`SELECT charges_enabled, payouts_enabled, onboarding_url FROM stripe_connected_accounts WHERE stripe_account_id = ${ctx.stripe_connect_id} LIMIT 1` as Array<{ charges_enabled: boolean; payouts_enabled: boolean; onboarding_url: string | null }>
    : [];

  return c.json({
    thisWeek:        Number((week as Array<{ v: number }>)[0]?.v ?? 0),
    thisMonth:       Number((month as Array<{ v: number }>)[0]?.v ?? 0),
    lastMonth:       Number((lastMonth as Array<{ v: number }>)[0]?.v ?? 0),
    allTime:         Number((allTime as Array<{ v: number }>)[0]?.v ?? 0),
    pendingPayout:   Number((pending as Array<{ v: number }>)[0]?.v ?? 0),
    nextPayoutDate:  (nextPayout as Array<{ scheduled_for: string | null }>)[0]?.scheduled_for ?? null,
    stripeConnected: !!(stripeAcc[0]?.charges_enabled && stripeAcc[0]?.payouts_enabled),
    onboardingUrl:   stripeAcc[0]?.onboarding_url ?? null,
    recent:          recent,
  });
});

// ─── Performance stats ────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/performance-stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const [completion, ontime, rating, disputes, offered, accepted, reviews, tiers] =
    await Promise.all([
      sql`SELECT COUNT(*) total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) done FROM bookings WHERE cleaner_id=${ctx.cleaner_id} AND status IN ('completed','cancelled_by_cleaner')`,
      sql`SELECT COUNT(*) total, SUM(CASE WHEN day_status='arrived' AND arrival_verified_at <= scheduled_at + INTERVAL '15 minutes' THEN 1 ELSE 0 END) ontime FROM bookings WHERE cleaner_id=${ctx.cleaner_id} AND status='completed'`,
      sql`SELECT COALESCE(AVG(rating),0) avg, COUNT(*) cnt FROM reviews WHERE cleaner_id=${ctx.cleaner_id}`,
      sql`SELECT COUNT(*) n FROM disputes d JOIN bookings b ON b.id=d.booking_id WHERE b.cleaner_id=${ctx.cleaner_id}`,
      sql`SELECT COUNT(*) n FROM bookings WHERE cleaner_id=${ctx.cleaner_id} AND status IN ('offered_to_cleaner','cleaner_accepted','confirmed','completed','cancelled_by_cleaner')`,
      sql`SELECT COUNT(*) n FROM bookings WHERE cleaner_id=${ctx.cleaner_id} AND status IN ('cleaner_accepted','confirmed','completed')`,
      sql`SELECT rating, comment, created_at FROM reviews WHERE cleaner_id=${ctx.cleaner_id} ORDER BY created_at DESC LIMIT 5`,
      sql`SELECT tier, multiplier FROM cleaner_tier_multipliers ORDER BY multiplier`,
    ]);

  const totalJobs  = Number((completion as Array<{ total: number; done: number }>)[0]?.total ?? 0);
  const doneJobs   = Number((completion as Array<{ total: number; done: number }>)[0]?.done ?? 0);
  const ontimeT    = Number((ontime as Array<{ total: number; ontime: number }>)[0]?.total ?? 0);
  const ontimeD    = Number((ontime as Array<{ total: number; ontime: number }>)[0]?.ontime ?? 0);
  const totalOff   = Number((offered as Array<{ n: number }>)[0]?.n ?? 0);
  const totalAcc   = Number((accepted as Array<{ n: number }>)[0]?.n ?? 0);
  const totalDisp  = Number((disputes as Array<{ n: number }>)[0]?.n ?? 0);

  const completionRate = totalJobs > 0 ? (doneJobs / totalJobs) * 100 : 0;
  const onTimeRate     = ontimeT > 0 ? (ontimeD / ontimeT) * 100 : 0;
  const acceptanceRate = totalOff > 0 ? (totalAcc / totalOff) * 100 : 0;
  const disputeRate    = totalJobs > 0 ? (totalDisp / totalJobs) * 100 : 0;
  const avgRating      = Number((rating as Array<{ avg: number }>)[0]?.avg ?? 0);

  // Tier progression — based on completion rate + rating
  const score = completionRate * 0.4 + Math.min(avgRating / 5 * 100, 100) * 0.4 + Math.min(acceptanceRate, 100) * 0.2;
  const tierList = tiers as Array<{ tier: string; multiplier: number }>;
  const currentTierIdx = tierList.findIndex((t) => t.tier === (ctx.tier ?? "standard"));
  const nextTier = tierList[currentTierIdx + 1]?.tier ?? null;
  const tierProgress = nextTier ? Math.min(score, 100) : 100;

  return c.json({
    completionRate,
    onTimeRate,
    acceptanceRate,
    disputeRate,
    avgRating,
    reviewCount: Number((rating as Array<{ cnt: number }>)[0]?.cnt ?? 0),
    tier: ctx.tier ?? "standard",
    nextTier,
    tierProgress,
    thisMonthJobs: doneJobs,
    recentReviews: reviews,
  });
});

// ─── Availability ─────────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/availability", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const slots = await sql`
    SELECT day_of_week, start_time, end_time, active
    FROM cleaner_availability
    WHERE cleaner_id = ${ctx.cleaner_id}
    ORDER BY day_of_week
  `;
  return c.json({ slots });
});

const availabilitySchema = z.object({
  slots: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    start_time:  z.string().regex(/^\d{2}:\d{2}$/),
    end_time:    z.string().regex(/^\d{2}:\d{2}$/),
    active:      z.boolean(),
  })),
});

cleanerDashboardRouter.put("/availability", zValidator("json", availabilitySchema), async (c) => {
  const { slots } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  for (const slot of slots) {
    await sql`
      INSERT INTO cleaner_availability (cleaner_id, day_of_week, start_time, end_time, active)
      VALUES (${ctx.cleaner_id}, ${slot.day_of_week}, ${slot.start_time}, ${slot.end_time}, ${slot.active})
      ON CONFLICT (cleaner_id, day_of_week) DO UPDATE
        SET start_time = EXCLUDED.start_time,
            end_time   = EXCLUDED.end_time,
            active     = EXCLUDED.active,
            updated_at = NOW()
    `;
  }
  return c.json({ ok: true });
});

// ─── Blocked dates ────────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/blocked-dates", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const dates = await sql`
    SELECT id, blocked_date::text, reason
    FROM cleaner_blocked_dates
    WHERE cleaner_id = ${ctx.cleaner_id}
      AND blocked_date >= CURRENT_DATE
    ORDER BY blocked_date
  `;
  return c.json({ dates });
});

cleanerDashboardRouter.post(
  "/blocked-dates",
  zValidator("json", z.object({ date: z.string(), reason: z.string().optional() })),
  async (c) => {
    const { date, reason } = c.req.valid("json");
    const sql = getDb(c.env.DATABASE_URL);
    const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
    if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

    await sql`
      INSERT INTO cleaner_blocked_dates (cleaner_id, blocked_date, reason)
      VALUES (${ctx.cleaner_id}, ${date}, ${reason ?? null})
      ON CONFLICT (cleaner_id, blocked_date) DO NOTHING
    `;
    return c.json({ ok: true });
  }
);

cleanerDashboardRouter.delete("/blocked-dates/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  await sql`DELETE FROM cleaner_blocked_dates WHERE id = ${id} AND cleaner_id = ${ctx.cleaner_id}`;
  return c.json({ ok: true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const LANG_CODES = ["en","es","vi","zh-Hans","zh-Hant","fil","ko","ar","pt","hi"] as const;

const settingsSchema = z.object({
  max_jobs_per_day:           z.number().int().min(1).max(10).optional(),
  max_distance_miles:         z.number().min(1).max(200).optional(),
  accepts_last_minute:        z.boolean().optional(),
  notification_job_offer:     z.boolean().optional(),
  notification_reminder:      z.boolean().optional(),
  notification_payout:        z.boolean().optional(),
  notification_marketing:     z.boolean().optional(),
  preferred_service_types:    z.array(z.string()).optional(),
  preferred_language:         z.enum(LANG_CODES).optional(),
});

cleanerDashboardRouter.get("/settings", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const rows = await sql`
    SELECT max_jobs_per_day, max_distance_miles, accepts_last_minute,
           notification_job_offer, notification_reminder, notification_payout,
           notification_marketing, preferred_service_types
    FROM cleaners WHERE id = ${ctx.cleaner_id} LIMIT 1
  ` as Array<Record<string, unknown>>;

  return c.json(rows[0] ?? {
    max_jobs_per_day: 3,
    max_distance_miles: 25,
    accepts_last_minute: true,
    notification_job_offer: true,
    notification_reminder: true,
    notification_payout: true,
    notification_marketing: false,
    preferred_service_types: ["standard", "deep"],
  });
});

cleanerDashboardRouter.put("/settings", zValidator("json", settingsSchema), async (c) => {
  const body = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  await sql`
    UPDATE cleaners SET
      max_jobs_per_day        = COALESCE(${body.max_jobs_per_day ?? null}, max_jobs_per_day),
      max_distance_miles      = COALESCE(${body.max_distance_miles ?? null}, max_distance_miles),
      accepts_last_minute     = COALESCE(${body.accepts_last_minute ?? null}, accepts_last_minute),
      notification_job_offer  = COALESCE(${body.notification_job_offer ?? null}, notification_job_offer),
      notification_reminder   = COALESCE(${body.notification_reminder ?? null}, notification_reminder),
      notification_payout     = COALESCE(${body.notification_payout ?? null}, notification_payout),
      notification_marketing  = COALESCE(${body.notification_marketing ?? null}, notification_marketing),
      preferred_service_types = COALESCE(${JSON.stringify(body.preferred_service_types) ?? null}::jsonb, preferred_service_types),
      updated_at = NOW()
    WHERE id = ${ctx.cleaner_id}
  `;
  if (body.preferred_language) {
    await sql`UPDATE users SET preferred_language = ${body.preferred_language} WHERE id = ${ctx.user_id}`;
  }
  return c.json({ ok: true });
});

// ─── Stripe Connect onboarding ────────────────────────────────────────────────

cleanerDashboardRouter.post("/stripe-connect/onboard", async (c) => {
  const { getStripe } = await import("../lib/stripe");
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  const adminUrl = c.env.ADMIN_URL as string ?? "https://admin.getsweepr.com";
  const baseUrl  = c.env.CLEANER_APP_URL as string ?? "https://clean.getsweepr.com";

  try {
    // Check if account exists
    let accountId = ctx.stripe_connect_id;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: "express" });
      accountId = account.id;
      await sql`UPDATE cleaners SET stripe_connect_id = ${accountId} WHERE id = ${ctx.cleaner_id}`;
      await sql`
        INSERT INTO stripe_connected_accounts (cleaner_id, stripe_account_id)
        VALUES (${ctx.cleaner_id}, ${accountId})
        ON CONFLICT (stripe_account_id) DO NOTHING
      `;
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/earnings?stripe=refresh`,
      return_url:  `${baseUrl}/earnings?stripe=return`,
      type: "account_onboarding",
    });

    await sql`
      UPDATE stripe_connected_accounts SET onboarding_url = ${link.url}
      WHERE stripe_account_id = ${accountId}
    `;

    return c.json({ url: link.url });
  } catch (err) {
    // Surface the real reason (e.g. Connect not enabled on the platform account)
    // instead of a raw 500 so the UI can tell the cleaner what to do.
    const message = err instanceof Error ? err.message : "Stripe onboarding failed";
    return c.json(
      { error: "stripe_onboarding_failed", message },
      502,
    );
  }
});
