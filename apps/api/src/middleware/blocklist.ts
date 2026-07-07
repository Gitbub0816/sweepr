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
 * IP blocklist enforcement.
 *
 * Checks CF-Connecting-IP against the ip_blocklist table (managed from the
 * admin Security console) and rejects blocked IPs with 403 before any route
 * runs. The list is cached in-memory per isolate for 60 seconds so the check
 * adds no per-request DB round-trip in steady state. Fails open: any DB error
 * keeps serving traffic (with the last good copy when one exists).
 */
import { createMiddleware } from "hono/factory";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

const CACHE_TTL_MS = 60_000;

let cachedIps: Set<string> | null = null;
let cachedAt = 0;

/** Test hook: drop the per-isolate cache so the next request refetches. */
export function resetBlocklistCache(): void {
  cachedIps = null;
  cachedAt = 0;
}

async function loadBlocklist(databaseUrl: string): Promise<Set<string> | null> {
  try {
    const sql = getDb(databaseUrl);
    const rows = (await sql`
      SELECT ip FROM ip_blocklist
      WHERE expires_at IS NULL OR expires_at > NOW()
    `) as Array<{ ip: string }>;
    return new Set(rows.map((r) => r.ip));
  } catch {
    return null;
  }
}

export const ipBlocklist = createMiddleware<AppBindings>(async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP");
  if (!ip) return next();

  const now = Date.now();
  if (!cachedIps || now - cachedAt > CACHE_TTL_MS) {
    const fresh = await loadBlocklist(c.env.DATABASE_URL);
    // On failure keep the stale copy (fail open) but still bump the clock so
    // a broken DB isn't re-queried on every request.
    if (fresh) cachedIps = fresh;
    cachedAt = now;
  }

  if (cachedIps?.has(ip)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
});
