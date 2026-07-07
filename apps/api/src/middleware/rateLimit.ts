/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { createMiddleware } from "hono/factory";
import { captureFromContext } from "../lib/securityEvents";
import type { AppBindings } from "../types";

// Per-isolate in-memory state. Used as a fast local cache; KV is the shared
// source of truth across Cloudflare's many isolates.
const memory = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  by?: "ip" | "user";
  /**
   * Strict buckets write the incremented count back to KV on EVERY request so
   * sustained abuse accumulates across isolates. Without this, a request that
   * lands on a fresh isolate reads KV, increments only its local copy, and
   * never writes back — leaving KV pinned at its initial value so every new
   * isolate reads a low count and allows the request (the limiter leaks).
   * Use for security-sensitive, low-traffic buckets (auth, payments, bypass).
   * Non-strict is a cheaper best-effort limiter fine for the broad general cap.
   *
   * NOTE: KV is eventually consistent, so a single simultaneous global burst
   * can still slip through; sustained brute force (the real threat) is blocked.
   * For hard guarantees, move these buckets to a Durable Object counter.
   */
  strict?: boolean;
}) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "anon";
    const identity = opts.by === "user" ? (c.get("user")?.clerkId ?? ip) : ip;
    const route = new URL(c.req.url).pathname;
    const key = `rl:${opts.keyPrefix ?? route}:${identity}`;
    const now = Date.now();
    const kv = c.env.RATE_LIMIT_KV;

    let blocked = false;
    let remaining = opts.limit - 1;
    let resetAtOut = now + opts.windowMs;

    try {
      if (opts.strict && kv) {
        // Read-modify-write against KV every request. Read the shared count,
        // increment, and write it straight back so other isolates observe it.
        const raw = await kv.get(key, "text");
        const stored = raw
          ? (JSON.parse(raw) as { count: number; resetAt: number })
          : null;

        let count: number;
        let resetAt: number;
        if (!stored || stored.resetAt < now) {
          count = 1;
          resetAt = now + opts.windowMs;
        } else {
          count = stored.count + 1;
          resetAt = stored.resetAt;
        }

        blocked = count > opts.limit;
        remaining = Math.max(0, opts.limit - count);
        resetAtOut = resetAt;

        // Persist the incremented count even when blocked, so hammering keeps
        // the counter pinned above the limit for the whole window.
        await kv.put(key, JSON.stringify({ count, resetAt }), {
          expirationTtl: Math.ceil((resetAt - now) / 1000) + 60,
        });
        memory.set(key, { count, resetAt });
      } else {
        // Best-effort path: local cache first, sync with KV only on window roll.
        const local = memory.get(key);
        if (!local || local.resetAt < now) {
          const raw = kv ? await kv.get(key, "text") : null;
          const stored = raw ? (JSON.parse(raw) as { count: number; resetAt: number }) : null;

          if (!stored || stored.resetAt < now) {
            const resetAt = now + opts.windowMs;
            const entry = { count: 1, resetAt };
            memory.set(key, entry);
            if (kv) {
              await kv.put(key, JSON.stringify(entry), {
                expirationTtl: Math.ceil(opts.windowMs / 1000) + 60,
              });
            }
            remaining = opts.limit - 1;
            resetAtOut = resetAt;
          } else {
            const count = stored.count + 1;
            memory.set(key, { count, resetAt: stored.resetAt });
            blocked = count > opts.limit;
            remaining = Math.max(0, opts.limit - count);
            resetAtOut = stored.resetAt;
          }
        } else {
          local.count += 1;
          blocked = local.count > opts.limit;
          remaining = Math.max(0, opts.limit - local.count);
          resetAtOut = local.resetAt;
        }
      }
    } catch {
      // On any error fall through — don't block legitimate traffic.
    }

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (blocked) {
      const retryAfterSec = Math.max(1, Math.ceil((resetAtOut - now) / 1000));
      c.header("Retry-After", String(retryAfterSec));

      // Surface every 429 as a security event so sustained abuse is visible
      // in the security console — buckets whose keyPrefix looks auth-related
      // are treated as higher severity (a rate-limited login/token endpoint
      // is a much stronger brute-force signal than a generic API cap).
      const authLike = /auth|login|token|sign[-_]?in|password|otp|mfa/i.test(opts.keyPrefix ?? route);
      captureFromContext(c, "rate_limit_exceeded", authLike ? "high" : "medium", {
        keyPrefix: opts.keyPrefix ?? route,
        limit: opts.limit,
        windowMs: opts.windowMs,
      });

      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
}
