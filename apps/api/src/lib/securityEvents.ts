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
 * Security event telemetry — best-effort recording of auth failures, rate
 * limit strikes, webhook signature failures, and brute-force detection.
 *
 * Every function here is intentionally best-effort: telemetry must never
 * break the request path it's observing. Callers should fire-and-forget via
 * `c.executionCtx.waitUntil(...)` where a Hono Context is available (so the
 * insert doesn't add latency to the response), and fall back to a plain
 * awaited call where it isn't (e.g. inside code that runs after the response
 * would already be sent, or in contexts without an executionCtx).
 */
import type { Context } from "hono";
import { getDb, type Sql } from "./db";
import { logger } from "./logger";
import type { AppBindings } from "../types";

export type SecurityEventType =
  | "auth_failure"
  | "rate_limit_exceeded"
  | "webhook_signature_failure"
  | "brute_force_suspected"
  | "forbidden_access"
  | "other";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export interface SecurityEventInput {
  eventType: SecurityEventType;
  severity?: SecuritySeverity;
  ip?: string | null;
  path?: string | null;
  method?: string | null;
  clerkId?: string | null;
  userAgent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  colo?: string | null;
  asn?: string | null;
  details?: Record<string, unknown>;
}

/** Number of auth_failure/rate_limit_exceeded events from one IP in this
 * trailing window that trips the brute-force escalation. */
const BRUTE_FORCE_WINDOW_MS = 15 * 60 * 1000;
/** Escalate exactly when the count reaches this threshold (not "every time
 * after"), so a sustained attack produces one critical alert per burst
 * instead of spamming a critical event on every subsequent strike. */
export const BRUTE_FORCE_THRESHOLD = 8;

/**
 * Given the running count of recent auth_failure/rate_limit_exceeded events
 * from an IP (including the one just inserted), decide whether this strike
 * is the one that should trip the brute-force alert.
 *
 * Pulled out as pure logic so it's unit-testable without a DB.
 */
export function shouldEscalateToBruteForce(countIncludingThisEvent: number): boolean {
  return countIncludingThisEvent === BRUTE_FORCE_THRESHOLD;
}

const ESCALATABLE_TYPES: SecurityEventType[] = ["auth_failure", "rate_limit_exceeded"];

/**
 * Insert a security event row. Never throws — logs and swallows on failure
 * so telemetry can't take down the request it's observing.
 *
 * After inserting an escalatable event type (auth_failure /
 * rate_limit_exceeded) with a known IP, checks the trailing 15-minute count
 * for that IP and — on the exact 8th strike — inserts a companion
 * `brute_force_suspected` critical event.
 */
export async function recordSecurityEvent(sql: Sql, input: SecurityEventInput): Promise<void> {
  try {
    await sql`
      INSERT INTO security_events
        (event_type, severity, ip, path, method, clerk_id, user_agent,
         country, region, city, colo, asn, details)
      VALUES (
        ${input.eventType}, ${input.severity ?? "medium"}, ${input.ip ?? null},
        ${input.path ?? null}, ${input.method ?? null}, ${input.clerkId ?? null},
        ${input.userAgent ?? null}, ${input.country ?? null}, ${input.region ?? null},
        ${input.city ?? null}, ${input.colo ?? null}, ${input.asn ?? null},
        ${JSON.stringify(input.details ?? {})}
      )
    `;

    if (input.ip && ESCALATABLE_TYPES.includes(input.eventType)) {
      await maybeEscalateBruteForce(sql, input);
    }
  } catch (err) {
    logger.warn("securityEvents.record_failed", { error: (err as Error)?.message, eventType: input.eventType });
  }
}

async function maybeEscalateBruteForce(sql: Sql, input: SecurityEventInput): Promise<void> {
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM security_events
      WHERE ip = ${input.ip}
        AND event_type IN ('auth_failure', 'rate_limit_exceeded')
        AND occurred_at > NOW() - INTERVAL '15 minutes'
    `) as Array<{ count: number }>;
    const count = rows[0]?.count ?? 0;

    if (shouldEscalateToBruteForce(count)) {
      await sql`
        INSERT INTO security_events
          (event_type, severity, ip, path, method, clerk_id, user_agent,
           country, region, city, colo, asn, details)
        VALUES (
          'brute_force_suspected', 'critical', ${input.ip}, ${input.path ?? null},
          ${input.method ?? null}, ${input.clerkId ?? null}, ${input.userAgent ?? null},
          ${input.country ?? null}, ${input.region ?? null}, ${input.city ?? null},
          ${input.colo ?? null}, ${input.asn ?? null},
          ${JSON.stringify({ windowMs: BRUTE_FORCE_WINDOW_MS, strikeCount: count })}
        )
      `;
    }
  } catch (err) {
    logger.warn("securityEvents.escalation_failed", { error: (err as Error)?.message, ip: input.ip });
  }
}

/**
 * Convenience wrapper: derive ip/path/method/ua/geo from a Hono Context and
 * record a security event. Schedules the insert on `c.executionCtx.waitUntil`
 * when available so it never adds latency to the response; falls back to a
 * fire-and-forget (unawaited, error-swallowed) call otherwise.
 */
export function captureFromContext(
  c: Context<AppBindings>,
  eventType: SecurityEventType,
  severity: SecuritySeverity,
  details?: Record<string, unknown>,
): void {
  try {
    const sql = getDb(c.env.DATABASE_URL);
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      null;
    const cf = (c.req.raw as unknown as { cf?: Record<string, unknown> }).cf ?? {};
    const clerkId = (() => {
      try {
        return c.get("user")?.clerkId ?? null;
      } catch {
        return null;
      }
    })();

    const input: SecurityEventInput = {
      eventType,
      severity,
      ip,
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      clerkId,
      userAgent: c.req.header("User-Agent") ?? null,
      country: (cf.country as string) ?? null,
      region: (cf.region as string) ?? null,
      city: (cf.city as string) ?? null,
      colo: (cf.colo as string) ?? null,
      asn: cf.asn != null ? String(cf.asn) : null,
      details,
    };

    const task = recordSecurityEvent(sql, input);
    // c.executionCtx is a getter that throws when running outside a real
    // fetch environment (e.g. some test/local runtimes) — guard with try/catch
    // rather than a truthiness check.
    let scheduled = false;
    try {
      c.executionCtx.waitUntil(task);
      scheduled = true;
    } catch {
      /* no executionCtx available — fall through to fire-and-forget */
    }
    if (!scheduled) {
      // The promise itself already swallows errors inside recordSecurityEvent.
      void task;
    }
  } catch (err) {
    // Context introspection itself failed (e.g. missing env) — never throw.
    logger.warn("securityEvents.capture_failed", { error: (err as Error)?.message, eventType });
  }
}
