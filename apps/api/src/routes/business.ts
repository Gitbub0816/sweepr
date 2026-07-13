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
 * Business app API surface (business.getsweepr.com) — workspace engine.
 *
 * Every route requires a token from the Business Clerk application
 * (requireApp("business")) — a valid Customer/Cleaner/Admin token is never
 * sufficient. Workspace-level authorization is permission-gated per rbac.ts
 * against the silo-pinned membership resolved by lib/identity.ts.
 *
 * Business workspaces are created only via completed cross-app transitions
 * (POST /business/transitions/complete) or accepted invitations — never by a
 * direct create endpoint.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb } from "../lib/db";
import { requireAuth, requireApp } from "../middleware/auth";
import { resolveIdentity, membershipFor, type ResolvedIdentity } from "../lib/identity";
import {
  assertPermission,
  hasAnyPermission,
  PermissionDeniedError,
  ROLE_PERMISSIONS,
} from "../lib/rbac";
import {
  getWorkspace,
  updateWorkspace,
  listMembers,
  changeMemberRole,
  suspendMember,
  removeMember,
  listResourceScopes,
  addResourceScope,
  removeResourceScope,
  WorkspaceRuleError,
} from "../lib/workspaces";
import { createInvitation, revokeInvitation, acceptInvitation, listInvitations } from "../lib/invitations";
import { completeTransition } from "../lib/transitions";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const businessRouter = new Hono<AppBindings>();
businessRouter.use("*", requireAuth, requireApp("business"));

/** Resolve the caller's identity chain; 403 if unresolvable/suspended. */
async function identityOr403(c: Context<AppBindings>): Promise<ResolvedIdentity | undefined> {
  const sql = getDb(c.env.DATABASE_URL);
  return resolveIdentity(sql, c.get("authApp"), c.get("providerUserId"), {
    email: c.get("user").email,
  });
}

/** Membership in :workspaceId or undefined (route returns 403/404). */
function requireMembership(resolved: ResolvedIdentity, workspaceId: string) {
  const m = membershipFor(resolved, workspaceId);
  return m && m.workspaceCategory === "business_customer" ? m : undefined;
}

function auditBase(c: Context<AppBindings>) {
  return {
    actorClerkId: c.get("user").clerkId,
    ipAddress: c.req.header("cf-connecting-ip"),
    userAgent: c.req.header("user-agent"),
    timestamp: new Date().toISOString(),
  };
}

function handleRuleError(c: Context<AppBindings>, err: unknown) {
  if (err instanceof PermissionDeniedError) return c.json({ error: "Forbidden" }, 403);
  if (err instanceof WorkspaceRuleError) return c.json({ error: err.message }, 409);
  throw err;
}

// ── Identity ─────────────────────────────────────────────────────────────────

businessRouter.get("/me", async (c) => {
  const resolved = await identityOr403(c);
  if (!resolved) return c.json({ error: "Identity not resolvable" }, 403);
  return c.json({
    person: resolved.person,
    identity: {
      id: resolved.identity.id,
      authApplication: resolved.identity.authApplication,
    },
    memberships: resolved.memberships,
  });
});

// ── Roles catalog ────────────────────────────────────────────────────────────

businessRouter.get("/roles", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const roles = (await sql`
    SELECT key, label, description, permissions
    FROM workspace_roles
    WHERE workspace_category = 'business_customer'
    ORDER BY key
  `) as Array<{ key: string; label: string; description: string | null; permissions: string[] }>;
  return c.json({ roles, catalog: ROLE_PERMISSIONS.business_customer });
});

// ── Workspaces ───────────────────────────────────────────────────────────────

businessRouter.get("/workspaces", async (c) => {
  const resolved = await identityOr403(c);
  if (!resolved) return c.json({ error: "Identity not resolvable" }, 403);
  return c.json({
    workspaces: resolved.memberships.filter(
      (m) => m.workspaceCategory === "business_customer",
    ),
  });
});

businessRouter.get(
  "/workspaces/:workspaceId",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const workspace = await getWorkspace(getDb(c.env.DATABASE_URL), workspaceId);
    if (!workspace) return c.json({ error: "Not found" }, 404);
    return c.json({ workspace, membership: membershipFor(resolved, workspaceId) });
  },
);

const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    businessType: z.string().trim().max(80).nullable().optional(),
    logoUrl: z.string().url().max(500).nullable().optional(),
    timezone: z.string().trim().max(64).nullable().optional(),
    locale: z.string().trim().max(16).nullable().optional(),
  })
  .strict();

