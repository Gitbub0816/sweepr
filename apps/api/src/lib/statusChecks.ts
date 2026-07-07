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
 */
import type { getDb } from "./db";
import { logger } from "./logger";

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

/** Run all component probes and record results. Called from the cron. */
export async function runStatusChecks(sql: Sql): Promise<void> {
  const results = await Promise.all(STATUS_COMPONENTS.map(async (def) => ({ def, r: await probe(def, sql) })));
  for (const { def, r } of results) {
    try {
      await sql`
        INSERT INTO status_checks (component, ok, latency_ms, detail)
        VALUES (${def.key}, ${r.ok}, ${r.latencyMs}, ${r.detail})
      `;
    } catch (err) {
      logger.error("status check insert failed", err, { component: def.key });
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

  return STATUS_COMPONENTS.map((def) => {
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
