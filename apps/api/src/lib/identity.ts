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
 * Platform identity resolution (multi-app auth architecture).
 *
 * Turns a verified Clerk token (app + provider_user_id) into the Sweepr-owned
 * identity chain:
 *
 *   auth_identity (per-app Clerk user)
 *     → platform_person (canonical human)
 *       → workspace_memberships (what they can do, pinned to this app's silo)
 *
 * Linking rules (spec §3):
 *  - customer/cleaner identities may be lazily created and bridged to the
 *    legacy users row (which requireAuth already syncs by clerk_id).
 *  - business identities are lazily created but are NEVER auto-linked to an
 *    existing person by email — a fresh business signup gets a fresh person
 *    unless a transition/invitation token explicitly bound them beforehand.
 *  - admin identities are NEVER auto-created here. Staff must be explicitly
 *    provisioned (an existing users row mapped by requireAuth's admin flow, or
 *    an accepted admin invitation). Resolution returns undefined otherwise.
 *
 * Memberships returned are only those exercisable through the CURRENT app's
 * identity: rows whose auth_identity_id is this identity, plus (transitional)
 * rows with NULL auth_identity_id for personal workspaces when authenticating
 * through the customer app — the backfill-era default.
 */

import type { Sql } from "@sweepr/db";
import type { AuthApplication } from "./authApps";

export interface AuthIdentity {
  id: string;
  platformPersonId: string;
  authApplication: AuthApplication;
  providerUserId: string;
  status: string;
}

export interface PlatformPerson {
  id: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  canonicalEmail: string | null;
  status: string;
}

export interface WorkspaceMembership {
  membershipId: string;
  workspaceId: string;
  workspaceCategory: "personal_customer" | "business_customer" | "cleaner_business";
  workspaceName: string;
  workspaceStatus: string;
  roleKey: string;
  permissions: string[];
  membershipStatus: string;
}

export interface ResolvedIdentity {
  identity: AuthIdentity;
  person: PlatformPerson;
  memberships: WorkspaceMembership[];
}

interface IdentityRow {
  id: string;
  platform_person_id: string;
  auth_application: AuthApplication;
  provider_user_id: string;
  status: string;
  person_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  canonical_email: string | null;
  person_status: string;
}

function toResolved(row: IdentityRow): Omit<ResolvedIdentity, "memberships"> {
  return {
    identity: {
      id: row.id,
      platformPersonId: row.platform_person_id,
      authApplication: row.auth_application,
      providerUserId: row.provider_user_id,
      status: row.status,
    },
    person: {
      id: row.platform_person_id,
      userId: row.person_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      canonicalEmail: row.canonical_email,
      status: row.person_status,
    },
  };
}

async function fetchIdentity(
  sql: Sql,
  app: AuthApplication,
  providerUserId: string,
): Promise<IdentityRow | undefined> {
  const rows = (await sql`
    SELECT ai.id, ai.platform_person_id, ai.auth_application, ai.provider_user_id, ai.status,
           pp.user_id AS person_user_id, pp.first_name, pp.last_name,
           pp.canonical_email, pp.status AS person_status
    FROM auth_identities ai
    JOIN platform_people pp ON pp.id = ai.platform_person_id
    WHERE ai.auth_application = ${app} AND ai.provider_user_id = ${providerUserId}
    LIMIT 1
  `) as IdentityRow[];
  return rows[0];
}

async function fetchMemberships(
  sql: Sql,
  identity: AuthIdentity,
): Promise<WorkspaceMembership[]> {
  // Silo pinning: a membership is exercisable through this session only when
  // its auth_identity_id is THIS identity. Backfilled personal-workspace
  // memberships (auth_identity_id NULL) remain reachable from the customer
  // app for the same person — they predate identity pinning.
  const rows = (await sql`
    SELECT wm.id AS membership_id, wm.membership_status,
           w.id AS workspace_id, w.workspace_category, w.name AS workspace_name,
           w.status AS workspace_status,
           wr.key AS role_key, wr.permissions
    FROM workspace_memberships wm
    JOIN workspaces w ON w.id = wm.workspace_id
    JOIN workspace_roles wr ON wr.id = wm.role_id
    WHERE wm.platform_person_id = ${identity.platformPersonId}
      AND wm.membership_status = 'active'
      AND w.status IN ('active','pending_identity_claim')
      AND (
        wm.auth_identity_id = ${identity.id}
        OR (wm.auth_identity_id IS NULL
            AND ${identity.authApplication} IN ('customer','cleaner')
            AND w.workspace_category = 'personal_customer')
      )
    ORDER BY w.created_at
  `) as Array<{
    membership_id: string;
    membership_status: string;
    workspace_id: string;
    workspace_category: WorkspaceMembership["workspaceCategory"];
    workspace_name: string;
    workspace_status: string;
    role_key: string;
    permissions: string[];
  }>;
  return rows.map((r) => ({
    membershipId: r.membership_id,
    workspaceId: r.workspace_id,
    workspaceCategory: r.workspace_category,
    workspaceName: r.workspace_name,
    workspaceStatus: r.workspace_status,
    roleKey: r.role_key,
    permissions: r.permissions ?? [],
    membershipStatus: r.membership_status,
  }));
}

/**
 * Resolve (and for non-admin apps, lazily create) the identity chain for a
 * verified Clerk user. Returns undefined when the identity cannot be resolved
 * under the linking rules (admin without provisioning, suspended person, …).
 *
 * `legacyClerkId` is the clerk_id requireAuth resolved onto the canonical
 * users row (for admin sessions this is the PRIMARY-instance clerk_id after
 * email mapping) — used only to bridge lazily-created identities to the
 * legacy record, never to authorize by email.
 */
export async function resolveIdentity(
  sql: Sql,
  app: AuthApplication,
  providerUserId: string,
  opts: { email?: string; legacyClerkId?: string } = {},
): Promise<ResolvedIdentity | undefined> {
  let row = await fetchIdentity(sql, app, providerUserId);

  if (!row) {
    if (app === "admin") {
      // Explicit provisioning only: create the admin identity iff requireAuth
      // already mapped this staff session onto an existing canonical users row
      // (its own strict verified-email flow) that has a platform person.
      if (!opts.legacyClerkId || opts.legacyClerkId === providerUserId) return undefined;
      row = await createIdentityForLegacyUser(sql, app, providerUserId, opts);
    } else if (app === "business") {
      // Fresh silo: never auto-link by email. New person unless a transition
      // flow already created the identity (in which case fetch found it).
      row = await createIdentityWithNewPerson(sql, app, providerUserId, opts);
    } else {
      // customer / cleaner: bridge onto the legacy users row when present
      // (requireAuth upserts it by clerk_id), else create a fresh person.
      row =
        (await createIdentityForLegacyUser(sql, app, providerUserId, {
          ...opts,
          legacyClerkId: opts.legacyClerkId ?? providerUserId,
        })) ?? (await createIdentityWithNewPerson(sql, app, providerUserId, opts));
    }
    if (!row) return undefined;
  }

  if (row.status !== "active" || row.person_status !== "active") return undefined;

  await sql`
    UPDATE auth_identities SET last_authenticated_at = NOW(), updated_at = NOW()
    WHERE id = ${row.id}
  `;

  const base = toResolved(row);
  const memberships = await fetchMemberships(sql, base.identity);
  return { ...base, memberships };
}

/** Create an identity attached to the platform person bridged to the legacy
 * users row identified by clerk_id. Returns undefined when no such person. */
async function createIdentityForLegacyUser(
  sql: Sql,
  app: AuthApplication,
  providerUserId: string,
  opts: { email?: string; legacyClerkId?: string },
): Promise<IdentityRow | undefined> {
  const people = (await sql`
    SELECT pp.id
    FROM platform_people pp
    JOIN users u ON u.id = pp.user_id
    WHERE u.clerk_id = ${opts.legacyClerkId ?? providerUserId}
    LIMIT 1
  `) as Array<{ id: string }>;
  const personId = people[0]?.id;
  if (!personId) return undefined;

  await sql`
    INSERT INTO auth_identities (platform_person_id, auth_application, provider_user_id, primary_email, email_verified)
    VALUES (${personId}, ${app}, ${providerUserId}, ${opts.email ?? null}, ${Boolean(opts.email)})
    ON CONFLICT (auth_application, provider_user_id) DO NOTHING
  `;
  return fetchIdentity(sql, app, providerUserId);
}

/** Create a brand-new platform person + identity (fresh business/customer signup). */
async function createIdentityWithNewPerson(
  sql: Sql,
  app: AuthApplication,
  providerUserId: string,
  opts: { email?: string },
): Promise<IdentityRow | undefined> {
  const people = (await sql`
    INSERT INTO platform_people (canonical_email) VALUES (${opts.email ?? null})
    RETURNING id
  `) as Array<{ id: string }>;
  const personId = people[0]?.id;
  if (!personId) return undefined;

  await sql`
    INSERT INTO auth_identities (platform_person_id, auth_application, provider_user_id, primary_email, email_verified)
    VALUES (${personId}, ${app}, ${providerUserId}, ${opts.email ?? null}, ${Boolean(opts.email)})
    ON CONFLICT (auth_application, provider_user_id) DO NOTHING
  `;
  const row = await fetchIdentity(sql, app, providerUserId);
  // Concurrent-create race: if the conflict fired, delete the orphan person.
  if (row && row.platform_person_id !== personId) {
    await sql`DELETE FROM platform_people WHERE id = ${personId} AND user_id IS NULL`;
  }
  return row;
}

/** Membership lookup for one workspace through the resolved identity. */
export function membershipFor(
  resolved: ResolvedIdentity,
  workspaceId: string,
): WorkspaceMembership | undefined {
  return resolved.memberships.find((m) => m.workspaceId === workspaceId);
}

/** Permission check against a specific workspace membership. */
export function hasPermission(
  membership: WorkspaceMembership | undefined,
  permission: string,
): boolean {
  if (!membership) return false;
  return membership.permissions.includes(permission) || membership.permissions.includes("*");
}
