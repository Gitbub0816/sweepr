import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

// CSRF note: this API uses Authorization: Bearer tokens, not cookies.
// CSRF attacks require cookie-based authentication to be effective.
// Bearer token auth is immune to CSRF by design.

/**
 * Verifies the Clerk session JWT from the Authorization header and attaches
 * the user to the request context. Returns 401 when missing/invalid.
 *
 * Also upserts the user row in Neon on every request so the DB stays in sync
 * with Clerk automatically — no manual step needed when a new user signs up.
 * This is a safety net on top of the Clerk webhook at /webhooks/clerk.
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing bearer token" }, 401);
  }
  const token = header.slice("Bearer ".length);

  let clerkId: string;
  let email: string | undefined;

  try {
    const payload = await verifyToken(token, {
      secretKey: c.env.CLERK_SECRET_KEY,
    });
    clerkId = payload.sub;
    email = (payload as { email?: string }).email;
    c.set("user", { clerkId, email });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Lazily sync the user row — non-fatal if it fails (e.g. DB temporarily down).
  if (email) {
    try {
      const sql = getDb(c.env.DATABASE_URL);
      await upsertUser(sql, { clerkId, email });
    } catch {
      // Non-fatal: existing rows still work; next request will retry.
    }
  }

  await next();
});
