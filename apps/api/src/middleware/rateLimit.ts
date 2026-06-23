import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";
import {
  firestoreGet,
  firestoreSet,
  fsInt,
  fsTimestamp,
  readInt,
  readTimestamp,
} from "../lib/firestore";

// In-memory fallback used when FIREBASE_SERVICE_ACCOUNT is absent or when
// a Firestore call fails (keeps requests moving even on cold errors).
const fallback = new Map<string, { count: number; resetAt: number }>();

const COLLECTION = "rate_limit_buckets";

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

    const saJson = c.env.FIREBASE_SERVICE_ACCOUNT ?? "";
    let count = 1;
    let remaining = opts.limit - 1;
    let blocked = false;

    if (saJson) {
      try {
        const project = (JSON.parse(saJson) as { project_id: string }).project_id;
        const doc = await firestoreGet(saJson, project, COLLECTION, key);

        const resetAt = doc ? readTimestamp(doc, "resetAt") : 0;
        const prevCount = doc ? readInt(doc, "count") : 0;

        if (!doc || resetAt < now) {
          await firestoreSet(saJson, project, COLLECTION, key, {
            count: fsInt(1),
            resetAt: fsTimestamp(now + opts.windowMs),
          });
          count = 1;
        } else {
          count = prevCount + 1;
          await firestoreSet(saJson, project, COLLECTION, key, {
            count: fsInt(count),
            resetAt: fsTimestamp(resetAt),
          });
        }

        if (count > opts.limit) blocked = true;
        remaining = Math.max(0, opts.limit - count);
      } catch {
        // Firebase unreachable — fall through to in-memory
        const entry = fallback.get(key);
        if (!entry || entry.resetAt < now) {
          fallback.set(key, { count: 1, resetAt: now + opts.windowMs });
        } else {
          entry.count += 1;
          if (entry.count > opts.limit) blocked = true;
          remaining = Math.max(0, opts.limit - entry.count);
        }
      }
    } else {
      // No Firebase — in-memory only
      const entry = fallback.get(key);
      if (!entry || entry.resetAt < now) {
        fallback.set(key, { count: 1, resetAt: now + opts.windowMs });
      } else {
        entry.count += 1;
        if (entry.count > opts.limit) blocked = true;
        remaining = Math.max(0, opts.limit - entry.count);
      }
    }

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (blocked) {
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  });
}
