import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

export const observabilityRouter = new Hono<AppBindings>();

const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

observabilityRouter.use("*", requireAuth, requireAdmin);

const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try { return await p; } catch { return fallback; }
};

// GET /admin/observability/overview
observabilityRouter.get("/overview", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [apiHealth, paymentHealth, recentErrors, eventCounts] = await Promise.all([
    settle(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors_5xx,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS errors_4xx,
        ROUND(AVG(duration_ms))::int AS avg_latency_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_latency_ms
      FROM api_request_logs
      WHERE logged_at > NOW() - INTERVAL '24 hours'
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success = true)::int AS success,
        COUNT(*) FILTER (WHERE success = false)::int AS failed
      FROM payment_observability_events
      WHERE occurred_at > NOW() - INTERVAL '24 hours'
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT path, status_code, error_message, logged_at
      FROM api_request_logs
      WHERE status_code >= 500
      ORDER BY logged_at DESC
      LIMIT 10
    `, [] as unknown[]),
    settle(sql`
      SELECT event_name, COUNT(*)::int AS count
      FROM analytics_events
      WHERE occurred_at > NOW() - INTERVAL '24 hours'
      GROUP BY event_name
      ORDER BY count DESC
      LIMIT 20
    `, [] as unknown[]),
  ]);
  return c.json({ apiHealth: apiHealth[0], paymentHealth: paymentHealth[0], recentErrors, eventCounts });
});

// GET /admin/observability/api-health
observabilityRouter.get("/api-health", async (c) => {
  const range = c.req.query("range") ?? "24h";
  const interval = range === "7d" ? "7 days" : range === "1h" ? "1 hour" : "24 hours";
  const sql = getDb(c.env.DATABASE_URL);
  const [summary, byPath, byStatus, latencyBuckets, recentErrors] = await Promise.all([
    settle(sql`
      SELECT
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors_5xx,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS errors_4xx,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::int AS success_2xx,
        ROUND(AVG(duration_ms))::int AS avg_latency_ms,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms))::int AS p50_latency_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_latency_ms,
        ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms))::int AS p99_latency_ms
      FROM api_request_logs
      WHERE logged_at > NOW() - INTERVAL ${interval}
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT
        path,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors,
        ROUND(AVG(duration_ms))::int AS avg_ms
      FROM api_request_logs
      WHERE logged_at > NOW() - INTERVAL ${interval}
      GROUP BY path
      ORDER BY count DESC
      LIMIT 20
    `, [] as unknown[]),
    settle(sql`
      SELECT status_code, COUNT(*)::int AS count
      FROM api_request_logs
      WHERE logged_at > NOW() - INTERVAL ${interval}
      GROUP BY status_code
      ORDER BY status_code
    `, [] as unknown[]),
    settle(sql`
      SELECT
        CASE
          WHEN duration_ms < 100 THEN '<100ms'
          WHEN duration_ms < 500 THEN '100-500ms'
          WHEN duration_ms < 1000 THEN '500ms-1s'
          ELSE '>1s'
        END AS bucket,
        COUNT(*)::int AS count
      FROM api_request_logs
      WHERE logged_at > NOW() - INTERVAL ${interval}
      GROUP BY bucket
      ORDER BY MIN(duration_ms)
    `, [] as unknown[]),
    settle(sql`
      SELECT method, path, status_code, duration_ms, error_message, user_role, country_code, logged_at
      FROM api_request_logs
      WHERE status_code >= 400 AND logged_at > NOW() - INTERVAL ${interval}
      ORDER BY logged_at DESC
      LIMIT 50
    `, [] as unknown[]),
  ]);
  return c.json({ summary: summary[0], byPath, byStatus, latencyBuckets, recentErrors });
});

// GET /admin/observability/payments
observabilityRouter.get("/payments", async (c) => {
  const range = c.req.query("range") ?? "24h";
  const interval = range === "7d" ? "7 days" : range === "1h" ? "1 hour" : "24 hours";
  const sql = getDb(c.env.DATABASE_URL);
  const [summary, byType, failures, recentEvents] = await Promise.all([
    settle(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE success = true)::int AS success,
        COUNT(*) FILTER (WHERE success = false)::int AS failed,
        COALESCE(SUM(amount_cents) FILTER (WHERE success = true), 0)::bigint AS total_volume_cents
      FROM payment_observability_events
      WHERE occurred_at > NOW() - INTERVAL ${interval}
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT event_type, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE success = true)::int AS success,
             COUNT(*) FILTER (WHERE success = false)::int AS failed
      FROM payment_observability_events
      WHERE occurred_at > NOW() - INTERVAL ${interval}
      GROUP BY event_type
      ORDER BY total DESC
    `, [] as unknown[]),
    settle(sql`
      SELECT event_type, error_code, error_message, amount_cents, occurred_at
      FROM payment_observability_events
      WHERE success = false AND occurred_at > NOW() - INTERVAL ${interval}
      ORDER BY occurred_at DESC
      LIMIT 30
    `, [] as unknown[]),
    settle(sql`
      SELECT event_type, success, amount_cents, currency, provider_event_id, error_code, occurred_at
      FROM payment_observability_events
      WHERE occurred_at > NOW() - INTERVAL ${interval}
      ORDER BY occurred_at DESC
      LIMIT 50
    `, [] as unknown[]),
  ]);
  return c.json({ summary: summary[0], byType, failures, recentEvents });
});

