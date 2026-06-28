import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import { upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { isOwnerEmail, isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

// CSRF note: this API uses Authorization: Bearer tokens, not cookies.
// CSRF attacks require cookie-based authentication to be effective.
// Bearer token auth is immune to CSRF by design.

/**
 * Fetch a user's primary email from the Clerk API. Used as a last resort when
 * the session JWT has no email claim and the DB row doesn't exist yet (e.g. the
 * Clerk webhook is failing). Best-effort: returns undefined on any failure.
 */
async function fetchClerkEmail(
  clerkId: string,
  secretKey: string,
): Promise<string | undefined> {
  if (!secretKey) return undefined;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return undefined;
    const u = (await res.json()) as {
      primary_email_address_id?: string;
      email_addresses?: Array<{ id: string; email_address: string }>;
    };
    const primary =
      u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
        ?.email_address ?? u.email_addresses?.[0]?.email_address;
    return primary ?? undefined;
  } catch {
    return undefined;
  }
}

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
  try {
    const sql = getDb(c.env.DATABASE_URL);

    // Resolve the user's email: JWT claim → existing DB row → Clerk API.
    // The Clerk fetch only happens for users with no email claim AND no row
    // yet (i.e. the webhook never synced them), so it's bounded to first-touch.
    let resolvedEmail = email;
    if (!resolvedEmail) {
      const rows = (await sql`
        SELECT email FROM users WHERE clerk_id = ${clerkId} LIMIT 1
      `) as Array<{ email: string | null }>;
      resolvedEmail = rows[0]?.email || undefined;
    }
    if (!resolvedEmail) {
      resolvedEmail = await fetchClerkEmail(clerkId, c.env.CLERK_SECRET_KEY);
    }

    // Self-heal owner access FIRST, before the email upsert — otherwise a
    // UNIQUE-violation on email (when a sibling row already owns it) would throw
    // and skip elevation entirely. role='super_admin' satisfies every guard.
    const isOwner =
      isOwnerClerkId(clerkId, c.env) ||
      (resolvedEmail ? isOwnerEmail(resolvedEmail, c.env) : false);
    if (isOwner) {
      // Elevate an existing row first (avoids the email UNIQUE landmine when a
      // sibling account already owns this email).
      const updated = (await sql`
        UPDATE users SET role = 'super_admin'
        WHERE clerk_id = ${clerkId}
        RETURNING id
      `) as Array<{ id: string }>;

      if (updated.length === 0) {
        // No row yet — insert one. Use the resolved email if it's free, else a
        // synthetic unique email so the NOT NULL/UNIQUE constraints can't block
        // the owner from being created.
        const synthetic = `${clerkId}@owner.sweepr.local`;
        try {
          await sql`
            INSERT INTO users (clerk_id, email, role)
            VALUES (${clerkId}, ${resolvedEmail ?? synthetic}, 'super_admin')
            ON CONFLICT (clerk_id) DO UPDATE SET role = 'super_admin'
          `;
        } catch {
          await sql`
            INSERT INTO users (clerk_id, email, role)
            VALUES (${clerkId}, ${synthetic}, 'super_admin')
            ON CONFLICT (clerk_id) DO UPDATE SET role = 'super_admin'
          `;
        }
      }
    }

    // Keep the DB email in sync (best-effort, isolated so a UNIQUE collision
    // can't affect anything above). Skips owners whose row email we keep as-is.
    if (resolvedEmail && !isOwner) {
      try {
        await upsertUser(sql, { clerkId, email: resolvedEmail });
      } catch {
        /* email already taken by another row — ignore */
      }
    }
  } catch {
    // Non-fatal: existing rows still work; next request will retry.
  }

  await next();
});
