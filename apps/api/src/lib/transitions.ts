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
 * Cross-app transitions engine (spec §4.3) — the secure bridge between the
 * app silos (e.g. a Customer session initiating a Business workspace).
 *
 * Tokens: 32 random bytes, single-use, 15-minute expiry, sha256-hashed at
 * rest, bound to the intended platform person + target application + action.
 * Raw tokens are returned once from createTransition and never logged.
 *
 * Completion is claim-then-act: a conditional
 * UPDATE … WHERE status='pending' … RETURNING claims the row atomically
 * (hash + pending + unexpired + target app + intended-person binding all in
 * the WHERE) before any handler side effect runs.
 *
 * Conversion handlers move ONLY the addresses.workspace_id pointer — booking
 * rows and all financial history are never touched.
 */

import { z } from "zod";
import type { Sql } from "./db";
import type { AuthApplication } from "./authApps";
import type { AuthIdentity } from "./identity";
import { generateInvitationToken, sha256Hex } from "./invitations";
import { createWorkspace } from "./workspaces";

export const TRANSITION_TTL_MS = 15 * 60 * 1000;

// ── Typed payloads ────────────────────────────────────────────────────────────

export const createBusinessWorkspacePayloadSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(200).optional(),
    businessType: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const convertCustomerToBusinessPayloadSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(200).optional(),
    businessType: z.string().trim().min(1).max(80).optional(),
    /** full: every personal address moves; partition: only payload.addressIds. */
    mode: z.enum(["full", "partition"]),
    addressIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  })
  .strict()
  .refine((p) => p.mode !== "partition" || (p.addressIds?.length ?? 0) > 0, {
    message: "partition mode requires addressIds",
    path: ["addressIds"],
  })
  .refine((p) => p.mode !== "full" || p.addressIds === undefined, {
    message: "full mode must not include addressIds",
    path: ["addressIds"],
  });

export type CreateBusinessWorkspacePayload = z.infer<
  typeof createBusinessWorkspacePayloadSchema
>;
export type ConvertCustomerToBusinessPayload = z.infer<
  typeof convertCustomerToBusinessPayloadSchema
>;

export type SupportedTransitionType =
  | "create_business_workspace"
  | "convert_customer_to_business";

const PAYLOAD_SCHEMAS: Record<SupportedTransitionType, z.ZodTypeAny> = {
  create_business_workspace: createBusinessWorkspacePayloadSchema,
  convert_customer_to_business: convertCustomerToBusinessPayloadSchema,
};

/** Pure payload validation — throws ZodError on invalid shape. */
export function validateTransitionPayload(
  type: SupportedTransitionType,
  payload: unknown,
): CreateBusinessWorkspacePayload | ConvertCustomerToBusinessPayload {
  return PAYLOAD_SCHEMAS[type].parse(payload) as
    | CreateBusinessWorkspacePayload
    | ConvertCustomerToBusinessPayload;
}

/**
 * Pure partition check: every requested address id must be one the initiating
 * person owns. Returns the ids that are NOT owned (empty array = valid).
 */
export function invalidPartitionAddressIds(
  requestedIds: readonly string[],
  ownedIds: readonly string[],
): string[] {
  const owned = new Set(ownedIds);
  return requestedIds.filter((id) => !owned.has(id));
}

// ── Create ────────────────────────────────────────────────────────────────────

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

/**
 * Create a pending transition and return the RAW token exactly once.
 * Payload is schema-validated per type; partition address ownership is
 * verified here (at initiation, under the initiating person's session) and
 * re-verified at completion.
 */
export async function createTransition(
  sql: Sql,
  input: {
    sourceApplication: AuthApplication;
    sourceAuthIdentityId: string;
    targetApplication: AuthApplication;
    intendedPlatformPersonId: string;
    type: SupportedTransitionType;
    payload: unknown;
  },
): Promise<{ transitionId: string; rawToken: string; expiresAt: Date }> {
  const payload = validateTransitionPayload(input.type, input.payload);

  if (input.type === "convert_customer_to_business") {
    const p = payload as ConvertCustomerToBusinessPayload;
    if (p.mode === "partition") {
      const invalid = invalidPartitionAddressIds(
        p.addressIds ?? [],
        await ownedAddressIds(sql, input.intendedPlatformPersonId),
      );
      if (invalid.length > 0) {
        throw new TransitionError("One or more addresses do not belong to your account");
      }
    }
  }

  const rawToken = generateInvitationToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TRANSITION_TTL_MS);

  const rows = (await sql`
    INSERT INTO cross_app_transitions (source_application, source_auth_identity_id,
                                       target_application, intended_platform_person_id,
                                       transition_type, payload, token_hash, expires_at)
    VALUES (${input.sourceApplication}, ${input.sourceAuthIdentityId},
            ${input.targetApplication}, ${input.intendedPlatformPersonId},
            ${input.type}, ${JSON.stringify(payload)}, ${tokenHash},
            ${expiresAt.toISOString()})
    RETURNING id
  `) as Array<{ id: string }>;
  return { transitionId: rows[0].id, rawToken, expiresAt };
}

