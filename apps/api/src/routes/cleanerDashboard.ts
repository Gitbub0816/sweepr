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
  // A user who has authenticated but not yet completed onboarding has no
  // cleaners row. Return an empty, onboarding-safe dashboard (200) instead of
  // a 404 so the dashboard page renders cleanly rather than logging an error.
  if (!ctx) {
    return c.json({
      onboarding: true,
      upcomingJobs: 0,
      completedThisMonth: 0,
      earningsThisMonth: 0,
      pendingPayout: 0,
      rating: 0,
      reviewCount: 0,
      tier: "standard",
      stripeConnected: false,
      nextJobAt: null,
      nextJobAddress: null,
    });
  }

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

  let stripeAcc = ctx.stripe_connect_id
    ? await sql`SELECT charges_enabled, payouts_enabled FROM stripe_connected_accounts WHERE stripe_account_id = ${ctx.stripe_connect_id} LIMIT 1` as Array<{ charges_enabled: boolean; payouts_enabled: boolean }>
    : [];

  // Self-heal from Stripe if not yet enabled locally (webhook-independent) —
  // same rationale as the earnings endpoint.
  if (ctx.stripe_connect_id && !(stripeAcc[0]?.charges_enabled && stripeAcc[0]?.payouts_enabled)) {
    try {
      const { getStripe } = await import("../lib/stripe");
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      const acct = await stripe.accounts.retrieve(ctx.stripe_connect_id);
      const charges = Boolean(acct.charges_enabled);
      const payouts = Boolean(acct.payouts_enabled);
      await sql`
        UPDATE stripe_connected_accounts
        SET charges_enabled = ${charges}, payouts_enabled = ${payouts},
            details_submitted = ${Boolean(acct.details_submitted)},
            status = ${charges && payouts ? "enabled" : "pending"}, updated_at = NOW()
        WHERE stripe_account_id = ${ctx.stripe_connect_id}
      `;
      stripeAcc = [{ charges_enabled: charges, payouts_enabled: payouts }];
    } catch (err) {
      logger.error("dashboard: Stripe account sync failed", err, { cleanerId: ctx.cleaner_id });
    }
  }

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
  // Onboarding: no cleaner row yet — render an empty job list instead of 404.
  if (!ctx) return c.json({ jobs: [] });

  const raw = c.req.query();
  const limit = Math.min(Math.max(1, Number(raw.limit ?? "20") || 20), 100);
  const offset = Math.max(0, Number(raw.offset ?? "0") || 0);
  const { status } = raw;

  // Two explicit queries instead of an inlined conditional sql`` fragment — the
  // empty-fragment form produced a "syntax error at or near $2" on the driver.
  const jobs = status
    ? await sql`
        SELECT b.id, b.status, b.day_status, b.service_type, b.scheduled_at,
               b.total_price, b.cleaner_payout, b.bedrooms, b.bathrooms,
               b.arrival_window_start::text AS arrival_window_start,
               b.arrival_window_end::text AS arrival_window_end,
               a.city AS address_city, a.state AS address_state
        FROM bookings b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.cleaner_id = ${ctx.cleaner_id} AND b.status = ${status}
        ORDER BY b.scheduled_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT b.id, b.status, b.day_status, b.service_type, b.scheduled_at,
               b.total_price, b.cleaner_payout, b.bedrooms, b.bathrooms,
               b.arrival_window_start::text AS arrival_window_start,
               b.arrival_window_end::text AS arrival_window_end,
               a.city AS address_city, a.state AS address_state
        FROM bookings b
        LEFT JOIN addresses a ON a.id = b.address_id
        WHERE b.cleaner_id = ${ctx.cleaner_id}
        ORDER BY b.scheduled_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  return c.json({ jobs });
});

// ─── Available offers (assignment_queue rows awaiting this cleaner) ──────────
// The job board must show jobs *offered but not yet accepted* — those offers
// live in assignment_queue (per-cleaner rows), not on the booking itself:
// bookings.cleaner_id stays NULL until an offer is accepted. Querying bookings
// directly (as /my-jobs does) can never surface a pending offer.
cleanerDashboardRouter.get("/available-offers", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ jobs: [] });

  const offers = await sql`
    SELECT b.id, b.service_type, b.scheduled_at,
           b.arrival_window_start::text AS arrival_window_start,
           b.arrival_window_end::text AS arrival_window_end,
           b.total_price, b.cleaner_payout, b.bedrooms, b.bathrooms,
           a.city AS address_city, a.state AS address_state
    FROM assignment_queue aq
    JOIN bookings b ON b.id = aq.booking_id
    LEFT JOIN addresses a ON a.id = b.address_id
    WHERE aq.cleaner_id = ${ctx.cleaner_id}
      -- assignment_queue rows are inserted 'pending' for every ranked candidate
      -- up front (position 1..N), but only the lowest still-pending position
      -- for a booking is the *currently active* offer — the rest are backups
      -- waiting in the cascade should this one decline/expire. Statuses
      -- 'offered'/'queued' are included defensively in case future code
      -- introduces them.
      AND aq.status IN ('pending', 'offered', 'queued')
      AND aq.position = (
        SELECT MIN(aq2.position) FROM assignment_queue aq2
        WHERE aq2.booking_id = aq.booking_id AND aq2.status IN ('pending', 'offered', 'queued')
      )
      AND (aq.expires_at IS NULL OR aq.expires_at > NOW())
      AND b.status IN ('matching', 'offered_to_cleaner')
    ORDER BY b.scheduled_at ASC
  `;

  return c.json({ jobs: offers });
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

  // Tell the UI whether a decline used the free daily allowance or was
  // penalized (dents acceptance rate) so it can message accordingly.
  if (response === "declined") {
    const row = (await sql`
      SELECT declined_free FROM assignment_queue
      WHERE booking_id = ${bookingId} AND cleaner_id = ${ctx.cleaner_id}
      ORDER BY responded_at DESC NULLS LAST LIMIT 1
    `) as Array<{ declined_free: boolean | null }>;
    return c.json({ ok: true, response, declineWasFree: row[0]?.declined_free ?? true });
  }
  return c.json({ ok: true, response });
}

cleanerDashboardRouter.post("/jobs/:id/accept", (c) => respondToOffer(c, "accepted"));
cleanerDashboardRouter.post("/jobs/:id/decline", (c) => respondToOffer(c, "declined"));

// Whether the cleaner still has their free decline for today (UI hint).
cleanerDashboardRouter.get("/decline-status", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ freeDeclineAvailable: true });
  const used = (await sql`
    SELECT 1 FROM assignment_queue
    WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'declined'
      AND declined_free = true AND responded_at >= date_trunc('day', NOW())
    LIMIT 1
  `) as unknown[];
  return c.json({ freeDeclineAvailable: used.length === 0 });
});

// ─── Earnings summary ─────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/earnings", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  // Onboarding: no cleaner row yet — return zeroed earnings instead of 404.
  if (!ctx) {
    return c.json({
      thisWeek: 0,
      thisMonth: 0,
      lastMonth: 0,
      allTime: 0,
      pendingPayout: 0,
      nextPayoutDate: null,
      stripeConnected: false,
      onboardingUrl: null,
      recent: [],
      tipsThisMonth: 0,
      tipsAllTime: 0,
      recentTips: [],
    });
  }

  const now = new Date();
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

  // Tips are only ever surfaced once visible_to_cleaner = TRUE (set when the
  // booking payout is released). Pre-payout tips stay completely hidden.
  const [week, month, lastMonth, allTime, pending, nextPayout, recent, tipsMonth, tipsAllTime, recentTips] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at >= ${weekStart.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at >= ${monthStart.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred') AND paid_at BETWEEN ${lastMonthStart.toISOString()} AND ${lastMonthEnd.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status IN ('paid','transferred')`,
    sql`SELECT COALESCE(SUM(amount),0) v FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'pending'`,
    sql`SELECT scheduled_for FROM payouts WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'scheduled' ORDER BY scheduled_for ASC LIMIT 1`,
    sql`SELECT p.paid_at AS date, p.amount, p.status, p.booking_id FROM payouts p WHERE p.cleaner_id = ${ctx.cleaner_id} ORDER BY p.created_at DESC LIMIT 10`,
    sql`SELECT COALESCE(SUM(amount_cents),0) v FROM booking_tips WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'succeeded' AND visible_to_cleaner = TRUE AND paid_out_at >= ${monthStart.toISOString()}`,
    sql`SELECT COALESCE(SUM(amount_cents),0) v FROM booking_tips WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'succeeded' AND visible_to_cleaner = TRUE`,
    sql`SELECT booking_id, amount_cents, paid_out_at AS date FROM booking_tips WHERE cleaner_id = ${ctx.cleaner_id} AND status = 'succeeded' AND visible_to_cleaner = TRUE ORDER BY paid_out_at DESC LIMIT 10`,
  ]);

  let stripeAcc = ctx.stripe_connect_id
    ? await sql`SELECT charges_enabled, payouts_enabled, onboarding_url FROM stripe_connected_accounts WHERE stripe_account_id = ${ctx.stripe_connect_id} LIMIT 1` as Array<{ charges_enabled: boolean; payouts_enabled: boolean; onboarding_url: string | null }>
    : [];

  // Self-heal: enablement normally arrives via the Stripe `account.updated`
  // webhook, but if that webhook is unconfigured/undelivered (a common Connect
  // setup gap), a cleaner who just finished onboarding stays "not set up"
  // forever. When we have an account but it isn't marked enabled locally, pull
  // the live capability flags from Stripe and sync. Bounded: only runs while
  // not-yet-enabled, so it stops calling Stripe once payouts are live.
  if (ctx.stripe_connect_id && !(stripeAcc[0]?.charges_enabled && stripeAcc[0]?.payouts_enabled)) {
    try {
      const { getStripe } = await import("../lib/stripe");
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      const acct = await stripe.accounts.retrieve(ctx.stripe_connect_id);
      const charges = Boolean(acct.charges_enabled);
      const payouts = Boolean(acct.payouts_enabled);
      await sql`
        UPDATE stripe_connected_accounts
        SET charges_enabled = ${charges},
            payouts_enabled = ${payouts},
            details_submitted = ${Boolean(acct.details_submitted)},
            status = ${charges && payouts ? "enabled" : "pending"},
            updated_at = NOW()
        WHERE stripe_account_id = ${ctx.stripe_connect_id}
      `;
      stripeAcc = [{ charges_enabled: charges, payouts_enabled: payouts, onboarding_url: stripeAcc[0]?.onboarding_url ?? null }];
    } catch (err) {
      logger.error("earnings: Stripe account sync failed", err, { cleanerId: ctx.cleaner_id });
    }
  }

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
    // Tips (only visible-to-cleaner, i.e. after the booking payout was released).
    tipsThisMonth:   Number((tipsMonth as Array<{ v: number }>)[0]?.v ?? 0),
    tipsAllTime:     Number((tipsAllTime as Array<{ v: number }>)[0]?.v ?? 0),
    recentTips:      recentTips,
  });
});