businessRouter.patch(
  "/workspaces/:workspaceId",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  zValidator("json", updateWorkspaceSchema),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const patch = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      assertPermission(membershipFor(resolved, workspaceId), "workspace.manage");
    } catch (err) {
      return handleRuleError(c, err);
    }
    const sql = getDb(c.env.DATABASE_URL);
    const workspace = await updateWorkspace(sql, workspaceId, patch);
    if (!workspace) return c.json({ error: "Not found" }, 404);
    await audit(sql, {
      ...auditBase(c),
      action: "workspace.updated",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { fields: Object.keys(patch) },
    });
    return c.json({ workspace });
  },
);

// ── Members ──────────────────────────────────────────────────────────────────

businessRouter.get(
  "/workspaces/:workspaceId/members",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const members = await listMembers(getDb(c.env.DATABASE_URL), workspaceId);
    return c.json({ members });
  },
);

const memberActionSchema = z
  .object({
    action: z.enum(["change_role", "suspend", "remove"]),
    roleKey: z.string().trim().min(1).max(60).optional(),
  })
  .strict()
  .refine((b) => b.action !== "change_role" || Boolean(b.roleKey), {
    message: "roleKey is required for change_role",
    path: ["roleKey"],
  });

businessRouter.post(
  "/workspaces/:workspaceId/members/:membershipId",
  zValidator(
    "param",
    z.object({ workspaceId: z.string().uuid(), membershipId: z.string().uuid() }),
  ),
  zValidator("json", memberActionSchema),
  async (c) => {
    const { workspaceId, membershipId } = c.req.valid("param");
    const body = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const sql = getDb(c.env.DATABASE_URL);
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
      if (body.action === "change_role") {
        await changeMemberRole(sql, workspaceId, membershipId, body.roleKey as string);
      } else if (body.action === "suspend") {
        await suspendMember(sql, workspaceId, membershipId);
      } else {
        await removeMember(sql, workspaceId, membershipId);
      }
    } catch (err) {
      return handleRuleError(c, err);
    }
    const action =
      body.action === "change_role"
        ? "workspace.member_role_changed"
        : body.action === "suspend"
          ? "workspace.member_suspended"
          : "workspace.member_removed";
    await audit(sql, {
      ...auditBase(c),
      action,
      targetType: "workspace_membership",
      targetId: membershipId,
      metadata: { workspaceId, roleKey: body.roleKey },
    });
    return c.json({ ok: true });
  },
);

// ── Resource scopes ──────────────────────────────────────────────────────────

businessRouter.get(
  "/workspaces/:workspaceId/members/:membershipId/scopes",
  zValidator(
    "param",
    z.object({ workspaceId: z.string().uuid(), membershipId: z.string().uuid() }),
  ),
  async (c) => {
    const { workspaceId, membershipId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const scopes = await listResourceScopes(getDb(c.env.DATABASE_URL), membershipId);
    return c.json({ scopes });
  },
);

const scopeSchema = z
  .object({
    resourceType: z.enum(["property", "team", "region"]),
    resourceId: z.string().uuid(),
  })
  .strict();

businessRouter.post(
  "/workspaces/:workspaceId/members/:membershipId/scopes",
  zValidator(
    "param",
    z.object({ workspaceId: z.string().uuid(), membershipId: z.string().uuid() }),
  ),
  zValidator("json", scopeSchema),
  async (c) => {
    const { workspaceId, membershipId } = c.req.valid("param");
    const body = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
    } catch (err) {
      return handleRuleError(c, err);
    }
    const scope = await addResourceScope(
      getDb(c.env.DATABASE_URL),
      membershipId,
      body.resourceType,
      body.resourceId,
    );
    return c.json({ scope: scope ?? null });
  },
);

businessRouter.delete(
  "/workspaces/:workspaceId/members/:membershipId/scopes/:scopeId",
  zValidator(
    "param",
    z.object({
      workspaceId: z.string().uuid(),
      membershipId: z.string().uuid(),
      scopeId: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { workspaceId, membershipId, scopeId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
    } catch (err) {
      return handleRuleError(c, err);
    }
    await removeResourceScope(getDb(c.env.DATABASE_URL), membershipId, scopeId);
    return c.json({ ok: true });
  },
);

// ── Invitations ──────────────────────────────────────────────────────────────

businessRouter.get(
  "/workspaces/:workspaceId/invitations",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
    } catch (err) {
      return handleRuleError(c, err);
    }
    const invitations = await listInvitations(getDb(c.env.DATABASE_URL), workspaceId);
    return c.json({ invitations });
  },
);

const createInviteSchema = z
  .object({
    email: z.string().email().max(254),
    roleKey: z.string().trim().min(1).max(60),
  })
  .strict();

