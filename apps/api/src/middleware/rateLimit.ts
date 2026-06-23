import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";

// In-memory fixed-window buckets per Worker isolate.
// KV was removed — its 1,000 writes/day free-tier limit caused 500s on every request.
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

    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      c.header("X-RateLimit-Remaining", String(opts.limit - 1));
    } else {
      entry.count += 1;
      if (entry.count > opts.limit) {
        return c.json({ error: "Too many requests" }, 429);
      }
      c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - entry.count)));
    }
    c.header("X-RateLimit-Limit", String(opts.limit));

    await next();
  });
}
