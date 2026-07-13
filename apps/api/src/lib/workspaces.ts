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
 * Workspace engine — create/read/update workspaces, member management, and
 * per-membership resource scopes (migration 090).
 *
 * Invariants enforced here (not in routes):
 *  - business_customer workspaces are ONLY created through a completed
 *    cross-app transition (transitions.ts passes `viaTransition: true`);
 *    direct creation throws.
 *  - a workspace can never lose its last ACTIVE owner (remove/suspend/
 *    downgrade all guard it).
 *  - memberships pin the auth_identity_id of the app silo they were granted
 *    through (spec §12) — this module never re-points that pin.
 */

import type { Sql } from "./db";
import type { ResolvedIdentity, WorkspaceMembership } from "./identity";
import type { WorkspaceCategory } from "./rbac";

export class WorkspaceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceRuleError";
  }
}

export interface WorkspaceRow {
  id: string;
  workspace_category: WorkspaceCategory;
  name: string;
  legal_name: string | null;
  slug: string | null;
  logo_url: string | null;
  business_type: string | null;
  status: string;
  created_by_platform_person_id: string | null;
  timezone: string | null;
  locale: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  membership_id: string;
  platform_person_id: string;
  auth_identity_id: string | null;
  membership_status: string;
  role_id: string;
  role_key: string;
  role_label: string;
  first_name: string | null;
  last_name: string | null;
  canonical_email: string | null;
  accepted_at: string | null;
  created_at: string;
}

// ── Workspace CRUD ────────────────────────────────────────────────────────────

export interface CreateWorkspaceInput {
  category: WorkspaceCategory;
  name: string;
  legalName?: string;
  businessType?: string;
  timezone?: string;
  locale?: string;
  createdByPersonId: string;
  /** Owner membership is pinned to this identity's silo. */
  ownerAuthIdentityId: string | null;
  /** Set ONLY by transitions.ts — business_customer creation is transition-gated. */
  viaTransition?: boolean;
}

export async function createWorkspace(
  sql: Sql,
  input: CreateWorkspaceInput,
): Promise<WorkspaceRow> {
  if (input.category === "business_customer" && !input.viaTransition) {
    throw new WorkspaceRuleError(
      "Business workspaces are created only through a cross-app transition",
    );
  }
  const rows = (await sql`
    INSERT INTO workspaces (workspace_category, name, legal_name, business_type,
                            timezone, locale, status, created_by_platform_person_id)
    VALUES (${input.category}, ${input.name}, ${input.legalName ?? null},
            ${input.businessType ?? null}, ${input.timezone ?? null},
            ${input.locale ?? null}, 'active', ${input.createdByPersonId})
    RETURNING *
  `) as WorkspaceRow[];
  const workspace = rows[0];

  await sql`
    INSERT INTO workspace_memberships (workspace_id, platform_person_id, auth_identity_id,
                                       role_id, membership_status, accepted_at)
    SELECT ${workspace.id}, ${input.createdByPersonId}, ${input.ownerAuthIdentityId},
           r.id, 'active', NOW()
    FROM workspace_roles r
    WHERE r.workspace_category = ${input.category} AND r.key = 'owner'
    ON CONFLICT (workspace_id, platform_person_id) DO NOTHING
  `;
  return workspace;
}

export async function getWorkspace(
  sql: Sql,
  workspaceId: string,
): Promise<WorkspaceRow | undefined> {
  const rows = (await sql`
    SELECT * FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `) as WorkspaceRow[];
  return rows[0];
}

/**
 * Workspaces reachable through THIS session's identity. Delegates entirely to
 * the identity lib's silo-pinned membership resolution — no second query path.
 */
export function listWorkspacesForIdentity(
  resolved: ResolvedIdentity,
): WorkspaceMembership[] {
  return resolved.memberships;
}

export interface UpdateWorkspaceInput {
  name?: string;
  legalName?: string | null;
  businessType?: string | null;
  logoUrl?: string | null;
  timezone?: string | null;
  locale?: string | null;
}

