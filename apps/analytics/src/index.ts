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
 * sweepr-analytics worker — first-party site analytics, separate from the
 * sweepr-api worker so beacon traffic never shares the API's rate limits or
 * failure domain. Two jobs:
 *
 *  1. POST /collect — ingest beacon for the site tracker
 *     (packages/ui/src/lib/siteTracker.ts). Enriches events with Cloudflare
 *     request geo (country/region/city/lat/lon — city-level only), a parsed
 *     user agent, and a salted IP hash (raw IPs are never stored), then
 *     writes site_events + upserts site_sessions in Neon.
 *
 *  2. GET /go/{code} — tracking-link redirector for admin-created links
 *     (tracking_links). Records the hit, then 302s to the validated
 *     *.getsweepr.com destination with swl/sws/swc params appended so the
 *     tracker attributes the landing session to the link's source/campaign.
 *
 * Optional IPinfo enrichment (IPINFO_TOKEN): first event of a session and
 * link hits get ISP/company + VPN/proxy privacy flags.
 */

import { Hono } from "hono";
import { createClient, type Sql } from "@sweepr/db";
import { normalizeDestination, parseUserAgent } from "@sweepr/utils";
import {
  isAllowedOrigin,
  normalizeBatch,
  parseTrackerCookies,
  type NormalizedEvent,
} from "./normalize";

interface Env {
  ENVIRONMENT: string;
  DATABASE_URL: string;
  /** Optional salt for the stored IP hash; derived from DATABASE_URL when unset. */
  ANALYTICS_IP_SALT?: string;
  /** Optional IPinfo.io token — enables ISP/VPN enrichment when present. */
  IPINFO_TOKEN?: string;
}

type Bindings = { Bindings: Env };

const app = new Hono<Bindings>();

// The Neon HTTP driver is a stateless fetch wrapper — memoizing per isolate
// is safe (same pattern as apps/api/src/lib/db.ts).
const clientCache = new Map<string, Sql>();
function getDb(databaseUrl: string): Sql {
  let sql = clientCache.get(databaseUrl);
  if (!sql) {
    sql = createClient(databaseUrl);
    clientCache.set(databaseUrl, sql);
  }
  return sql;
}

// ---------------------------------------------------------------------------
// Small in-isolate caches (best-effort; isolates are ephemeral)
// ---------------------------------------------------------------------------

/** Per-IP ingest budget: 300 events / 5 min. */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function allowEvents(ip: string, n: number): boolean {
  const now = Date.now();
  if (rateBuckets.size > 10_000) rateBuckets.clear();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(ip, { count: n, resetAt: now + 5 * 60_000 });
    return true;
  }
  bucket.count += n;
  return bucket.count <= 300;
}

interface LinkRow {
  id: string;
  code: string;
  source: string;
  campaign_id: string | null;
  destination: string;
  active: boolean;
}
const linkCache = new Map<string, { row: LinkRow | null; expiresAt: number }>();

async function lookupLink(sql: Sql, code: string): Promise<LinkRow | null> {
  const cached = linkCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.row;
  const rows = (await sql`
    SELECT id, code, source, campaign_id, destination, active
    FROM tracking_links WHERE code = ${code} LIMIT 1
  `) as LinkRow[];
  const row = rows[0] && rows[0].active ? rows[0] : null;
  if (linkCache.size > 5_000) linkCache.clear();
  linkCache.set(code, { row, expiresAt: Date.now() + 60_000 });
  return row;
}

const ipinfoCache = new Map<string, { data: Record<string, unknown> | null; expiresAt: number }>();

