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
 * Status engine — automated component health checks.
 *
 * The 15-minute cron calls runStatusChecks(); the public status page reads
 * getComponentStatus(). A component is "up" when its probe returns an
 * acceptable HTTP status within the timeout. The API component is probed as a
 * database round-trip rather than an HTTP self-call.
 *
 * Two check kinds feed the same status_checks table (keyed by `component`),
 * so both surface identically through getComponentStatus() / GET
 * /status/components — there is no separate storage or display path:
 *  - probe(): a bare HTTP fetch against STATUS_COMPONENTS. Cheap, fast, but
 *    structurally blind to a client-side crash — a Cloudflare Pages static
 *    host returns 200 for index.html even when the SPA then throws at
 *    runtime, so an HTTP-only probe can't tell a real page from a blank one.
 *  - renderProbe(): launches a real headless browser via Cloudflare Browser
 *    Rendering (RENDER_COMPONENTS) and confirms the SPA actually mounted —
 *    the "does it actually render" check an HTTP status code can't provide.
 *    Far heavier/slower than probe() and Browser Rendering sessions are
 *    metered/concurrency-limited, so these run on a coarser cadence — see
 *    shouldRunRenderChecks().
 */
import type { getDb } from "./db";
import { logger } from "./logger";
import puppeteer from "@cloudflare/puppeteer";

type Sql = ReturnType<typeof getDb>;

interface ComponentDef {
  key: string;
  label: string;
  /** HTTP probe URL; null = database round-trip probe. */
  url: string | null;
  /** Statuses accepted as healthy (some endpoints legitimately 401/403). */
  okStatuses?: number[];
}

export const STATUS_COMPONENTS: ComponentDef[] = [
  { key: "api", label: "API & Database", url: null },
  { key: "customer_app", label: "Customer Booking (clean.getsweepr.com)", url: "https://clean.getsweepr.com/" },
  { key: "cleaner_app", label: "Cleaner App (service.getsweepr.com)", url: "https://service.getsweepr.com/" },
  { key: "marketing", label: "Website (getsweepr.com)", url: "https://getsweepr.com/" },
  { key: "admin", label: "Admin Console", url: "https://admin.getsweepr.com/" },
  { key: "legal", label: "Legal (legal.getsweepr.com)", url: "https://legal.getsweepr.com/" },
  { key: "auth", label: "Authentication (Clerk)", url: "https://clerk.getsweepr.com/.well-known/jwks.json" },
  { key: "payments", label: "Payments (Stripe)", url: "https://api.stripe.com/healthcheck", okStatuses: [200, 401, 403, 404] },
];

const PROBE_TIMEOUT_MS = 8000;

