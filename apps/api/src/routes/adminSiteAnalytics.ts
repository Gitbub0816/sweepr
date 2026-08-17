/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Admin Site Analytics — read APIs over the first-party analytics tables
 * (site_events / site_sessions, written by the sweepr-analytics worker) plus
 * CRUD for tracking_links (the /go/{code} short links). Mounted at
 * /admin/site-analytics. Deliberately separate from /admin/observability,
 * which serves product/API telemetry.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  isValidLinkCode,
  normalizeDestination,
  randomCodeSuffix,
  slugifyLinkCode,
} from "@sweepr/utils";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const adminSiteAnalyticsRouter = new Hono<AppBindings>();
adminSiteAnalyticsRouter.use("*", requireAuth, requireAdmin);

/** Clamp the ?days window to something the indexes handle comfortably. */
function windowDays(c: { req: { query: (k: string) => string | undefined } }): number {
  const n = Number.parseInt(c.req.query("days") ?? "30", 10);
  return Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 30;
}

const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// Overview: KPI totals + timeseries
// ---------------------------------------------------------------------------

adminSiteAnalyticsRouter.get("/overview", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  // Sub-3-day windows chart by hour, everything else by day.
  const byHour = days <= 2;

  const [totalsRows, seriesRows, liveRows] = await Promise.all([
    settle(
      sql`
        SELECT
          COUNT(*)::int                                             AS sessions,
          COUNT(DISTINCT visitor_id)::int                           AS visitors,
          COALESCE(SUM(pageviews), 0)::int                          AS pageviews,
          COALESCE(SUM(clicks), 0)::int                             AS clicks,
          COUNT(*) FILTER (WHERE pageviews <= 1)::int               AS bounces,
          COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (last_seen_at - first_seen_at)))
            FILTER (WHERE last_seen_at > first_seen_at))::int, 0)   AS avg_session_seconds
        FROM site_sessions
        WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day')
          AND NOT is_bot
      `,
      [{}] as Array<Record<string, unknown>>,
    ),
    settle(
      byHour
        ? sql`
            SELECT date_trunc('hour', s.first_seen_at) AS bucket,
                   COUNT(*)::int AS sessions,
                   COUNT(DISTINCT s.visitor_id)::int AS visitors,
                   COALESCE(SUM(s.pageviews), 0)::int AS pageviews
            FROM site_sessions s
            WHERE s.first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT s.is_bot
            GROUP BY 1 ORDER BY 1
          `
        : sql`
            SELECT date_trunc('day', s.first_seen_at) AS bucket,
                   COUNT(*)::int AS sessions,
                   COUNT(DISTINCT s.visitor_id)::int AS visitors,
                   COALESCE(SUM(s.pageviews), 0)::int AS pageviews
            FROM site_sessions s
            WHERE s.first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT s.is_bot
            GROUP BY 1 ORDER BY 1
          `,
      [] as unknown[],
    ),
    settle(
      sql`
        SELECT COUNT(*)::int AS live
        FROM site_sessions
        WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND NOT is_bot
      `,
      [{ live: 0 }] as Array<Record<string, unknown>>,
    ),
  ]);

  return c.json({
    days,
    granularity: byHour ? "hour" : "day",
    totals: totalsRows[0] ?? {},
    live: (liveRows[0] as { live?: number })?.live ?? 0,
    series: seriesRows,
  });
});

// ---------------------------------------------------------------------------
// Breakdowns: one call returns every dimension the dashboard renders
// ---------------------------------------------------------------------------

adminSiteAnalyticsRouter.get("/breakdowns", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  const top = 12;

  // Session-level dimensions come from site_sessions (one row per session —
  // cheap and dedup-correct); language and custom events live on site_events.
  const dim = (query: Promise<unknown>) => settle(query, [] as unknown[]);
  const [device, browser, os, country, city, source, campaign, link, language, custom] =
    await Promise.all([
      dim(sql`
        SELECT COALESCE(device_type, 'unknown') AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(browser, 'unknown') AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(os, 'unknown') AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(country, 'unknown') AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(city, 'unknown') AS key, country, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot AND city IS NOT NULL
        GROUP BY 1, 2 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(source, 'direct') AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT campaign_id AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot AND campaign_id IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT link_code AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot AND link_code IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT COALESCE(language, 'unknown') AS key, COUNT(DISTINCT session_id)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_events WHERE occurred_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot AND event_type = 'pageview'
        GROUP BY 1 ORDER BY sessions DESC LIMIT ${top}
      `),
      dim(sql`
        SELECT meta->>'name' AS key, COUNT(*)::int AS count, COUNT(DISTINCT session_id)::int AS sessions
        FROM site_events WHERE occurred_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
          AND event_type = 'custom' AND meta->>'name' IS NOT NULL
        GROUP BY 1 ORDER BY count DESC LIMIT ${top}
      `),
    ]);

  return c.json({ days, device, browser, os, country, city, source, campaign, link, language, custom });
});

