import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";

/**
 * Naive in-memory fixed-window rate limiter. Fine for a single worker isolate /
 * local dev; swap for Durable Objects or KV for production correctness.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: { limit: number; windowMs: number }) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For") ??
      "anonymous";
    const key = `${ip}:${new URL(c.req.url).pathname}`;
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    } else {
      entry.count += 1;
      if (entry.count > opts.limit) {
        return c.json({ error: "Rate limit exceeded" }, 429);
      }
    }

    await next();
  });
}
