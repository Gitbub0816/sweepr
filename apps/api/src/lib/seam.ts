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
 * Seam smart-lock client (Access Grants — Seam's recommended primitive).
 *
 * A thin fetch wrapper over connect.getseam.com so we don't pull the Node SDK
 * into the Workers runtime. All calls are server-side; the SEAM_API_KEY never
 * reaches any client. Provider tokens and raw PINs returned here are handled by
 * the caller under the homeAccess guards and must never be logged, cached, or
 * persisted in plaintext (spec §8, §11, §18).
 */

const SEAM_BASE = "https://connect.getseam.com";

export class SeamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "SeamError";
  }
}

async function seamFetch<T>(apiKey: string, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SEAM_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new SeamError(`Seam ${path} failed (${res.status})`, res.status, json);
  }
  return json as T;
}

export interface SeamDevice {
  device_id: string;
  display_name?: string;
  device_type?: string;
  properties?: {
    online?: boolean;
    locked?: boolean;
    can_program_online_access_codes?: boolean;
    can_remotely_unlock?: boolean;
    can_remotely_lock?: boolean;
    battery_level?: number;
    model?: { display_name?: string };
  };
}

export function makeSeam(apiKey: string) {
  return {
    /** List the smart-lock devices under a connected account. */
    async listDevices(connectedAccountId?: string): Promise<SeamDevice[]> {
      const r = await seamFetch<{ devices: SeamDevice[] }>(
        apiKey,
        "/devices/list",
        connectedAccountId ? { connected_account_id: connectedAccountId } : {},
      );
      return r.devices ?? [];
    },

    /** Create (or reuse) a user identity for a cleaner. */
    async createUserIdentity(userIdentityKey: string, fullName?: string): Promise<string> {
      const r = await seamFetch<{ user_identity: { user_identity_id: string } }>(
        apiKey,
        "/user_identities/create",
        { user_identity_key: userIdentityKey, full_name: fullName },
      );
      return r.user_identity.user_identity_id;
    },

    /**
     * Create a time-bound Access Grant with a PIN code on the given device(s).
     * The grant auto-expires at ends_at; Seam programs and later removes the PIN.
     */
    async createCodeGrant(input: {
      userIdentityId: string;
      deviceIds: string[];
      startsAt: string; // ISO
      endsAt: string; // ISO
    }): Promise<{ accessGrantId: string }> {
      const r = await seamFetch<{ access_grant: { access_grant_id: string } }>(
        apiKey,
        "/access_grants/create",
        {
          user_identity_id: input.userIdentityId,
          device_ids: input.deviceIds,
          requested_access_methods: [{ mode: "code" }],
          starts_at: input.startsAt,
          ends_at: input.endsAt,
        },
      );
      return { accessGrantId: r.access_grant.access_grant_id };
    },

    /** Retrieve the issued PIN for an access grant (null until issued). */
    async getIssuedCode(accessGrantId: string): Promise<string | null> {
      const r = await seamFetch<{
        access_methods: Array<{ mode: string; is_issued: boolean; code?: string }>;
      }>(apiKey, "/access_methods/list", { access_grant_id: accessGrantId });
      const m = (r.access_methods ?? []).find((x) => x.mode === "code" && x.is_issued);
      return m?.code ?? null;
    },

    /** Server-triggered remote unlock. Returns the Seam action-attempt id. */
    async unlockDoor(deviceId: string): Promise<{ actionAttemptId: string }> {
      const r = await seamFetch<{ action_attempt: { action_attempt_id: string } }>(
        apiKey,
        "/locks/unlock_door",
        { device_id: deviceId },
      );
      return { actionAttemptId: r.action_attempt.action_attempt_id };
    },

    /** Server-triggered remote lock. */
    async lockDoor(deviceId: string): Promise<{ actionAttemptId: string }> {
      const r = await seamFetch<{ action_attempt: { action_attempt_id: string } }>(
        apiKey,
        "/locks/lock_door",
        { device_id: deviceId },
      );
      return { actionAttemptId: r.action_attempt.action_attempt_id };
    },

    /** Revoke an access grant immediately (deletes the programmed PIN/key). */
    async deleteAccessGrant(accessGrantId: string): Promise<void> {
      await seamFetch(apiKey, "/access_grants/delete", { access_grant_id: accessGrantId });
    },
  };
}

export type SeamClient = ReturnType<typeof makeSeam>;