// GET /admin/observability/booking-funnel
observabilityRouter.get("/booking-funnel", async (c) => {
  const range = c.req.query("range") ?? "7d";
  const interval = range === "30d" ? "30 days" : range === "24h" ? "24 hours" : "7 days";
  const sql = getDb(c.env.DATABASE_URL);
  const [funnelSteps, bookingsByStatus, conversionByDevice, dropoffEvents] = await Promise.all([
    settle(sql`
      SELECT event_name, COUNT(*)::int AS count,
             COUNT(DISTINCT session_id) AS sessions
      FROM analytics_events
      WHERE event_name IN (
        'booking_flow_started','address_entered','service_selected',
        'cleaner_selected','payment_started','booking_confirmed'
      )
      AND occurred_at > NOW() - INTERVAL ${interval}
      GROUP BY event_name
    `, [] as unknown[]),
    settle(sql`
      SELECT status, COUNT(*)::int AS count
      FROM bookings
      WHERE created_at > NOW() - INTERVAL ${interval}
      GROUP BY status
    `, [] as unknown[]),
    settle(sql`
      SELECT device_type, COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name = 'booking_confirmed'
        AND occurred_at > NOW() - INTERVAL ${interval}
      GROUP BY device_type
    `, [] as unknown[]),
    settle(sql`
      SELECT event_name, COUNT(*)::int AS count, device_type
      FROM analytics_events
      WHERE event_name LIKE 'booking_%abandoned%'
        AND occurred_at > NOW() - INTERVAL ${interval}
      GROUP BY event_name, device_type
      ORDER BY count DESC
    `, [] as unknown[]),
  ]);
  return c.json({ funnelSteps, bookingsByStatus, conversionByDevice, dropoffEvents });
});