export async function updateWorkspace(
  sql: Sql,
  workspaceId: string,
  patch: UpdateWorkspaceInput,
): Promise<WorkspaceRow | undefined> {
  const rows = (await sql`
    UPDATE workspaces SET
      name          = COALESCE(${patch.name ?? null}, name),
      legal_name    = CASE WHEN ${patch.legalName !== undefined} THEN ${patch.legalName ?? null} ELSE legal_name END,
      business_type = CASE WHEN ${patch.businessType !== undefined} THEN ${patch.businessType ?? null} ELSE business_type END,
      logo_url      = CASE WHEN ${patch.logoUrl !== undefined} THEN ${patch.logoUrl ?? null} ELSE logo_url END,
      timezone      = CASE WHEN ${patch.timezone !== undefined} THEN ${patch.timezone ?? null} ELSE timezone END,
      locale        = CASE WHEN ${patch.locale !== undefined} THEN ${patch.locale ?? null} ELSE locale END,
      updated_at    = NOW()
    WHERE id = ${workspaceId}
    RETURNING *
  `) as WorkspaceRow[];
  return rows[0];
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function listMembers(sql: Sql, workspaceId: string): Promise<MemberRow[]> {
  return (await sql`
    SELECT wm.id AS membership_id, wm.platform_person_id, wm.auth_identity_id,
           wm.membership_status, wm.role_id, wm.accepted_at, wm.created_at,
           wr.key AS role_key, wr.label AS role_label,
           pp.first_name, pp.last_name, pp.canonical_email
    FROM workspace_memberships wm
    JOIN workspace_roles wr ON wr.id = wm.role_id
    JOIN platform_people pp ON pp.id = wm.platform_person_id
    WHERE wm.workspace_id = ${workspaceId}
      AND wm.membership_status <> 'removed'
    ORDER BY wm.created_at
  `) as MemberRow[];
}

async function roleForWorkspace(
  sql: Sql,
  workspaceId: string,
  roleKey: string,
): Promise<{ id: string; key: string } | undefined> {
  const rows = (await sql`
    SELECT r.id, r.key
    FROM workspace_roles r
    JOIN workspaces w ON w.workspace_category = r.workspace_category
    WHERE w.id = ${workspaceId} AND r.key = ${roleKey}
    LIMIT 1
  `) as Array<{ id: string; key: string }>;
  return rows[0];
}

/** Count of ACTIVE owner memberships excluding one membership id. */
async function otherActiveOwners(
  sql: Sql,
  workspaceId: string,
  excludingMembershipId: string,
): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM workspace_memberships wm
    JOIN workspace_roles wr ON wr.id = wm.role_id
    WHERE wm.workspace_id = ${workspaceId}
      AND wm.membership_status = 'active'
      AND wr.key = 'owner'
      AND wm.id <> ${excludingMembershipId}
  `) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

async function getMembership(
  sql: Sql,
  workspaceId: string,
  membershipId: string,
): Promise<{ id: string; role_key: string; membership_status: string } | undefined> {
  const rows = (await sql`
    SELECT wm.id, wr.key AS role_key, wm.membership_status
    FROM workspace_memberships wm
    JOIN workspace_roles wr ON wr.id = wm.role_id
    WHERE wm.id = ${membershipId} AND wm.workspace_id = ${workspaceId}
    LIMIT 1
  `) as Array<{ id: string; role_key: string; membership_status: string }>;
  return rows[0];
}

export async function addMember(
  sql: Sql,
  input: {
    workspaceId: string;
    platformPersonId: string;
    authIdentityId: string | null;
    roleKey: string;
    invitedByPersonId?: string | null;
  },
): Promise<{ membershipId: string }> {
  const role = await roleForWorkspace(sql, input.workspaceId, input.roleKey);
  if (!role) throw new WorkspaceRuleError(`Unknown role for this workspace: ${input.roleKey}`);
  const rows = (await sql`
    INSERT INTO workspace_memberships (workspace_id, platform_person_id, auth_identity_id,
                                       role_id, membership_status, invited_by_platform_person_id,
                                       accepted_at)
    VALUES (${input.workspaceId}, ${input.platformPersonId}, ${input.authIdentityId},
            ${role.id}, 'active', ${input.invitedByPersonId ?? null}, NOW())
    ON CONFLICT (workspace_id, platform_person_id) DO UPDATE SET
      role_id = EXCLUDED.role_id,
      auth_identity_id = COALESCE(workspace_memberships.auth_identity_id, EXCLUDED.auth_identity_id),
      membership_status = 'active',
      suspended_at = NULL, removed_at = NULL,
      accepted_at = COALESCE(workspace_memberships.accepted_at, NOW()),
      updated_at = NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  return { membershipId: rows[0].id };
}

