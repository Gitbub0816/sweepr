import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";
import { firestoreGet, firestoreSet, fsInt, fsTimestamp, readInt, readTimestamp } from "../lib/firestore";

// Per-isolate in-memory state. Firestore is only written when a window resets
// (1 write per IP per window instead of 1 write per request).
const memory = new Map<string, { count: number; resetAt: number; synced: boolean }>();

const COLLECTION = "rate_limit_buckets";

function inMemoryCheck(
  key: string,
  now: number,
  windowMs: number,
  limit: number
): { count: number; remaining: number; blocked: boolean } {
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs, synced: false });
    return { count: 1, remaining: limit - 1, blocked: false };
  }
  entry.count += 1;
  const blocked = entry.count > limit;
  return { count: entry.count, remaining: Math.max(0, limit - entry.count), blocked };
}

export function rateLimit(opts: { limit: number; windowMs: number; keyPrefix?: string }) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      "anon";
    const route = new URL(c.req.url).pathname;
    const key = `rl:${opts.keyPrefix ?? route}:${ip}`;
    const now = Date.now();

    const saJson = c.env.FIREBASE_SERVICE_ACCOUNT ?? "";
    let remaining = opts.limit - 1;
    let blocked = false;

    if (saJson) {
      try {
        const project = (JSON.parse(saJson) as { project_id: string }).project_id;
        const local = memory.get(key);

        if (!local || local.resetAt < now) {
          // Window expired or first request — check Firestore for cross-isolate state
          const doc = await firestoreGet(saJson, project, COLLECTION, key);
          const fsResetAt = doc ? readTimestamp(doc, "resetAt") : 0;
          const fsCount = doc ? readInt(doc, "count") : 0;

          if (!doc || fsResetAt < now) {
            // Start fresh window — write once
            const resetAt = now + opts.windowMs;
            await firestoreSet(saJson, project, COLLECTION, key, {
              count: fsInt(1),
              resetAt: fsTimestamp(resetAt),
            });
            memory.set(key, { count: 1, resetAt, synced: true });
            remaining = opts.limit - 1;
          } else {
            // Another isolate already started this window — adopt its state
            memory.set(key, { count: fsCount + 1, resetAt: fsResetAt, synced: true });
            blocked = fsCount + 1 > opts.limit;
            remaining = Math.max(0, opts.limit - (fsCount + 1));
          }
        } else {
          // Within window — count locally, no Firestore write
          local.count += 1;
          blocked = local.count > opts.limit;
          remaining = Math.max(0, opts.limit - local.count);
        }
      } catch {
        ({ remaining, blocked } = inMemoryCheck(key, now, opts.windowMs, opts.limit));
      }
    } else {
      ({ remaining, blocked } = inMemoryCheck(key, now, opts.windowMs, opts.limit));
    }

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (blocked) return c.json({ error: "Too many requests" }, 429);
    await next();
  });
}