// ---------------------------------------------------------------------------
// Pages, geo, live feed
// ---------------------------------------------------------------------------

adminSiteAnalyticsRouter.get("/pages", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  const pages = await settle(
    sql`
      SELECT app, path,
             COUNT(*)::int AS views,
             COUNT(DISTINCT session_id)::int AS sessions,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM site_events
      WHERE occurred_at > NOW() - (${days} * INTERVAL '1 day')
        AND event_type = 'pageview' AND NOT is_bot AND path IS NOT NULL
      GROUP BY app, path
      ORDER BY views DESC
      LIMIT 50
    `,
    [] as unknown[],
  );
  const clicks = await settle(
    sql`
      SELECT click_text AS text, click_href AS href, COUNT(*)::int AS clicks
      FROM site_events
      WHERE occurred_at > NOW() - (${days} * INTERVAL '1 day')
        AND event_type = 'click' AND NOT is_bot AND click_text IS NOT NULL
      GROUP BY click_text, click_href
      ORDER BY clicks DESC
      LIMIT 25
    `,
    [] as unknown[],
  );
  return c.json({ days, pages, clicks });
});

adminSiteAnalyticsRouter.get("/geo", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  const [countries, cities] = await Promise.all([
    settle(
      sql`
        SELECT country AS key, COUNT(*)::int AS sessions, COUNT(DISTINCT visitor_id)::int AS visitors
        FROM site_sessions
        WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot AND country IS NOT NULL
        GROUP BY 1 ORDER BY sessions DESC LIMIT 50
      `,
      [] as unknown[],
    ),
    settle(
      sql`
        SELECT city, region, country,
               COUNT(*)::int AS sessions,
               AVG(latitude)::float AS lat,
               AVG(longitude)::float AS lon
        FROM site_sessions
        WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT is_bot
          AND city IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY city, region, country
        ORDER BY sessions DESC
        LIMIT 200
      `,
      [] as unknown[],
    ),
  ]);
  return c.json({ days, countries, cities });
});

adminSiteAnalyticsRouter.get("/live", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [sessions, events] = await Promise.all([
    settle(
      sql`
        SELECT session_id, visitor_id, app, entry_path, exit_path, source, link_code,
               device_type, browser, os, country, region, city, pageviews, clicks,
               first_seen_at, last_seen_at
        FROM site_sessions
        WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND NOT is_bot
        ORDER BY last_seen_at DESC
        LIMIT 50
      `,
      [] as unknown[],
    ),
    settle(
      sql`
        SELECT occurred_at, app, event_type, session_id, path, click_text, source,
               link_code, device_type, country, city, meta
        FROM site_events
        WHERE occurred_at > NOW() - INTERVAL '15 minutes' AND NOT is_bot
        ORDER BY occurred_at DESC
        LIMIT 50
      `,
      [] as unknown[],
    ),
  ]);
  return c.json({ sessions, events });
});

// ---------------------------------------------------------------------------
// Session explorer (the "truly individualized" view)
// ---------------------------------------------------------------------------