async function probe(def: ComponentDef, sql: Sql): Promise<{ ok: boolean; latencyMs: number; detail: string | null }> {
  const start = Date.now();
  try {
    if (def.url === null) {
      await sql`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start, detail: null };
    }
    const res = await fetch(def.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "sweepr-status-engine/1.0" },
    });
    const acceptable = def.okStatuses ?? [200];
    const ok = acceptable.includes(res.status) || (res.status >= 200 && res.status < 400);
    return { ok, latencyMs: Date.now() - start, detail: ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message.slice(0, 200) : "probe failed",
    };
  }
}

interface RenderComponentDef {
  key: string;
  label: string;
  url: string;
  /**
   * CSS selector waited for after navigation — must only exist once React has
   * actually rendered real content (not present in the static index.html
   * shell), so a hung/crashed client-side render times out instead of
   * false-passing on a blank page.
   */
  waitForSelector: string;
}

/**
 * Synthetic render checks. Two real, distinct public pages, matching the two
 * that were reported down while the HTTP-only probes above stayed green:
 *  - Marketing homepage: waits for the header's "Sweepr home" logo link,
 *    which MarketingShell (packages/ui/src/layout/MarketingShell.tsx) only
 *    renders once React has mounted — the static shell has no such element.
 *  - Cleaner app: "/" is auth-gated (apps/cleaner/src/components/
 *    ProtectedRoute.tsx), so an unauthenticated synthetic visit client-side
 *    redirects to /sign-in, whose <main id="main-content"> (SignInPage.tsx)
 *    only appears after the SPA renders — a stable, unique root marker
 *    regardless of the visitor's auth state.
 */
export const RENDER_COMPONENTS: RenderComponentDef[] = [
  {
    key: "marketing_render",
    label: "Website Rendering (getsweepr.com)",
    url: "https://getsweepr.com/",
    waitForSelector: 'a[aria-label="Sweepr home"]',
  },
  {
    key: "cleaner_render",
    label: "Cleaner App Rendering (clean.getsweepr.com)",
    url: "https://clean.getsweepr.com/",
    waitForSelector: "#main-content",
  },
];

const RENDER_NAV_TIMEOUT_MS = 15_000;
const RENDER_SELECTOR_TIMEOUT_MS = 10_000;

/**
 * Render checks run once per hour (the cron fires every 15 minutes per
 * wrangler.toml `[triggers]`) rather than on every tick: each check launches
 * a full headless Chromium session, which is far slower than probe()'s bare
 * fetch and — unlike a plain HTTP request — Browser Rendering sessions are
 * metered and concurrency-limited on the Cloudflare account, so running them
 * every 15 minutes would burn through that budget for marginal freshness
 * gain on what is, in practice, a slow-changing failure mode (a bad deploy).
 * Exported so the cadence is directly unit-testable.
 */
export function shouldRunRenderChecks(now: Date = new Date()): boolean {
  return now.getUTCMinutes() < 15;
}

async function renderProbe(
  def: RenderComponentDef,
  browser: Fetcher | undefined,
): Promise<{ ok: boolean; latencyMs: number; detail: string | null }> {
  const start = Date.now();
  if (!browser) {
    // No MYBROWSER binding — either Browser Rendering hasn't been enabled on
    // the Cloudflare account yet, or this is a local/test environment.
    // Fail closed (unhealthy) with a clear reason rather than silently
    // skipping, so a missing binding is visible on the status page instead
    // of masquerading as "no data yet".
    return { ok: false, latencyMs: 0, detail: "Browser Rendering binding (MYBROWSER) not configured" };
  }

  // NOTE: this path (puppeteer.launch against a real MYBROWSER binding) can
  // only be exercised against a live Cloudflare account with Browser
  // Rendering enabled — there is no way to invoke Cloudflare's Browser
  // Rendering service from this development/test environment. It is written
  // to current official @cloudflare/puppeteer API shapes (verified against
  // the installed package's type definitions) and covered here by unit tests
  // that mock the binding, but needs a live-account smoke test after deploy.
  let browserSession: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  try {
    browserSession = await puppeteer.launch(browser);
    const page = await browserSession.newPage();

    // Client-side crashes are exactly what a status-code-only probe can't
    // see: an uncaught exception during render (pageerror) or a
    // console.error the app logs while failing (console, filtered to the
    // "error" type — verbose logs and warnings are not failures).
    page.on("pageerror", (err) => {
      pageErrors.push((err instanceof Error ? err.message : String(err)).slice(0, 300));
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });

    // domcontentloaded, not the default 'load': we don't care whether every
    // image/font finished, only that the SPA had a chance to boot — the
    // waitForSelector below is the real "did it render" gate.
    await page.goto(def.url, { waitUntil: "domcontentloaded", timeout: RENDER_NAV_TIMEOUT_MS });
    await page.waitForSelector(def.waitForSelector, { timeout: RENDER_SELECTOR_TIMEOUT_MS });

    const latencyMs = Date.now() - start;
    if (pageErrors.length > 0) {
      return { ok: false, latencyMs, detail: `uncaught page error: ${pageErrors[0]}` };
    }
    if (consoleErrors.length > 0) {
      return { ok: false, latencyMs, detail: `console error: ${consoleErrors[0]}` };
    }
    return { ok: true, latencyMs, detail: null };
  } catch (err) {
    // Covers navigation failure, the waitForSelector timeout (the SPA never
    // mounted real content — the exact "static shell OK, React crashed"
    // failure mode this check exists to catch), and browser launch failure.
    return {
      ok: false,
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message.slice(0, 200) : "render probe failed",
    };
  } finally {
    // Cloudflare bills/limits concurrent Browser Rendering sessions — always
    // close, even on a thrown error above.
    if (browserSession) {
      try {
        await browserSession.close();
      } catch (err) {
        logger.error("render probe browser close failed", err, { component: def.key });
      }
    }
  }
}

/** Run all component probes and record results. Called from the cron. */
export async function runStatusChecks(sql: Sql, browserBinding?: Fetcher): Promise<void> {
  const results = await Promise.all(STATUS_COMPONENTS.map(async (def) => ({ key: def.key, r: await probe(def, sql) })));

  // Render checks are heavier — run sequentially (not Promise.all) to avoid
  // holding multiple concurrent Browser Rendering sessions open at once, and
  // only on the coarser cadence described on shouldRunRenderChecks().
  const renderResults: Array<{ key: string; r: Awaited<ReturnType<typeof renderProbe>> }> = [];
  if (shouldRunRenderChecks()) {
    for (const def of RENDER_COMPONENTS) {
      renderResults.push({ key: def.key, r: await renderProbe(def, browserBinding) });
    }
  }

  for (const { key, r } of [...results, ...renderResults]) {
    try {
      await sql`
        INSERT INTO status_checks (component, ok, latency_ms, detail)
        VALUES (${key}, ${r.ok}, ${r.latencyMs}, ${r.detail})
      `;
    } catch (err) {
      logger.error("status check insert failed", err, { component: key });
    }
  }
  // Keep ~95 days of history; prune opportunistically (cheap, indexed).
  try {
    await sql`DELETE FROM status_checks WHERE checked_at < NOW() - INTERVAL '95 days'`;
  } catch (err) {
    logger.error("status check prune failed", err);
  }
}

export interface ComponentStatus {
  key: string;
  label: string;
  /** null = no checks recorded yet. */
  ok: boolean | null;
  latencyMs: number | null;
  checkedAt: string | null;
  /** 90-day uptime percentage (0-100), null when no history. */
  uptime90: number | null;
  /** Daily uptime buckets, oldest → newest: { date, pct }. */
  days: Array<{ date: string; pct: number }>;
}

/** Current state + 90-day daily uptime for every component. */
export async function getComponentStatus(sql: Sql): Promise<ComponentStatus[]> {
  const latest = (await sql`
    SELECT DISTINCT ON (component) component, ok, latency_ms, checked_at
    FROM status_checks
    ORDER BY component, checked_at DESC
  `) as Array<{ component: string; ok: boolean; latency_ms: number | null; checked_at: string }>;

  const daily = (await sql`
    SELECT component,
           to_char(date_trunc('day', checked_at), 'YYYY-MM-DD') AS day,
           ROUND(AVG(CASE WHEN ok THEN 100.0 ELSE 0.0 END), 2)::float AS pct
    FROM status_checks
    WHERE checked_at > NOW() - INTERVAL '90 days'
    GROUP BY component, date_trunc('day', checked_at)
    ORDER BY component, day
  `) as Array<{ component: string; day: string; pct: number }>;

  const latestBy = new Map(latest.map((r) => [r.component, r]));
  const daysBy = new Map<string, Array<{ date: string; pct: number }>>();
  for (const d of daily) {
    const arr = daysBy.get(d.component) ?? [];
    arr.push({ date: d.day, pct: d.pct });
    daysBy.set(d.component, arr);
  }

  // Render checks feed the exact same status_checks table/component-status
  // shape as the HTTP probes, so they're enumerated alongside
  // STATUS_COMPONENTS here rather than through a separate response field.
  const allDefs: Array<{ key: string; label: string }> = [...STATUS_COMPONENTS, ...RENDER_COMPONENTS];

  return allDefs.map((def) => {
    const l = latestBy.get(def.key);
    const days = daysBy.get(def.key) ?? [];
    const uptime90 = days.length
      ? Math.round((days.reduce((s, d) => s + d.pct, 0) / days.length) * 100) / 100
      : null;
    return {
      key: def.key,
      label: def.label,
      ok: l ? l.ok : null,
      latencyMs: l?.latency_ms ?? null,
      checkedAt: l?.checked_at ?? null,
      uptime90,
      days,
    };
  });
}