// ─── Performance stats ────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/performance-stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  // Onboarding: no cleaner row yet — return zeroed performance stats instead of 404.
  if (!ctx) {
    return c.json({
      completionRate: 0,
      onTimeRate: 0,
      acceptanceRate: 0,
      disputeRate: 0,
      avgRating: 0,
      reviewCount: 0,
      tier: "standard",
      nextTier: null,
      tierProgress: 0,
      thisMonthJobs: 0,
      totalJobs: 0,
      recentReviews: [],
    });
  }

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
    totalJobs,
    recentReviews: reviews,
  });
});

// ─── Availability ─────────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/availability", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  // Onboarding: no cleaner row yet — return empty availability instead of 404.
  if (!ctx) return c.json({ slots: [] });

  // Format TIME as HH:MM (not the raw HH:MM:SS Postgres returns) so the value
  // round-trips through the PUT schema unchanged — otherwise the seconds cause
  // untouched days to fail validation and the whole save is rejected.
  const slots = await sql`
    SELECT day_of_week,
           to_char(start_time, 'HH24:MI') AS start_time,
           to_char(end_time,   'HH24:MI') AS end_time,
           active
    FROM cleaner_availability
    WHERE cleaner_id = ${ctx.cleaner_id}
    ORDER BY day_of_week
  `;
  return c.json({ slots });
});

