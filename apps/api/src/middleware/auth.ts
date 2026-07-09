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
import { verifyToken } from "@clerk/backend";
import { upsertUser } from "@sweepr/db";
import { getDb } from "../lib/db";
import { isOwnerEmail, isOwnerClerkId } from "../lib/owner";
import { captureFromContext } from "../lib/securityEvents";
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
 * Read the unverified `iss` claim from a JWT so we can pick which Clerk
 * instance's secret to verify against. This is ONLY used for routing — the
 * token is still cryptographically verified with the chosen secret, so a
 * forged issuer just selects a key it can never validate against.
 */
function unsafeIssuer(token: string): string {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { iss?: string }).iss ?? "";
  } catch {
    return "";
  }
}

/**
 * Verifies the Clerk session JWT from the Authorization header and attaches
 * the user to the request context. Returns 401 when missing/invalid.
 *
 * Two Clerk applications are in play: the primary Sweepr instance
 * (clerk.getsweepr.com — customers + cleaners) and a separate admin instance
 * (clerk.admin.getsweepr.com — staff). Tokens are verified against the secret
 * of whichever instance issued them. Admin-instance identities are then mapped
 * onto the canonical users row by their Clerk-verified email, so roles, audit
 * logs, and owner elevation keep working against one user record.
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

  const adminKey = c.env.CLERK_ADMIN_SECRET_KEY;
  const iss = unsafeIssuer(token);
  const isAdminIssuer = Boolean(adminKey) && iss.includes("admin.getsweepr.com");

  try {
    const payload = await verifyToken(token, {
      secretKey: isAdminIssuer ? (adminKey as string) : c.env.CLERK_SECRET_KEY,
    });
    clerkId = payload.sub;
    email = (payload as { email?: string }).email;
  } catch {
    // Malformed/invalid/expired Bearer token — a real signal (unlike a
    // merely-missing token, which is just an unauthenticated probe). Record
    // it so repeated failures against this endpoint show up in the security
    // console and can trip the brute-force escalation.
    captureFromContext(c, "auth_failure", "low", { reason: "invalid_or_expired_token" });
    return c.json({ error: "Invalid token" }, 401);
  }

  // Admin-instance identity → canonical users row. The admin Clerk app has its
  // own user pool with different user ids, so map by the Clerk-verified email:
  // if a row already owns that email (the same human's primary-instance
  // account), act as that row's clerk_id — do NOT relink or duplicate it.
  if (isAdminIssuer) {
    try {
      const sql = getDb(c.env.DATABASE_URL);
      const resolvedEmail =
        email ?? (await fetchClerkEmail(clerkId, adminKey as string));
      if (resolvedEmail) {
        email = resolvedEmail;
        const rows = (await sql`
          SELECT clerk_id FROM users WHERE LOWER(email) = LOWER(${resolvedEmail}) LIMIT 1
        `) as Array<{ clerk_id: string }>;
        if (rows[0]?.clerk_id) {
          clerkId = rows[0].clerk_id;
        }
        // No row: fall through with the admin-instance clerk_id — the sync
        // block below (and owner self-heal) will create the row.
      }
    } catch {
      /* mapping is best-effort; downstream role checks still gate access */
    }
  }

  c.set("user", { clerkId, email });

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
    //
    // The strong path is clerk_id match (isOwnerClerkId) — always trusted. The
    // email path is defense-gated: `resolvedEmail` can originate from an
    // unverified JWT `email` claim (or a DB row synced from one), so we do NOT
    // elevate to super_admin on an email match alone. Instead we re-confirm the
    // account's primary email straight from the Clerk API (authoritative) and
    // only elevate if THAT is an owner email. This closes an
    // elevation-by-spoofed-email-claim vector without breaking real owner login
    // (a genuine owner's Clerk primary email is the owner email).
    let isOwner = isOwnerClerkId(clerkId, c.env);
    if (!isOwner && resolvedEmail && isOwnerEmail(resolvedEmail, c.env)) {
      const confirmedEmail = await fetchClerkEmail(
        clerkId,
        isAdminIssuer ? (adminKey as string) : c.env.CLERK_SECRET_KEY,
      );
      isOwner = Boolean(confirmedEmail && isOwnerEmail(confirmedEmail, c.env));
    }
    if (isOwner) {
      // Elevate an existing row first (avoids the email UNIQUE landmine when a
      // sibling account already owns this email).
      const updated = (await sql`
        UPDATE users SET role = 'super_admin'
        WHERE clerk_id = ${clerkId}
        RETURNING id
      `) as Array<{ id: string }>;

      if (updated.length === 0) {
        // No row for this clerk_id. If a stale row owns the email (Clerk
        // account recreated → new clerk_id, same person), relink it so the
        // existing account is preserved instead of forking a synthetic one.
        const relinked = resolvedEmail
          ? ((await sql`
              UPDATE users
              SET clerk_id = ${clerkId}, role = 'super_admin', updated_at = NOW()
              WHERE LOWER(email) = LOWER(${resolvedEmail})
              RETURNING id
            `) as Array<{ id: string }>)
          : [];

        if (relinked.length === 0) {
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