// ── Complete ──────────────────────────────────────────────────────────────────

export type CompleteTransitionResult =
  | { ok: true; transitionType: SupportedTransitionType; workspaceId: string; movedAddressCount: number }
  | { ok: false; reason: "invalid_or_used" | "handler_failed"; detail?: string };

/**
 * Claim and execute a transition. The conditional UPDATE claims the row (hash
 * + pending + unexpired + target application + intended person all in the
 * WHERE) so tokens are strictly single-use; only then do handlers run.
 */
export async function completeTransition(
  sql: Sql,
  rawToken: string,
  completingIdentity: AuthIdentity,
): Promise<CompleteTransitionResult> {
  const tokenHash = await sha256Hex(rawToken);
  const claimed = (await sql`
    UPDATE cross_app_transitions
    SET status = 'completed',
        completed_auth_identity_id = ${completingIdentity.id},
        completed_at = NOW()
    WHERE token_hash = ${tokenHash}
      AND status = 'pending'
      AND expires_at > NOW()
      AND target_application = ${completingIdentity.authApplication}
      AND (intended_platform_person_id IS NULL
           OR intended_platform_person_id = ${completingIdentity.platformPersonId})
    RETURNING id, transition_type, intended_platform_person_id, payload
  `) as Array<{
    id: string;
    transition_type: string;
    intended_platform_person_id: string | null;
    payload: unknown;
  }>;
  const transition = claimed[0];
  if (!transition) return { ok: false, reason: "invalid_or_used" };

  const type = transition.transition_type as SupportedTransitionType;
  if (!(type in PAYLOAD_SCHEMAS)) {
    return { ok: false, reason: "handler_failed", detail: "Unsupported transition type" };
  }

  try {
    const payload = validateTransitionPayload(type, transition.payload ?? {});
    const initiatingPersonId =
      transition.intended_platform_person_id ?? completingIdentity.platformPersonId;

    if (type === "create_business_workspace") {
      const workspace = await handleCreateBusinessWorkspace(
        sql,
        payload as CreateBusinessWorkspacePayload,
        completingIdentity,
      );
      return { ok: true, transitionType: type, workspaceId: workspace.id, movedAddressCount: 0 };
    }

    const result = await handleConvertCustomerToBusiness(
      sql,
      payload as ConvertCustomerToBusinessPayload,
      completingIdentity,
      initiatingPersonId,
    );
    return {
      ok: true,
      transitionType: type,
      workspaceId: result.workspaceId,
      movedAddressCount: result.movedAddressCount,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "handler_failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCreateBusinessWorkspace(
  sql: Sql,
  payload: CreateBusinessWorkspacePayload,
  completingIdentity: AuthIdentity,
) {
  return createWorkspace(sql, {
    category: "business_customer",
    name: payload.workspaceName,
    legalName: payload.legalName,
    businessType: payload.businessType,
    createdByPersonId: completingIdentity.platformPersonId,
    ownerAuthIdentityId: completingIdentity.id,
    viaTransition: true,
  });
}

/** Address ids the person's account owns (legacy user link OR personal workspace). */
async function ownedAddressIds(sql: Sql, platformPersonId: string): Promise<string[]> {
  const rows = (await sql`
    SELECT a.id
    FROM addresses a
    WHERE a.user_id = (SELECT user_id FROM platform_people WHERE id = ${platformPersonId})
       OR a.workspace_id IN (
            SELECT wm.workspace_id
            FROM workspace_memberships wm
            JOIN workspaces w ON w.id = wm.workspace_id
            WHERE wm.platform_person_id = ${platformPersonId}
              AND w.workspace_category = 'personal_customer'
          )
  `) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

async function handleConvertCustomerToBusiness(
  sql: Sql,
  payload: ConvertCustomerToBusinessPayload,
  completingIdentity: AuthIdentity,
  initiatingPersonId: string,
): Promise<{ workspaceId: string; movedAddressCount: number }> {
  const owned = await ownedAddressIds(sql, initiatingPersonId);

  let idsToMove: string[];
  if (payload.mode === "partition") {
    const requested = payload.addressIds ?? [];
    const invalid = invalidPartitionAddressIds(requested, owned);
    if (invalid.length > 0) {
      throw new TransitionError("One or more addresses do not belong to the initiating account");
    }
    idsToMove = requested;
  } else {
    idsToMove = owned;
  }

  const workspace = await handleCreateBusinessWorkspace(sql, payload, completingIdentity);

  // Financial history stays intact: ONLY the workspace_id pointer moves —
  // bookings and payment rows are never modified.
  let movedAddressCount = 0;
  if (idsToMove.length > 0) {
    const moved = (await sql`
      UPDATE addresses
      SET workspace_id = ${workspace.id}
      WHERE id = ANY(${idsToMove})
      RETURNING id
    `) as Array<{ id: string }>;
    movedAddressCount = moved.length;
  }
  return { workspaceId: workspace.id, movedAddressCount };
}
