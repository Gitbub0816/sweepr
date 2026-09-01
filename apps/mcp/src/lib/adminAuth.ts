/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Admin identity for the MCP OAuth flow — a deliberately MINIMAL mirror of
 * apps/api/src/middleware/auth.ts's admin path (kept local: apps must not
 * import from each other).
 *
 * Flow: the /oauth/authorize page has the human sign in against the SEPARATE
 * admin Clerk application (clerk.admin.getsweepr.com); the resulting session
 * token is verified here cryptographically with CLERK_ADMIN_SECRET_KEY (only
 * tokens issued by the admin instance can validate — no issuer routing is
 * needed because this worker accepts exactly one instance). The verified
 * email then maps onto the canonical users row (never relinked/duplicated)
 * and the pricing role gate is applied.
 */

import { verifyToken } from "@clerk/backend";
import type { Sql } from "./db";
import type { Env } from "../types";

// Owner bootstrap — mirrors apps/api/src/lib/owner.ts. Owners must always
// pass, independent of DB state, to avoid lockouts.
const FALLBACK_OWNER_EMAILS = [
  "1morecruise@gmail.com",
  "caleb.owen2019@outlook.com",
];

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined, env: Env): boolean {
  if (!email) return false;
  const all = [...FALLBACK_OWNER_EMAILS, ...list(env.SUPER_ADMIN_EMAILS)].map((e) =>
    e.toLowerCase(),
  );
  return all.includes(email.toLowerCase());
}

/**
 * Fetch the user's primary email from the admin Clerk API — used when the
 * session JWT carries no email claim. Best-effort: undefined on any failure.
 */
async function fetchClerkEmail(clerkId: string, secretKey: string): Promise<string | undefined> {
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
      u.email_addresses?.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses?.[0]?.email_address;
    return primary ?? undefined;
  } catch {
    return undefined;
  }
}

export interface VerifiedAdmin {
  email: string;
  role: string;
  /** users.clerk_id, when a row exists — used to attribute the admin_audit_log
   *  entry the deliberate promotions-publish exception writes (see
   *  promotionTools.ts). Falls back to the owner-bootstrap case (no row yet). */
  clerkId?: string;
}

/**
 * Pricing-sandbox role gate: owner email, super_admin, or an admin holding
 * the finance credential (finance / finance_senior — a senior credential
 * passes wherever its base role does; admin_role='super_admin' also passes).
 */
export function passesPricingGate(
  env: Env,
  email: string,
  role: string | null,
  adminRole: string | null,
): boolean {
  if (isOwnerEmail(email, env)) return true;
  if (role === "super_admin") return true;
  if (role !== "admin") return false;
  return adminRole === "super_admin" || adminRole === "finance" || adminRole === "finance_senior";
}

/**
 * Verify an admin-instance Clerk session token and gate on the pricing role.
 * Returns the verified admin (email lowercased) or a failure reason string.
 */
export async function verifyAdminForPricing(
  env: Env,
  sql: Sql,
  clerkToken: string,
): Promise<{ ok: true; admin: VerifiedAdmin } | { ok: false; reason: string }> {
  let clerkId: string;
  let email: string | undefined;
  try {
    const payload = await verifyToken(clerkToken, { secretKey: env.CLERK_ADMIN_SECRET_KEY });
    clerkId = payload.sub;
    email = (payload as { email?: string }).email;
  } catch {
    return { ok: false, reason: "invalid_clerk_token" };
  }

  // Resolve the verified email — JWT claim first, Clerk API as fallback.
  // The admin instance is email+code sign-in only, so the primary email is
  // always a verified one.
  if (!email) {
    email = await fetchClerkEmail(clerkId, env.CLERK_ADMIN_SECRET_KEY);
  }
  if (!email) return { ok: false, reason: "no_verified_email" };
  const normalized = email.toLowerCase();

  // Owners always pass — even before the users row exists.
  if (isOwnerEmail(normalized, env)) {
    return { ok: true, admin: { email: normalized, role: "super_admin" } };
  }

  // Map onto the canonical users row BY VERIFIED EMAIL (never relink or
  // duplicate — read-only here) and apply the role gate.
  const rows = (await sql`
    SELECT role, admin_role FROM users WHERE LOWER(email) = ${normalized} LIMIT 1
  `) as Array<{ role: string | null; admin_role: string | null }>;
  const row = rows[0];
  if (!row) return { ok: false, reason: "no_user_row" };
  if (!passesPricingGate(env, normalized, row.role, row.admin_role)) {
    return { ok: false, reason: "insufficient_role" };
  }
  return { ok: true, admin: { email: normalized, role: row.role ?? "admin" } };
}