const availabilitySchema = z.object({
  slots: z.array(z.object({
    day_of_week: z.number().int().min(0).max(6),
    // Tolerate an optional :SS suffix (older clients / raw TIME values) and
    // normalize to HH:MM below.
    start_time:  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    end_time:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    active:      z.boolean(),
  })),
});

cleanerDashboardRouter.put("/availability", zValidator("json", availabilitySchema), async (c) => {
  const { slots } = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);

  for (const slot of slots) {
    const start = slot.start_time.slice(0, 5);
    const end = slot.end_time.slice(0, 5);
    await sql`
      INSERT INTO cleaner_availability (cleaner_id, day_of_week, start_time, end_time, active)
      VALUES (${ctx.cleaner_id}, ${slot.day_of_week}, ${start}, ${end}, ${slot.active})
      ON CONFLICT (cleaner_id, day_of_week) DO UPDATE
        SET start_time = EXCLUDED.start_time,
            end_time   = EXCLUDED.end_time,
            active     = EXCLUDED.active,
            updated_at = NOW()
    `;
  }
  return c.json({ ok: true });
});

// ─── Service area (address + radius the cleaner will travel) ────────────────────
// Cleaners set their own smaller service area within the company's coverage.
// The assignment engine hard-filters offers to bookings inside this radius.

cleanerDashboardRouter.get("/service-area", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ area: null });
  const rows = (await sql`
    SELECT center_lat, center_lng, radius_miles, label, updated_at
    FROM cleaner_service_areas
    WHERE cleaner_id = ${ctx.cleaner_id}
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `) as Array<{
    center_lat: string | null;
    center_lng: string | null;
    radius_miles: number | null;
    label: string | null;
    updated_at: string | null;
  }>;
  const a = rows[0];
  return c.json({
    area: a
      ? {
          centerLat: a.center_lat != null ? Number(a.center_lat) : null,
          centerLng: a.center_lng != null ? Number(a.center_lng) : null,
          radiusMiles: a.radius_miles ?? 15,
          label: a.label ?? null,
          updatedAt: a.updated_at,
        }
      : null,
  });
});