businessRouter.post(
  "/workspaces/:workspaceId/invitations",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  zValidator("json", createInviteSchema),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const body = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const sql = getDb(c.env.DATABASE_URL);
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
      if (body.roleKey === "owner") {
        // Ownership is granted by transfer, never by open invitation.
        return c.json({ error: "Owners cannot be invited directly" }, 400);
      }
    } catch (err) {
      return handleRuleError(c, err);
    }
    const created = await createInvitation(sql, {
      workspaceId,
      targetApplication: "business",
      invitedEmail: body.email,
      roleKey: body.roleKey,
      invitedByPersonId: resolved.person.id,
      invitedByAuthIdentityId: resolved.identity.id,
    });
    if (!created) return c.json({ error: "Unknown role" }, 400);
    await audit(sql, {
      ...auditBase(c),
      action: "workspace.invite_created",
      targetType: "workspace_invitation",
      targetId: created.invitationId,
      metadata: { workspaceId, roleKey: body.roleKey },
    });
    // Raw token returned once to the inviter's client (which delivers the
    // claim link to the invitee); never logged or stored.
    return c.json({
      invitationId: created.invitationId,
      token: created.rawToken,
      expiresAt: created.expiresAt.toISOString(),
    });
  },
);

businessRouter.post(
  "/workspaces/:workspaceId/invitations/:invitationId/revoke",
  zValidator(
    "param",
    z.object({ workspaceId: z.string().uuid(), invitationId: z.string().uuid() }),
  ),
  async (c) => {
    const { workspaceId, invitationId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    if (!resolved || !requireMembership(resolved, workspaceId)) {
      return c.json({ error: "Not found" }, 404);
    }
    const sql = getDb(c.env.DATABASE_URL);
    try {
      assertPermission(membershipFor(resolved, workspaceId), "members.manage");
    } catch (err) {
      return handleRuleError(c, err);
    }
    const revoked = await revokeInvitation(sql, workspaceId, invitationId);
    if (!revoked) return c.json({ error: "Invitation is not pending" }, 409);
    await audit(sql, {
      ...auditBase(c),
      action: "workspace.invite_revoked",
      targetType: "workspace_invitation",
      targetId: invitationId,
      metadata: { workspaceId },
    });
    return c.json({ ok: true });
  },
);

businessRouter.post(
  "/invitations/accept",
  zValidator("json", z.object({ token: z.string().min(32).max(200) }).strict()),
  async (c) => {
    const { token } = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved) return c.json({ error: "Identity not resolvable" }, 403);
    const sql = getDb(c.env.DATABASE_URL);
    const result = await acceptInvitation(sql, token, resolved.identity);
    if (!result.ok) return c.json({ error: "Invalid or expired invitation" }, 400);
    await audit(sql, {
      ...auditBase(c),
      action: "workspace.invite_accepted",
      targetType: "workspace_membership",
      targetId: result.membershipId,
      metadata: { workspaceId: result.workspaceId },
    });
    return c.json({ ok: true, workspaceId: result.workspaceId });
  },
);

// ── Properties ───────────────────────────────────────────────────────────────

businessRouter.get(
  "/workspaces/:workspaceId/properties",
  zValidator("param", z.object({ workspaceId: z.string().uuid() })),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const resolved = await identityOr403(c);
    const membership = resolved ? requireMembership(resolved, workspaceId) : undefined;
    if (!membership) return c.json({ error: "Not found" }, 404);
    if (
      !hasAnyPermission(membership, [
        "properties.manage",
        "properties.view",
        "properties.assigned",
        "bookings.manage",
      ])
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const sql = getDb(c.env.DATABASE_URL);
    const properties = await sql`
      SELECT id, label, street, unit, city, state, zip, created_at
      FROM addresses
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at
    `;
    return c.json({ properties });
  },
);

// ── Transitions ──────────────────────────────────────────────────────────────

businessRouter.post(
  "/transitions/complete",
  zValidator("json", z.object({ token: z.string().min(32).max(200) }).strict()),
  async (c) => {
    const { token } = c.req.valid("json");
    const resolved = await identityOr403(c);
    if (!resolved) return c.json({ error: "Identity not resolvable" }, 403);
    const sql = getDb(c.env.DATABASE_URL);
    const result = await completeTransition(sql, token, resolved.identity);
    if (!result.ok) {
      return c.json(
        { error: result.reason === "invalid_or_used" ? "Invalid or expired link" : "Transition failed" },
        400,
      );
    }
    await audit(sql, {
      ...auditBase(c),
      action: "workspace.transition_completed",
      targetType: "workspace",
      targetId: result.workspaceId,
      metadata: {
        transitionType: result.transitionType,
        movedAddressCount: result.movedAddressCount,
      },
    });
    return c.json({
      ok: true,
      workspaceId: result.workspaceId,
      transitionType: result.transitionType,
      movedAddressCount: result.movedAddressCount,
    });
  },
);
