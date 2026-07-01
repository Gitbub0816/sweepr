import { createMiddleware } from "hono/factory";
import { getUserByClerkId } from "@sweepr/db";
import { getDb } from "../lib/db";
import { isOwnerClerkId } from "../lib/owner";
import type { AppBindings } from "../types";

export type AdminRole = "super_admin" | "admin" | "ops" | "finance" | "trainer" | "support" | "it";

/** Roles that map to "any admin" — the baseline gate used everywhere. */
export const ALL_ADMIN_ROLES: AdminRole[] = [
  "super_admin", "admin", "ops", "finance", "trainer", "support", "it",
];

/**
 * IT Portal access: any admin (including the dedicated "it" admin_role) can view
 * tickets, telemetry and errors.
 */
export const requireITAccess = requireAdminRole();

/**
 * Sensitive IT actions (password resets, user management): super_admin or the
 * dedicated "it" admin_role only (owner always passes).
 */
export const requireITAdmin = requireAdminRole("it");

/**
 * Require the user to be an admin AND have one of the listed admin_roles.
 * super_admin always passes regardless of the list.
 *
 * Usage:
 *   router.use("*", requireAuth, requireAdminRole("ops", "finance"))
 */
export function requireAdminRole(...allowed: AdminRole[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    // Founding owner(s) always pass, independent of any DB state.
    if (isOwnerClerkId(c.get("user").clerkId, c.env)) return next();

    const sql = getDb(c.env.DATABASE_URL);
    const user = await getUserByClerkId(sql, c.get("user").clerkId);

    if (!user) return c.json({ error: "Forbidden" }, 403);

    // Legacy: role='super_admin' in the role column always passes.
    if (user.role === "super_admin") return next();

    // Must be an admin at minimum.
    if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

    // If no specific roles are required, any admin passes.
    if (allowed.length === 0) return next();

    // super_admin in admin_role always passes.
    const adminRole = (user as unknown as Record<string, unknown>).admin_role as string | null;
    if (adminRole === "super_admin") return next();

    // Check if the user's admin_role is in the allowed list.
    if (!adminRole || !allowed.includes(adminRole as AdminRole)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }

    return next();
  });
}

/** Convenience: any admin (no specific role required). */
export const requireAnyAdmin = requireAdminRole(...ALL_ADMIN_ROLES);

/**
 * Require the user to be an admin or super_admin — no admin_role discrimination.
 * Drop-in replacement for the repeated local `requireAdmin` in route files.
 */
export const requireAdmin = requireAdminRole();