/** IPinfo lookup with a 6h in-isolate cache; returns null on any failure. */
async function ipinfoLookup(ip: string, token: string): Promise<Record<string, unknown> | null> {
  const cached = ipinfoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let data: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      // Keep only aggregate-level signals — never store the raw IP echo.
      data = {
        org: raw.org ?? null,
        company: (raw.company as { name?: string } | undefined)?.name ?? null,
        privacy: raw.privacy ?? null,
        carrier: (raw.carrier as { name?: string } | undefined)?.name ?? null,
      };
    }
  } catch {
    data = null;
  }
  if (ipinfoCache.size > 5_000) ipinfoCache.clear();
  ipinfoCache.set(ip, { data, expiresAt: Date.now() + 6 * 60 * 60_000 });
  return data;
}

// ---------------------------------------------------------------------------
// Request-context enrichment
// ---------------------------------------------------------------------------

interface GeoContext {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  asnOrg: string | null;
}

function geoFrom(request: Request): GeoContext {
  const cf = (request as { cf?: Record<string, unknown> }).cf ?? {};
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    country: s(cf.country),
    region: s(cf.region) ?? s(cf.regionCode),
    city: s(cf.city),
    timezone: s(cf.timezone),
    latitude: num(cf.latitude),
    longitude: num(cf.longitude),
    asnOrg: s(cf.asOrganization),
  };
}

