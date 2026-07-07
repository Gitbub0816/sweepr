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
import { getDb } from "../lib/db";
import { isOwnerClerkId } from "../lib/owner";
import {
  effectivePermissions,
  type PermissionOverride,
} from "../lib/permissions";
import type { AppBindings } from "../types";

/**
 * Resolve a user's effective permission set from clerkId. Owner and
 * super_admin (role or admin_role) get everything.
 */
export async function getEffectivePermissions(
  sql: ReturnType<typeof getDb>,
  clerkId: string,
  env: AppBindings["Bindings"],
): Promise<Set<string>> {
  if (isOwnerClerkId(clerkId, env)) {
    return effectivePermissions({ isSuper: true, adminRole: null, overrides: [] });
  }
  const rows = (await sql`
    SELECT id, role, admin_role FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string; role: string | null; admin_role: string | null }>;
  const u = rows[0];
  if (!u) return new Set();
  const isSuper = u.role === "super_admin" || u.admin_role === "super_admin";
  if (isSuper) return effectivePermissions({ isSuper: true, adminRole: null, overrides: [] });
  if (u.role !== "admin") return new Set();

  const overrides = (await sql`
    SELECT permission_key, allow FROM admin_permission_overrides WHERE user_id = ${u.id}
  `) as PermissionOverride[];
  return effectivePermissions({ isSuper: false, adminRole: u.admin_role, overrides });
}

/**
 * Gate a route on a specific fine-grained permission key. Complements
 * requireAdminRole (which gates on department role) — apply this where access
 * needs to honor per-user overrides.
 */
export function requirePermission(key: string) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const clerkId = c.get("user").clerkId;
    if (isOwnerClerkId(clerkId, c.env)) return next();
    const sql = getDb(c.env.DATABASE_URL);
    const perms = await getEffectivePermissions(sql, clerkId, c.env);
    if (!perms.has(key)) return c.json({ error: "Insufficient permissions" }, 403);
    return next();
  });
}
