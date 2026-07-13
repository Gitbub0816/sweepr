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
 * Workspace invitations (spec §11) — signed single-use link pattern.
 *
 *  - raw token = 32 random bytes, hex; returned ONCE, never stored or logged
 *  - DB keeps only the sha256 hex token_hash + expires_at (7 days)
 *  - bound to target_application: an invite into the Business silo can only
 *    be accepted by a Business-app identity
 *  - single-use enforced with claim-then-act: a conditional
 *    UPDATE … WHERE status='pending' … RETURNING claims the row atomically
 *    before any membership is created.
 */

import type { Sql } from "./db";
import type { AuthIdentity } from "./identity";
import { addMember } from "./workspaces";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationTargetApplication = "business" | "cleaner" | "admin";

// ── Pure token helpers ────────────────────────────────────────────────────────

/** 32 random bytes as 64 hex chars. Never persist or log the return value. */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pure acceptance-eligibility check, mirrored by the SQL claim predicate.
 * Kept side-effect free so single-use semantics are unit-testable without a DB.
 */
export function invitationAcceptEligibility(
  invitation: {
    status: string;
    expiresAt: Date;
    targetApplication: string;
  },
  acceptingApplication: string,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: "not_pending" | "expired" | "wrong_application" } {
  if (invitation.status !== "pending") return { ok: false, reason: "not_pending" };
  if (invitation.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (invitation.targetApplication !== acceptingApplication) {
    return { ok: false, reason: "wrong_application" };
  }
  return { ok: true };
}

// ── DB operations ─────────────────────────────────────────────────────────────

export interface InvitationRow {
  id: string;
  workspace_id: string;
  target_application: InvitationTargetApplication;
  invited_email: string;
  invited_role_id: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export async function listInvitations(sql: Sql, workspaceId: string): Promise<
  Array<InvitationRow & { role_key: string }>
> {
  return (await sql`
    SELECT wi.id, wi.workspace_id, wi.target_application, wi.invited_email,
           wi.invited_role_id, wi.status, wi.expires_at, wi.created_at,
           wr.key AS role_key
    FROM workspace_invitations wi
    JOIN workspace_roles wr ON wr.id = wi.invited_role_id
    WHERE wi.workspace_id = ${workspaceId}
    ORDER BY wi.created_at DESC
  `) as Array<InvitationRow & { role_key: string }>;
}

/**
 * Create an invitation. Returns the RAW token exactly once — callers hand it
 * to the invitee (email link) and must never log or persist it.
 */
export async function createInvitation(
  sql: Sql,
  input: {
    workspaceId: string;
    targetApplication: InvitationTargetApplication;
    invitedEmail: string;
    roleKey: string;
    invitedByPersonId: string;
    invitedByAuthIdentityId: string | null;
  },
): Promise<{ invitationId: string; rawToken: string; expiresAt: Date } | undefined> {
  const rawToken = generateInvitationToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const rows = (await sql`
    INSERT INTO workspace_invitations (workspace_id, target_application, invited_email,
                                       invited_role_id, invited_by_platform_person_id,
                                       invited_by_auth_identity_id, token_hash, expires_at)
    SELECT ${input.workspaceId}, ${input.targetApplication}, ${input.invitedEmail},
           r.id, ${input.invitedByPersonId}, ${input.invitedByAuthIdentityId},
           ${tokenHash}, ${expiresAt.toISOString()}
    FROM workspace_roles r
    JOIN workspaces w ON w.workspace_category = r.workspace_category
    WHERE w.id = ${input.workspaceId} AND r.key = ${input.roleKey}
    RETURNING id
  `) as Array<{ id: string }>;
  if (!rows[0]) return undefined; // unknown role for this workspace's category
  return { invitationId: rows[0].id, rawToken, expiresAt };
}

/** Revoke — claim-then-act; only a pending invitation can be revoked. */
export async function revokeInvitation(
  sql: Sql,
  workspaceId: string,
  invitationId: string,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE workspace_invitations
    SET status = 'revoked', revoked_at = NOW()
    WHERE id = ${invitationId} AND workspace_id = ${workspaceId} AND status = 'pending'
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

export type AcceptInvitationResult =
  | { ok: true; workspaceId: string; membershipId: string }
  | { ok: false; reason: "invalid_or_used" };

/**
 * Accept an invitation. The conditional UPDATE is the single-use claim:
 * hash match + pending + unexpired + application binding are all in the WHERE,
 * so a second acceptance (or a wrong-silo identity) matches zero rows and the
 * membership is never created twice. The membership is pinned to the
 * ACCEPTING auth identity (spec §12).
 */
export async function acceptInvitation(
  sql: Sql,
  rawToken: string,
  acceptingIdentity: AuthIdentity,
): Promise<AcceptInvitationResult> {
  const tokenHash = await sha256Hex(rawToken);
  const claimed = (await sql`
    UPDATE workspace_invitations
    SET status = 'accepted',
        accepted_at = NOW(),
        accepted_by_auth_identity_id = ${acceptingIdentity.id},
        accepted_by_platform_person_id = ${acceptingIdentity.platformPersonId}
    WHERE token_hash = ${tokenHash}
      AND status = 'pending'
      AND expires_at > NOW()
      AND target_application = ${acceptingIdentity.authApplication}
    RETURNING id, workspace_id, invited_role_id
  `) as Array<{ id: string; workspace_id: string; invited_role_id: string }>;
  const invite = claimed[0];
  if (!invite) return { ok: false, reason: "invalid_or_used" };

  const roleRows = (await sql`
    SELECT key FROM workspace_roles WHERE id = ${invite.invited_role_id} LIMIT 1
  `) as Array<{ key: string }>;

  const { membershipId } = await addMember(sql, {
    workspaceId: invite.workspace_id,
    platformPersonId: acceptingIdentity.platformPersonId,
    authIdentityId: acceptingIdentity.id,
    roleKey: roleRows[0]?.key ?? "viewer",
  });
  return { ok: true, workspaceId: invite.workspace_id, membershipId };
}