async function hashIp(ip: string, env: Env): Promise<string> {
  const salt = env.ANALYTICS_IP_SALT || `swa:${env.DATABASE_URL ?? ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

interface EventRow extends NormalizedEvent {
  visitor_id: string;
  session_id: string;
  device_type: string;
  browser: string;
  browser_ver: string | null;
  os: string;
  os_ver: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  asn_org: string | null;
  ip_hash: string;
  is_bot: boolean;
  ipinfo: Record<string, unknown> | null;
}

async function insertEvents(sql: Sql, rows: EventRow[]): Promise<void> {
  await sql`
    INSERT INTO site_events (
      occurred_at, app, event_type, visitor_id, session_id, path, referrer,
      source, campaign_id, link_code, click_target, click_href, click_text,
      device_type, browser, browser_ver, os, os_ver,
      screen_w, screen_h, viewport_w, viewport_h, language,
      country, region, city, timezone, latitude, longitude, asn_org,
      ip_hash, is_bot, ipinfo, meta
    )
    SELECT
      r.occurred_at, r.app, r.event_type, r.visitor_id, r.session_id, r.path, r.referrer,
      r.source, r.campaign_id, r.link_code, r.click_target, r.click_href, r.click_text,
      r.device_type, r.browser, r.browser_ver, r.os, r.os_ver,
      r.screen_w, r.screen_h, r.viewport_w, r.viewport_h, r.language,
      r.country, r.region, r.city, r.timezone, r.latitude, r.longitude, r.asn_org,
      r.ip_hash, COALESCE(r.is_bot, FALSE), r.ipinfo, COALESCE(r.meta, '{}'::jsonb)
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
      occurred_at timestamptz, app text, event_type text, visitor_id text, session_id text,
      path text, referrer text, source text, campaign_id text, link_code text,
      click_target text, click_href text, click_text text,
      device_type text, browser text, browser_ver text, os text, os_ver text,
      screen_w int, screen_h int, viewport_w int, viewport_h int, language text,
      country text, region text, city text, timezone text, latitude real, longitude real,
      asn_org text, ip_hash text, is_bot boolean, ipinfo jsonb, meta jsonb
    )
  `;
}

async function upsertSession(sql: Sql, rows: EventRow[]): Promise<void> {
  const first = rows[0];
  const pageviews = rows.filter((r) => r.event_type === "pageview");
  const clicks = rows.filter((r) => r.event_type === "click").length;
  const attributed = rows.find((r) => r.source || r.link_code);
  const entry = pageviews[0]?.path ?? null;
  const exit = pageviews[pageviews.length - 1]?.path ?? null;
  const firstAt = rows.reduce((a, r) => (r.occurred_at < a ? r.occurred_at : a), rows[0].occurred_at);
  const lastAt = rows.reduce((a, r) => (r.occurred_at > a ? r.occurred_at : a), rows[0].occurred_at);
  await sql`
    INSERT INTO site_sessions (
      session_id, visitor_id, first_seen_at, last_seen_at, app, entry_path, exit_path,
      referrer, source, campaign_id, link_code, device_type, browser, os,
      country, region, city, latitude, longitude, is_bot, pageviews, clicks, events
    ) VALUES (
      ${first.session_id}, ${first.visitor_id}, ${firstAt}, ${lastAt}, ${first.app},
      ${entry}, ${exit}, ${pageviews[0]?.referrer ?? null},
      ${attributed?.source ?? null}, ${attributed?.campaign_id ?? null}, ${attributed?.link_code ?? null},
      ${first.device_type}, ${first.browser}, ${first.os},
      ${first.country}, ${first.region}, ${first.city}, ${first.latitude}, ${first.longitude},
      ${first.is_bot}, ${pageviews.length}, ${clicks}, ${rows.length}
    )
    ON CONFLICT (session_id) DO UPDATE SET
      last_seen_at = GREATEST(site_sessions.last_seen_at, EXCLUDED.last_seen_at),
      exit_path    = COALESCE(EXCLUDED.exit_path, site_sessions.exit_path),
      source       = COALESCE(site_sessions.source, EXCLUDED.source),
      campaign_id  = COALESCE(site_sessions.campaign_id, EXCLUDED.campaign_id),
      link_code    = COALESCE(site_sessions.link_code, EXCLUDED.link_code),
      pageviews    = site_sessions.pageviews + EXCLUDED.pageviews,
      clicks       = site_sessions.clicks + EXCLUDED.clicks,
      events       = site_sessions.events + EXCLUDED.events
  `;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (c) => c.json({ name: "sweepr-analytics", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));

// The tracker sends a plain-text body (CORS "simple request" — no preflight),
// but keep OPTIONS working for anything that does preflight.
app.options("/collect", (c) => {
  const origin = c.req.header("origin");
  if (!isAllowedOrigin(origin)) return c.body(null, 403);
  return c.body(null, 204, {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
});

app.post("/collect", async (c) => {
  const origin = c.req.header("origin");
  if (!isAllowedOrigin(origin)) return c.body(null, 403);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await c.req.text());
  } catch {
    return c.body(null, 400);
  }
  const batch = normalizeBatch(parsed);
  if (!batch) return c.body(null, 400);

  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  if (!allowEvents(ip, batch.events.length)) return c.body(null, 429);

  const ua = parseUserAgent(c.req.header("user-agent"));
  const geo = geoFrom(c.req.raw);
  const env = c.env;
  const responseHeaders = { "Access-Control-Allow-Origin": origin!, "Cache-Control": "no-store" };

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const sql = getDb(env.DATABASE_URL);
        const ipHash = await hashIp(ip, env);

        // IPinfo enrichment only for sessions we haven't seen yet — one
        // lookup per session, not per beacon.
        let ipinfo: Record<string, unknown> | null = null;
        if (env.IPINFO_TOKEN && !ua.isBot) {
          const seen = (await sql`
            SELECT 1 FROM site_sessions WHERE session_id = ${batch.sid} LIMIT 1
          `) as unknown[];
          if (seen.length === 0) ipinfo = await ipinfoLookup(ip, env.IPINFO_TOKEN);
        }

        const rows: EventRow[] = batch.events.map((e) => ({
          ...e,
          visitor_id: batch.vid,
          session_id: batch.sid,
          device_type: ua.deviceType,
          browser: ua.browser,
          browser_ver: ua.browserVer,
          os: ua.os,
          os_ver: ua.osVer,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          timezone: geo.timezone,
          latitude: geo.latitude,
          longitude: geo.longitude,
          asn_org: geo.asnOrg,
          ip_hash: ipHash,
          is_bot: ua.isBot,
          ipinfo,
        }));
        await insertEvents(sql, rows);
        await upsertSession(sql, rows);
      } catch (err) {
        // Ingest is fire-and-forget: log to the worker's observability
        // stream, never fail the beacon.
        console.error("collect failed", err instanceof Error ? err.message : err);
      }
    })(),
  );

  return c.body(null, 204, responseHeaders);
});

const HOME = "https://getsweepr.com/";

app.get("/go/:code", async (c) => {
  const code = c.req.param("code");
  const env = c.env;
  let redirectTo = HOME;

  try {
    const sql = getDb(env.DATABASE_URL);
    const link = /^[a-z0-9_-]{2,64}$/i.test(code) ? await lookupLink(sql, code) : null;

    if (link) {
      const dest = normalizeDestination(link.destination);
      if (dest) {
        const url = new URL(dest);
        // Forward extra params the ad platform appended (gclid & co), then
        // stamp our attribution params for the landing tracker.
        const incoming = new URL(c.req.url).searchParams;
        incoming.forEach((value, key) => {
          if (!["swl", "sws", "swc"].includes(key) && !url.searchParams.has(key)) {
            url.searchParams.set(key, value);
          }
        });
        url.searchParams.set("swl", link.code);
        url.searchParams.set("sws", link.source);
        if (link.campaign_id) url.searchParams.set("swc", link.campaign_id);
        redirectTo = url.toString();
      }

      const ua = parseUserAgent(c.req.header("user-agent"));
      const geo = geoFrom(c.req.raw);
      const cookies = parseTrackerCookies(c.req.header("cookie"));
      const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
      const referrer = c.req.header("referer") ?? null;

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const ipHash = await hashIp(ip, env);
            const ipinfo =
              env.IPINFO_TOKEN && !ua.isBot ? await ipinfoLookup(ip, env.IPINFO_TOKEN) : null;
            const hit: EventRow = {
              occurred_at: new Date().toISOString(),
              app: "marketing",
              event_type: "link_hit",
              // Redirect hits happen before the tracker runs; attribute to
              // the existing visitor when the swa_* cookies are present.
              visitor_id: cookies.vid ?? `lh-${crypto.randomUUID()}`,
              session_id: cookies.sid ?? `lh-${crypto.randomUUID()}`,
              path: `/go/${link.code}`,
              referrer: referrer ? referrer.slice(0, 512) : null,
              source: link.source,
              campaign_id: link.campaign_id,
              link_code: link.code,
              click_target: null,
              click_href: redirectTo.slice(0, 512),
              click_text: null,
              screen_w: null,
              screen_h: null,
              viewport_w: null,
              viewport_h: null,
              language: c.req.header("accept-language")?.split(",")[0]?.slice(0, 35) ?? null,
              device_type: ua.deviceType,
              browser: ua.browser,
              browser_ver: ua.browserVer,
              os: ua.os,
              os_ver: ua.osVer,
              country: geo.country,
              region: geo.region,
              city: geo.city,
              timezone: geo.timezone,
              latitude: geo.latitude,
              longitude: geo.longitude,
              asn_org: geo.asnOrg,
              ip_hash: ipHash,
              is_bot: ua.isBot,
              ipinfo,
              meta: {},
            };
            await insertEvents(sql, [hit]);
            await sql`
              UPDATE tracking_links
              SET hit_count = hit_count + 1, last_hit_at = NOW()
              WHERE id = ${link.id}
            `;
          } catch (err) {
            console.error("link hit record failed", err instanceof Error ? err.message : err);
          }
        })(),
      );
    }
  } catch (err) {
    // A broken lookup must still redirect somewhere sensible.
    console.error("go lookup failed", err instanceof Error ? err.message : err);
  }

  // Never let an intermediary cache a redirect — link destinations are editable.
  c.header("Cache-Control", "no-store");
  return c.redirect(redirectTo, 302);
});

app.notFound((c) => c.redirect(HOME, 302));

export default app;
