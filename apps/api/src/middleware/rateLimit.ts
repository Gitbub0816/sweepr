import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";

// Per-isolate in-memory state. KV is only read/written when a window resets.
const memory = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(opts: {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  by?: "ip" | "user";
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
      const local = memory.get(key);

      if (!local || local.resetAt < now) {
        // Window expired — sync with KV for cross-isolate consistency
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
    } catch {
      // On any error fall through — don't block legitimate traffic
    }

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (blocked) {
      const retryAfterSec = Math.max(1, Math.ceil((resetAtOut - now) / 1000));
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
}