export async function changeMemberRole(
  sql: Sql,
  workspaceId: string,
  membershipId: string,
  newRoleKey: string,
): Promise<void> {
  const member = await getMembership(sql, workspaceId, membershipId);
  if (!member) throw new WorkspaceRuleError("Membership not found");
  const role = await roleForWorkspace(sql, workspaceId, newRoleKey);
  if (!role) throw new WorkspaceRuleError(`Unknown role for this workspace: ${newRoleKey}`);

  if (
    member.role_key === "owner" &&
    newRoleKey !== "owner" &&
    (await otherActiveOwners(sql, workspaceId, membershipId)) === 0
  ) {
    throw new WorkspaceRuleError("Cannot downgrade the last active owner");
  }

  await sql`
    UPDATE workspace_memberships
    SET role_id = ${role.id}, updated_at = NOW()
    WHERE id = ${membershipId} AND workspace_id = ${workspaceId}
  `;
}

export async function suspendMember(
  sql: Sql,
  workspaceId: string,
  membershipId: string,
): Promise<void> {
  const member = await getMembership(sql, workspaceId, membershipId);
  if (!member) throw new WorkspaceRuleError("Membership not found");
  if (
    member.role_key === "owner" &&
    (await otherActiveOwners(sql, workspaceId, membershipId)) === 0
  ) {
    throw new WorkspaceRuleError("Cannot suspend the last active owner");
  }
  await sql`
    UPDATE workspace_memberships
    SET membership_status = 'suspended', suspended_at = NOW(), updated_at = NOW()
    WHERE id = ${membershipId} AND workspace_id = ${workspaceId}
      AND membership_status = 'active'
  `;
}

export async function removeMember(
  sql: Sql,
  workspaceId: string,
  membershipId: string,
): Promise<void> {
  const member = await getMembership(sql, workspaceId, membershipId);
  if (!member) throw new WorkspaceRuleError("Membership not found");
  if (
    member.role_key === "owner" &&
    (await otherActiveOwners(sql, workspaceId, membershipId)) === 0
  ) {
    throw new WorkspaceRuleError("Cannot remove the last active owner");
  }
  await sql`
    UPDATE workspace_memberships
    SET membership_status = 'removed', removed_at = NOW(), updated_at = NOW()
    WHERE id = ${membershipId} AND workspace_id = ${workspaceId}
      AND membership_status <> 'removed'
  `;
}

// ── Resource scopes ──────────────────────────────────────────────────────────

export interface ResourceScope {
  id: string;
  membership_id: string;
  resource_type: string;
  resource_id: string;
}

export async function listResourceScopes(
  sql: Sql,
  membershipId: string,
): Promise<ResourceScope[]> {
  return (await sql`
    SELECT id, membership_id, resource_type, resource_id
    FROM membership_resource_scopes
    WHERE membership_id = ${membershipId}
    ORDER BY created_at
  `) as ResourceScope[];
}

export async function addResourceScope(
  sql: Sql,
  membershipId: string,
  resourceType: string,
  resourceId: string,
): Promise<ResourceScope | undefined> {
  const rows = (await sql`
    INSERT INTO membership_resource_scopes (membership_id, resource_type, resource_id)
    VALUES (${membershipId}, ${resourceType}, ${resourceId})
    ON CONFLICT (membership_id, resource_type, resource_id) DO NOTHING
    RETURNING id, membership_id, resource_type, resource_id
  `) as ResourceScope[];
  return rows[0];
}

export async function removeResourceScope(
  sql: Sql,
  membershipId: string,
  scopeId: string,
): Promise<void> {
  await sql`
    DELETE FROM membership_resource_scopes
    WHERE id = ${scopeId} AND membership_id = ${membershipId}
  `;
}
