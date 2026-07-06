/**
 * Admin permissions API. super_admin/owner can view every admin's effective
 * permissions and edit per-user overrides down to a single screen or content
 * key. Any admin can read their own effective set (the UI uses it to gate nav,
 * routes, and content).
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { getEffectivePermissions } from "../middleware/permissions";
import { isOwnerClerkId } from "../lib/owner";
import {
  PERMISSION_CATALOG,
  ALL_PERMISSION_KEYS,
  isValidPermissionKey,
  roleDefaultPermissions,
  effectivePermissions,
  type PermissionOverride,
} from "../lib/permissions";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const adminPermissionsRouter = new Hono<AppBindings>();
adminPermissionsRouter.use("*", requireAuth, requireAdmin);

/** The full permission catalog (groups → keys). */
adminPermissionsRouter.get("/catalog", (c) =>
  c.json({ catalog: PERMISSION_CATALOG, allKeys: ALL_PERMISSION_KEYS }),
);

/** The CURRENT admin's effective permissions (for UI gating). */
adminPermissionsRouter.get("/me", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const perms = await getEffectivePermissions(sql, c.get("user").clerkId, c.env);
  return c.json({ permissions: [...perms] });
});

/** Only super_admin/owner may inspect or edit other users' permissions. */
async function requireAccessControl(c: Context<AppBindings>): Promise<boolean> {
  const clerkId = c.get("user").clerkId;
  if (isOwnerClerkId(clerkId, c.env)) return true;
  const sql = getDb(c.env.DATABASE_URL);
  const perms = await getEffectivePermissions(sql, clerkId, c.env);
  return perms.has("content.access_control.edit");
}

/** A specific admin user's role defaults, overrides, and effective set. */
adminPermissionsRouter.get("/user/:id", async (c) => {
  if (!(await requireAccessControl(c))) return c.json({ error: "Insufficient permissions" }, 403);
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = (await sql`
    SELECT id, email, role, admin_role FROM users WHERE id = ${id} LIMIT 1
  `) as Array<{ id: string; email: string; role: string | null; admin_role: string | null }>;
  const u = rows[0];
  if (!u) return c.json({ error: "Not found" }, 404);

  const overrides = (await sql`
    SELECT permission_key, allow FROM admin_permission_overrides WHERE user_id = ${id}
  `) as PermissionOverride[];
  const isSuper = u.role === "super_admin" || u.admin_role === "super_admin";
  const effective = effectivePermissions({ isSuper, adminRole: u.admin_role, overrides });

  return c.json({
    user: { id: u.id, email: u.email, role: u.role, adminRole: u.admin_role, isSuper },
    roleDefaults: isSuper ? ALL_PERMISSION_KEYS : [...roleDefaultPermissions(u.admin_role)],
    overrides,
    effective: [...effective],
  });
});

const putSchema = z.object({
  overrides: z.array(
    z.object({ permission_key: z.string(), allow: z.boolean() }),
  ),
});

/** Replace a user's overrides. Keys not present fall back to the role default. */
adminPermissionsRouter.put("/user/:id", zValidator("json", putSchema), async (c) => {
  if (!(await requireAccessControl(c))) return c.json({ error: "Insufficient permissions" }, 403);
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const { overrides } = c.req.valid("json");

  const clean = overrides.filter((o) => isValidPermissionKey(o.permission_key));
  const actor = c.get("user").clerkId;

  await sql`DELETE FROM admin_permission_overrides WHERE user_id = ${id}`;
  for (const o of clean) {
    await sql`
      INSERT INTO admin_permission_overrides (user_id, permission_key, allow, updated_by, updated_at)
      VALUES (${id}, ${o.permission_key}, ${o.allow}, ${actor}, NOW())
    `;
  }

  await audit(sql, {
    action: "admin.permissions.updated",
    actorClerkId: actor,
    targetType: "user",
    targetId: id,
    metadata: { overrideCount: clean.length },
    timestamp: new Date().toISOString(),
  });

  return c.json({ ok: true, overrides: clean });
});