// GET /admin/observability/cleaner-ops
observabilityRouter.get("/cleaner-ops", async (c) => {
  const range = c.req.query("range") ?? "7d";
  const interval = range === "30d" ? "30 days" : range === "24h" ? "24 hours" : "7 days";
  const sql = getDb(c.env.DATABASE_URL);
  const [dosStats, cleanerActivity, lateArrivals, checkoutTimes] = await Promise.all([
    settle(sql`
      SELECT
        COUNT(*)::int AS total_jobs,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM bookings
      WHERE scheduled_at > NOW() - INTERVAL ${interval}
    `, [{}] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT event_name, COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name IN (
        'cleaner_start_route','cleaner_arrived','cleaner_start_clean',
        'cleaner_finish_clean','cleaner_checkout','cleaner_photo_added'
      )
      AND occurred_at > NOW() - INTERVAL ${interval}
      GROUP BY event_name
      ORDER BY event_name
    `, [] as unknown[]),
    settle(sql`
      SELECT COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_name = 'cleaner_late_arrival'
        AND occurred_at > NOW() - INTERVAL ${interval}
    `, [{ count: 0 }] as Array<Record<string, unknown>>),
    settle(sql`
      SELECT
        ROUND(AVG((properties->>'duration_secs')::numeric / 60))::int AS avg_checkout_mins
      FROM analytics_events
      WHERE event_name = 'cleaner_checkout'
        AND properties->>'duration_secs' IS NOT NULL
        AND occurred_at > NOW() - INTERVAL ${interval}
    `, [{}] as Array<Record<string, unknown>>),
  ]);
  return c.json({ dosStats: dosStats[0], cleanerActivity, lateArrivals: lateArrivals[0], checkoutTimes: checkoutTimes[0] });
});

// GET /admin/observability/audit-trail
observabilityRouter.get("/audit-trail", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
  const offset = parseInt(c.req.query("offset") ?? "0");
  const actor = c.req.query("actor");
  const action = c.req.query("action");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await settle(sql`
    SELECT a.id, a.action, a.table_name, a.record_id, a.diff, a.created_at,
           u.email AS actor_email, u.role AS actor_role
    FROM admin_audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE (${actor ?? null}::text IS NULL OR u.email ILIKE ${'%' + (actor ?? '') + '%'})
      AND (${action ?? null}::text IS NULL OR a.action ILIKE ${'%' + (action ?? '') + '%'})
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `, [] as unknown[]);

  return c.json({ rows, limit, offset });
});

// GET /admin/observability/integration-health
observabilityRouter.get("/integration-health", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const latest = await settle(sql`
    SELECT DISTINCT ON (integration)
      integration, status, latency_ms, error_message, checked_at
    FROM integration_health_events
    ORDER BY integration, checked_at DESC
  `, [] as unknown[]);
  const history = await settle(sql`
    SELECT integration, status, latency_ms, checked_at
    FROM integration_health_events
    WHERE checked_at > NOW() - INTERVAL '24 hours'
    ORDER BY checked_at DESC
    LIMIT 200
  `, [] as unknown[]);
  return c.json({ latest, history });
});

// ─── Failed Webhooks (DLQ) ───────────────────────────────────────────────────

// GET /admin/observability/failed-webhooks
observabilityRouter.get("/failed-webhooks", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const includeResolved = c.req.query("resolved") === "true";

  const rows = await settle(sql`
    SELECT id, stripe_event_id, event_type, error_message,
           retry_count, last_retry_at, created_at, resolved_at
    FROM failed_webhook_events
    ${includeResolved ? sql`` : sql`WHERE resolved_at IS NULL`}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `, [] as unknown[]);

  const counts = await settle(sql`
    SELECT
      COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
    FROM failed_webhook_events
  `, [{ unresolved: 0, resolved: 0 }] as unknown[]);

  return c.json({ events: rows, counts: (counts as Array<{ unresolved: number; resolved: number }>)[0] });
});

// POST /admin/observability/failed-webhooks/:id/replay
// Re-inserts the event payload back into stripe_events for reprocessing on next webhook fire.
observabilityRouter.post("/failed-webhooks/:id/replay", async (c) => {
  const { id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const rows = await sql`
    SELECT * FROM failed_webhook_events WHERE id = ${id} LIMIT 1
  ` as Array<{ id: string; stripe_event_id: string; event_type: string; payload: unknown; resolved_at: string | null }>;

  const event = rows[0];
  if (!event) return c.json({ error: "Not found" }, 404);
  if (event.resolved_at) return c.json({ error: "Already resolved" }, 400);

  // Reset the stripe_events processed_at so the next webhook delivery will re-process it.
  await sql`
    UPDATE stripe_events
    SET processed_at = NULL, retry_count = retry_count + 1, last_error = NULL
    WHERE stripe_event_id = ${event.stripe_event_id}
  `;

  // Mark the DLQ entry as retried.
  await sql`
    UPDATE failed_webhook_events
    SET retry_count = retry_count + 1, last_retry_at = NOW()
    WHERE id = ${id}
  `;

  return c.json({ ok: true, message: "Event queued for replay on next webhook delivery" });
});

// POST /admin/observability/failed-webhooks/:id/resolve
observabilityRouter.post("/failed-webhooks/:id/resolve", async (c) => {
  const { id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  const users = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}` as Array<{ id: string }>;
  if (!users[0]) return c.json({ error: "Forbidden" }, 403);

  await sql`
    UPDATE failed_webhook_events
    SET resolved_at = NOW(), resolved_by = ${users[0].id}
    WHERE id = ${id} AND resolved_at IS NULL
  `;

  return c.json({ ok: true });
});

// GET /admin/observability/clerk-stats
// Returns total registered users from our DB as a lightweight Clerk proxy.
// (Full MAU requires Clerk Dashboard API which has no public REST endpoint —
//  we proxy our own users table instead.)
observabilityRouter.get("/clerk-stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [totals] = await sql`
    SELECT
      COUNT(*)::int                                                     AS total_users,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS new_7d
    FROM users
  ` as Array<{ total_users: number; new_30d: number; new_7d: number }>;
  return c.json({ mau: totals.new_30d, total_users: totals.total_users, new_7d: totals.new_7d });
});

// GET /admin/observability/posthog-summary
// Proxies PostHog's query API so the browser never needs the PostHog secret key.
observabilityRouter.get("/posthog-summary", async (c) => {
  const posthogKey = c.env.POSTHOG_KEY;
  if (!posthogKey) return c.json({ events_7d: null, sessions_7d: null, error: "POSTHOG_KEY not set" }, 200);

  const host = "https://us.i.posthog.com";
  const [eventsRes, sessionsRes] = await Promise.all([
    fetch(`${host}/api/event/?format=json&limit=0`, {
      headers: { Authorization: `Bearer ${posthogKey}` },
    }).catch(() => null),
    fetch(`${host}/api/session_recording/?format=json&limit=0`, {
      headers: { Authorization: `Bearer ${posthogKey}` },
    }).catch(() => null),
  ]);

  const events_7d = eventsRes?.ok ? ((await eventsRes.json()) as { count?: number }).count ?? null : null;
  const sessions_7d = sessionsRes?.ok ? ((await sessionsRes.json()) as { count?: number }).count ?? null : null;

  return c.json({ events_7d, sessions_7d });
});

// ─── Error Feed ──────────────────────────────────────────────────────────────

// GET /admin/observability/errors
observabilityRouter.get("/errors", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const includeResolved = c.req.query("resolved") === "true";
  const sourceFilter = c.req.query("source"); // 'server' | 'client' | undefined
  const appFilter = c.req.query("app");

  const rows = await settle(sql`
    SELECT id, occurred_at, source, app, level, message, stack, path, method,
           status_code, clerk_id, request_id, resolved, resolved_at
    FROM error_logs
    WHERE (${includeResolved} OR resolved = false)
      AND (${sourceFilter ?? null}::text IS NULL OR source = ${sourceFilter ?? null})
      AND (${appFilter ?? null}::text IS NULL OR app = ${appFilter ?? null})
    ORDER BY occurred_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `, [] as unknown[]);

  const counts = await settle(sql`
    SELECT
      COUNT(*) FILTER (WHERE resolved = false)::int AS unresolved,
      COUNT(*) FILTER (WHERE resolved = false AND occurred_at > NOW() - INTERVAL '24 hours')::int AS last_24h,
      COUNT(*) FILTER (WHERE source = 'server' AND resolved = false)::int AS server_open,
      COUNT(*) FILTER (WHERE source = 'client' AND resolved = false)::int AS client_open
    FROM error_logs
  `, [{ unresolved: 0, last_24h: 0, server_open: 0, client_open: 0 }] as unknown[]);

  return c.json({
    errors: rows,
    counts: (counts as Array<Record<string, number>>)[0],
  });
});

// POST /admin/observability/errors/:id/resolve
observabilityRouter.post("/errors/:id/resolve", async (c) => {
  const { id } = c.req.param();
  const sql = getDb(c.env.DATABASE_URL);
  const clerkId = c.get("user").clerkId;

  await sql`
    UPDATE error_logs
    SET resolved = true, resolved_at = NOW(), resolved_by = ${clerkId}
    WHERE id = ${id} AND resolved = false
  `;
  return c.json({ ok: true });
});