const serviceAreaSchema = z.object({
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMiles: z.number().int().min(1).max(100),
  label: z.string().max(200).optional(),
});

cleanerDashboardRouter.put("/service-area", zValidator("json", serviceAreaSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) return c.json({ error: "Cleaner not found" }, 404);
  const { centerLat, centerLng, radiusMiles, label } = c.req.valid("json");

  // One primary service area per cleaner — replace any existing.
  await sql`DELETE FROM cleaner_service_areas WHERE cleaner_id = ${ctx.cleaner_id}`;
  await sql`
    INSERT INTO cleaner_service_areas (cleaner_id, center_lat, center_lng, radius_miles, label, updated_at)
    VALUES (${ctx.cleaner_id}, ${centerLat}, ${centerLng}, ${radiusMiles}, ${label ?? null}, NOW())
  `;
  return c.json({ ok: true });
});

// ─── Blocked dates ────────────────────────────────────────────────────────────

cleanerDashboardRouter.get("/blocked-dates", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  // Onboarding: no cleaner row yet — return empty blocked dates instead of 404.
  if (!ctx) return c.json({ dates: [] });

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
  zValidator("json", z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    reason: z.string().max(200).optional(),
  })),
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
  // During onboarding a user may not have a cleaner row yet. Return defaults
  // (plus their last-used language) instead of 404 so language restore and the
  // settings screen work throughout the whole cleaner lifecycle.
  if (!ctx) {
    const [u] = (await sql`
      SELECT preferred_language FROM users WHERE clerk_id = ${c.get("user").clerkId} LIMIT 1
    `) as Array<{ preferred_language: string | null }>;
    return c.json({
      max_jobs_per_day: 3, max_distance_miles: 25, accepts_last_minute: true,
      notification_job_offer: true, notification_reminder: true,
      notification_payout: true, notification_marketing: false,
      preferred_service_types: ["standard", "deep"],
      preferred_language: u?.preferred_language ?? null,
    });
  }

  const rows = await sql`
    SELECT c.max_jobs_per_day, c.max_distance_miles, c.accepts_last_minute,
           c.notification_job_offer, c.notification_reminder, c.notification_payout,
           c.notification_marketing, c.preferred_service_types,
           u.preferred_language
    FROM cleaners c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${ctx.cleaner_id} LIMIT 1
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
  // No cleaner row yet (onboarding): a language-only save must still persist to
  // the user so last-used language works before the cleaner is fully created.
  if (!ctx) {
    if (body.preferred_language) {
      await sql`UPDATE users SET preferred_language = ${body.preferred_language} WHERE clerk_id = ${c.get("user").clerkId}`;
    }
    return c.json({ ok: true });
  }

  await sql`
    UPDATE cleaners SET
      max_jobs_per_day        = COALESCE(${body.max_jobs_per_day ?? null}, max_jobs_per_day),
      max_distance_miles      = COALESCE(${body.max_distance_miles ?? null}, max_distance_miles),
      accepts_last_minute     = COALESCE(${body.accepts_last_minute ?? null}, accepts_last_minute),
      notification_job_offer  = COALESCE(${body.notification_job_offer ?? null}, notification_job_offer),
      notification_reminder   = COALESCE(${body.notification_reminder ?? null}, notification_reminder),
      notification_payout     = COALESCE(${body.notification_payout ?? null}, notification_payout),
      notification_marketing  = COALESCE(${body.notification_marketing ?? null}, notification_marketing),
      preferred_service_types = COALESCE(${body.preferred_service_types ?? null}, preferred_service_types),
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
  let ctx = await getCleanerCtx(sql, c.get("user").clerkId);
  if (!ctx) {
    // "Set up payouts" is reachable during onboarding, before any other step
    // has created the cleaners row. Starting Stripe Connect is a legitimate
    // first action for a signed-in cleaner, so create the row lazily instead
    // of 404ing. ON CONFLICT keeps a concurrent create (e.g. the Yardstik step)
    // from racing to a duplicate.
    await sql`
      INSERT INTO cleaners (user_id)
      SELECT id FROM users WHERE clerk_id = ${c.get("user").clerkId}
      ON CONFLICT (user_id) DO NOTHING
    `;
    ctx = await getCleanerCtx(sql, c.get("user").clerkId);
    if (!ctx) return c.json({ error: "Cleaner not found" }, 404);
  }

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
    logger.error("stripe-onboard failed", err);
    return c.json(
      { error: "stripe_onboarding_failed", message: "Stripe onboarding is temporarily unavailable. Please try again." },
      502,
    );
  }
});
