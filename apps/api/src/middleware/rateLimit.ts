import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";

/**
 * Production rate limiter: Cloudflare KV-backed across Worker isolates, with an
 * in-memory fixed-window fallback for local dev where KV is unavailable.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "anon";
    const route = new URL(c.req.url).pathname;
    const key = `rl:${opts.keyPrefix ?? route}:${ip}`;

    const kv = c.env.RATE_LIMIT_KV;
    if (kv) {
      const current = Number((await kv.get(key)) ?? "0");
      if (current >= opts.limit) {
        return c.json({ error: "Too many requests" }, 429);
      }
      await kv.put(key, String(current + 1), {
        expirationTtl: Math.ceil(opts.windowMs / 1000),
      });
      c.header("X-RateLimit-Limit", String(opts.limit));
      c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - current - 1)));
    } else {
      // In-memory fallback for dev.
      const now = Date.now();
      const entry = buckets.get(key);
      if (!entry || entry.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - 1)));
      } else {
        entry.count += 1;
        if (entry.count > opts.limit) {
          return c.json({ error: "Too many requests" }, 429);
        }
        c.header(
          "X-RateLimit-Remaining",
          String(Math.max(0, opts.limit - entry.count))
        );
      }
      c.header("X-RateLimit-Limit", String(opts.limit));
    }

    await next();
  });
}