adminSiteAnalyticsRouter.get("/sessions", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const source = c.req.query("source")?.trim() || null;
  const device = c.req.query("device")?.trim() || null;
  const country = c.req.query("country")?.trim() || null;
  const link = c.req.query("link")?.trim() || null;

  const rows = await settle(
    sql`
      SELECT session_id, visitor_id, app, entry_path, exit_path, referrer, source,
             campaign_id, link_code, device_type, browser, os, country, region, city,
             pageviews, clicks, events, first_seen_at, last_seen_at,
             EXTRACT(EPOCH FROM (last_seen_at - first_seen_at))::int AS duration_seconds
      FROM site_sessions
      WHERE first_seen_at > NOW() - (${days} * INTERVAL '1 day')
        AND NOT is_bot
        AND (${source}::text IS NULL OR source = ${source})
        AND (${device}::text IS NULL OR device_type = ${device})
        AND (${country}::text IS NULL OR country = ${country})
        AND (${link}::text IS NULL OR link_code = ${link})
      ORDER BY last_seen_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    [] as unknown[],
  );
  return c.json({ days, sessions: rows, limit, offset });
});

adminSiteAnalyticsRouter.get("/sessions/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const sessions = (await settle(
    sql`SELECT * FROM site_sessions WHERE session_id = ${id} LIMIT 1`,
    [] as unknown[],
  )) as Array<Record<string, unknown>>;
  if (!sessions[0]) return c.json({ error: "Not found" }, 404);
  const events = await settle(
    sql`
      SELECT occurred_at, app, event_type, path, referrer, source, campaign_id, link_code,
             click_target, click_href, click_text, viewport_w, viewport_h, language,
             browser, browser_ver, os, os_ver, device_type, country, region, city,
             timezone, asn_org, ipinfo, meta
      FROM site_events
      WHERE session_id = ${id}
      ORDER BY occurred_at ASC
      LIMIT 500
    `,
    [] as unknown[],
  );
  return c.json({ session: sessions[0], events });
});

// ---------------------------------------------------------------------------
// Tracking links CRUD + per-link stats
// ---------------------------------------------------------------------------

adminSiteAnalyticsRouter.get("/links", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await settle(
    sql`
      SELECT id, code, label, source, campaign_id, destination, notes, active,
             hit_count, last_hit_at, created_at, updated_at
      FROM tracking_links
      ORDER BY created_at DESC
      LIMIT 500
    `,
    [] as unknown[],
  );
  return c.json({ links: rows });
});

adminSiteAnalyticsRouter.get("/links/stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const days = windowDays(c);
  const rows = await settle(
    sql`
      SELECT l.code,
             COUNT(e.id) FILTER (WHERE e.event_type = 'link_hit')::int AS hits,
             COUNT(DISTINCT s.session_id)::int AS sessions,
             COALESCE(SUM(s.pageviews), 0)::int AS pageviews
      FROM tracking_links l
      LEFT JOIN site_events e
        ON e.link_code = l.code AND e.occurred_at > NOW() - (${days} * INTERVAL '1 day') AND NOT e.is_bot
      LEFT JOIN site_sessions s
        ON s.link_code = l.code AND s.first_seen_at > NOW() - (${days} * INTERVAL '1 day') AND NOT s.is_bot
      GROUP BY l.code
    `,
    [] as unknown[],
  );
  return c.json({ days, stats: rows });
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(64).toLowerCase(),
  campaignId: z.string().trim().max(64).nullable().optional(),
  destination: z.string().trim().min(1).max(512),
  code: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

adminSiteAnalyticsRouter.post("/links", zValidator("json", linkSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  const destination = normalizeDestination(input.destination);
  if (!destination) {
    return c.json(
      { error: "Destination must be a path (/pricing) or an https URL on a getsweepr.com domain" },
      400,
    );
  }

  let code = input.code?.toLowerCase() || slugifyLinkCode(input.label);
  if (!isValidLinkCode(code)) {
    return c.json({ error: "Code must be 2-64 characters: letters, numbers, hyphens" }, 400);
  }
  // On collision: explicit codes error (the admin picked it), generated
  // codes get a random suffix.
  const existing = (await sql`SELECT 1 FROM tracking_links WHERE code = ${code} LIMIT 1`) as unknown[];
  if (existing.length > 0) {
    if (input.code) return c.json({ error: `Code "${code}" is already in use` }, 409);
    code = `${code.slice(0, 59)}-${randomCodeSuffix()}`;
  }

  const rows = (await sql`
    INSERT INTO tracking_links (code, label, source, campaign_id, destination, notes, active, created_by_clerk_id)
    VALUES (${code}, ${input.label}, ${input.source}, ${input.campaignId ?? null},
            ${destination}, ${input.notes ?? null}, ${input.active ?? true}, ${c.get("user").clerkId})
    RETURNING id, code, label, source, campaign_id, destination, notes, active,
              hit_count, last_hit_at, created_at, updated_at
  `) as Array<Record<string, unknown>>;

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "tracking_link",
    targetId: code,
    metadata: { event: "tracking_link_created", source: input.source, destination },
    timestamp: new Date().toISOString(),
  });
  return c.json({ link: rows[0], url: `https://getsweepr.com/go/${code}` }, 201);
});

adminSiteAnalyticsRouter.patch("/links/:id", zValidator("json", linkSchema.partial()), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  let destination: string | null | undefined;
  if (input.destination !== undefined) {
    destination = normalizeDestination(input.destination);
    if (!destination) {
      return c.json(
        { error: "Destination must be a path (/pricing) or an https URL on a getsweepr.com domain" },
        400,
      );
    }
  }
  // The public code is intentionally immutable — printed QR codes and live ad
  // placements must never break. Create a new link instead.

  const rows = (await sql`
    UPDATE tracking_links SET
      label       = COALESCE(${input.label ?? null}, label),
      source      = COALESCE(${input.source ?? null}, source),
      campaign_id = CASE WHEN ${input.campaignId !== undefined} THEN ${input.campaignId ?? null} ELSE campaign_id END,
      destination = COALESCE(${destination ?? null}, destination),
      notes       = CASE WHEN ${input.notes !== undefined} THEN ${input.notes ?? null} ELSE notes END,
      active      = COALESCE(${input.active ?? null}, active),
      updated_at  = NOW()
    WHERE id = ${id}
    RETURNING id, code, label, source, campaign_id, destination, notes, active,
              hit_count, last_hit_at, created_at, updated_at
  `) as Array<Record<string, unknown>>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);

  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "tracking_link",
    targetId: String(rows[0].code),
    metadata: { event: "tracking_link_updated", changes: input },
    timestamp: new Date().toISOString(),
  });
  return c.json({ link: rows[0] });
});

adminSiteAnalyticsRouter.delete("/links/:id", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = (await sql`
    DELETE FROM tracking_links WHERE id = ${id} RETURNING code
  `) as Array<{ code: string }>;
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "tracking_link",
    targetId: rows[0].code,
    metadata: { event: "tracking_link_deleted" },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});