/**
 * Promotions role gate — deliberately BROADER than the pricing gate: owner,
 * super_admin, or ANY admin_role at all (mirrors apps/api's `requireAnyAdmin`
 * / `ALL_ADMIN_ROLES`, the gate the admin console's promotions API already
 * uses). Promotions are marketing content, not money movement — there's no
 * finance-credential reason to narrow who can draft or publish one.
 *
 * Note this only governs the promotions TOOLS' write path (re-checked below,
 * per call, for the one tool that publishes). Whether an admin can sign in
 * to this MCP worker AT ALL is still gated by `verifyAdminForPricing` at
 * OAuth-authorize time — unchanged by this file, so today only an owner,
 * super_admin, or finance-tier admin can reach ANY tool, promotions
 * included. Owners and super_admins (who can always sign in) can use the
 * promotions tools freely; broadening MCP sign-in itself to every admin
 * role is a separate decision this task deliberately did not make — see the
 * rollout note in promotionTools.ts.
 */
export function passesPromotionsGate(
  env: Env,
  email: string,
  role: string | null,
  adminRole: string | null,
): boolean {
  if (isOwnerEmail(email, env)) return true;
  if (role === "super_admin") return true;
  if (role !== "admin") return false;
  return adminRole != null;
}

/**
 * Re-verify the CURRENT admin role from the database for the promotions
 * write path, independent of whatever the bearer token's role claim was at
 * OAuth-authorize time (the token carries only an email — see mintAccessToken
 * in oauth.ts). This is defense-in-depth specific to the ONE surface in this
 * whole worker that writes live, customer-facing data
 * (`publish_promotion` — see promotionTools.ts): an admin demoted or
 * deactivated since their MCP session began must lose write access on their
 * very next call, not merely at their next sign-in.
 */
export async function verifyAdminForPromotions(
  env: Env,
  sql: Sql,
  adminEmail: string,
): Promise<{ ok: true; admin: VerifiedAdmin } | { ok: false; reason: string }> {
  const normalized = adminEmail.toLowerCase();
  if (isOwnerEmail(normalized, env)) {
    return { ok: true, admin: { email: normalized, role: "super_admin" } };
  }
  const rows = (await sql`
    SELECT role, admin_role, clerk_id FROM users WHERE LOWER(email) = ${normalized} LIMIT 1
  `) as Array<{ role: string | null; admin_role: string | null; clerk_id: string | null }>;
  const row = rows[0];
  if (!row) return { ok: false, reason: "no_user_row" };
  if (!passesPromotionsGate(env, normalized, row.role, row.admin_role)) {
    return { ok: false, reason: "insufficient_role" };
  }
  return {
    ok: true,
    admin: { email: normalized, role: row.role ?? "admin", clerkId: row.clerk_id ?? undefined },
  };
}

/**
 * Course-builder role gate — same shape and same reasoning as
 * passesPromotionsGate: owner, super_admin, or ANY admin_role at all
 * (mirrors apps/api's admin/courses.ts, which gates on plain
 * admin/super_admin with no finance-credential narrowing). Training content
 * isn't money movement either.
 */
export function passesCoursesGate(
  env: Env,
  email: string,
  role: string | null,
  adminRole: string | null,
): boolean {
  if (isOwnerEmail(email, env)) return true;
  if (role === "super_admin") return true;
  if (role !== "admin") return false;
  return adminRole != null;
}

/**
 * Re-verify the CURRENT admin role from the database for the course-builder
 * write path — same defense-in-depth as verifyAdminForPromotions, for the
 * one course tool that changes what a cleaner is actually required to
 * complete (`publish_course` — see courseTools.ts).
 */
export async function verifyAdminForCourses(
  env: Env,
  sql: Sql,
  adminEmail: string,
): Promise<{ ok: true; admin: VerifiedAdmin } | { ok: false; reason: string }> {
  const normalized = adminEmail.toLowerCase();
  if (isOwnerEmail(normalized, env)) {
    return { ok: true, admin: { email: normalized, role: "super_admin" } };
  }
  const rows = (await sql`
    SELECT role, admin_role, clerk_id FROM users WHERE LOWER(email) = ${normalized} LIMIT 1
  `) as Array<{ role: string | null; admin_role: string | null; clerk_id: string | null }>;
  const row = rows[0];
  if (!row) return { ok: false, reason: "no_user_row" };
  if (!passesCoursesGate(env, normalized, row.role, row.admin_role)) {
    return { ok: false, reason: "insufficient_role" };
  }
  return {
    ok: true,
    admin: { email: normalized, role: row.role ?? "admin", clerkId: row.clerk_id ?? undefined },
  };
}
