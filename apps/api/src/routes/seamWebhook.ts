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
 * Seam webhook handler — keeps our Smart Entry mirror (seam_connected_accounts,
 * smart_lock_connections, smart_lock_devices, booking_access_credentials) in
 * sync with Seam without polling (docs/seam-audit.md §1.5, §2, §3.3#5).
 *
 * Verification: Seam signs webhooks with Svix — the same svix-id/svix-timestamp/
 * svix-signature scheme as the Clerk webhook. Secret: SEAM_WEBHOOK_SECRET
 * (whsec_…), set via `wrangler secret put SEAM_WEBHOOK_SECRET` in apps/api.
 *
 * Idempotent: every delivery claims a seam_webhook_events row keyed on the Seam
 * event_id (or a hash of the raw body) with INSERT … ON CONFLICT DO NOTHING
 * RETURNING before doing any work — the stripe_events / yardstik pattern.
 *
 * Register this URL in the Seam dashboard → Webhooks:
 *   https://api.getsweepr.com/webhooks/seam
 * Subscribe at least to:
 *   connected_account.connected / .disconnected / .error
 *   device.connected / .disconnected
 *   access_grant.* / access_method.* (issuance confirmation)
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { logger } from "../lib/logger";
import {
  verifySvixSignature,
  sha256Hex,
  recordWebhookSignatureFailure,
} from "../lib/webhookAuth";
import type { AppBindings } from "../types";

export const seamWebhookRouter = new Hono<AppBindings>();

const SVIX_ID = "svix-id";
const SVIX_TIMESTAMP = "svix-timestamp";
const SVIX_SIGNATURE = "svix-signature";

/**
 * Seam events are flat objects: `{ event_id, event_type, created_at, ...,
 * <resource fields> }`. Only the fields we act on are typed here.
 */
interface SeamEvent {
  event_id?: string;
  event_type?: string;
  connected_account_id?: string;
  device_id?: string;
  access_grant_id?: string;
  access_method_id?: string;
  error_code?: string;
  custom_metadata?: Record<string, unknown> | null;
}

let lastSigFailureRecordedAt = 0;

seamWebhookRouter.post("/", async (c) => {
  const secret = c.env.SEAM_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: without the signing secret we cannot authenticate anything.
    logger.error("seam.webhook.missing_secret", new Error("SEAM_WEBHOOK_SECRET not configured"));
    return c.json({ error: "Webhook not configured" }, 500);
  }

  const svixId = c.req.header(SVIX_ID) ?? "";
  const svixTimestamp = c.req.header(SVIX_TIMESTAMP) ?? "";
  const svixSignatures = c.req.header(SVIX_SIGNATURE) ?? "";
  const body = await c.req.text();

  const verdict = await verifySvixSignature(secret, body, svixId, svixTimestamp, svixSignatures);
  if (!verdict.ok) {
    const now = Date.now();
    if (now - lastSigFailureRecordedAt > 10 * 60 * 1000) {
      lastSigFailureRecordedAt = now;
      logger.warn("seam.webhook.invalid_signature", {
        svixId,
        reason: verdict.reason,
        secretPrefix: secret.slice(0, 6),
      });
      recordWebhookSignatureFailure(c, { source: "seam", reason: verdict.reason });
    }
    return c.json({ error: "Invalid signature", reason: verdict.reason }, 401);
  }

  let event: SeamEvent;
  try {
    event = JSON.parse(body) as SeamEvent;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const eventType = event.event_type ?? "";
  const eventKey = event.event_id ? String(event.event_id) : await sha256Hex(body);
  const resourceId =
    event.connected_account_id ?? event.device_id ?? event.access_grant_id ?? null;

  // Dedup claim — a delivery that can't claim the row is a replay we skip.
  try {
    const claimed = (await sql`
      INSERT INTO seam_webhook_events (event_key, event_type, resource_id)
      VALUES (${eventKey}, ${eventType || null}, ${resourceId})
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;
    if (!claimed[0]) {
      logger.info("seam.webhook.duplicate", { eventKey, eventType });
      return c.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // Dedup store unavailable: don't drop a real event. Handler writes below are
    // idempotent status upserts, so processing a rare double is harmless.
    logger.warn("seam.webhook.dedup_failed", { err: String(err), eventKey });
  }

  try {
    await handleEvent(sql, event, eventType);
  } catch (err) {
    logger.error("seam.webhook.handler_error", err as Error, { eventType, eventKey });
    // 500 → Seam retries delivery (the dedup row is already claimed; a retry with
    // the same event_id is skipped, so we don't double-apply — but Seam typically
    // sends a fresh delivery id, letting the retry actually re-run).
    return c.json({ error: "handler_error" }, 500);
  }

  return c.json({ received: true });
});

async function handleEvent(
  sql: ReturnType<typeof getDb>,
  event: SeamEvent,
  eventType: string,
): Promise<void> {
  // ── Connected account lifecycle ────────────────────────────────────────────
  if (eventType.startsWith("connected_account.")) {
    const accountId = event.connected_account_id ?? null;
    if (!accountId) return;
    const status =
      eventType === "connected_account.connected"
        ? "connected"
        : eventType === "connected_account.disconnected"
          ? "disconnected"
          : eventType === "connected_account.error"
            ? "error"
            : null;
    if (!status) return;

    // Prefer the user_id we stamped into custom_metadata at webview creation so
    // a `connected` event can CREATE the row even if the status poll hasn't run.
    const metaUserId =
      typeof event.custom_metadata?.user_id === "string"
        ? (event.custom_metadata.user_id as string)
        : null;
    const provider =
      typeof event.custom_metadata?.provider === "string"
        ? (event.custom_metadata.provider as string)
        : "seam";

    // Update any existing row for this account first.
    const updated = (await sql`
      UPDATE seam_connected_accounts
      SET status = ${status}, updated_at = NOW()
      WHERE seam_connected_account_id = ${accountId}
      RETURNING id, user_id
    `) as Array<{ id: string; user_id: string }>;

    if (!updated[0] && metaUserId && status === "connected") {
      await sql`
        INSERT INTO seam_connected_accounts
          (user_id, seam_connected_account_id, provider, status)
        VALUES (${metaUserId}, ${accountId}, ${provider}, 'connected')
        ON CONFLICT (user_id, seam_connected_account_id) DO UPDATE
          SET status = 'connected', updated_at = NOW()
      `;
    }

    // Reflect on the smart_lock_connections mirror so device joins stay correct.
    const connStatus = status === "connected" ? "connected" : status === "error" ? "error" : "revoked";
    await sql`
      UPDATE smart_lock_connections
      SET status = ${connStatus},
          revoked_at = CASE WHEN ${connStatus} = 'revoked' THEN NOW() ELSE revoked_at END,
          last_health_check_at = NOW(), updated_at = NOW()
      WHERE provider_account_reference = ${accountId}
    `;
    logger.info("seam.webhook.connected_account", { accountId, status });
    return;
  }

  // ── Device online/offline ──────────────────────────────────────────────────
  if (eventType === "device.connected" || eventType === "device.disconnected") {
    const deviceRef = event.device_id ?? null;
    if (!deviceRef) return;
    const status = eventType === "device.connected" ? "active" : "offline";
    await sql`
      UPDATE smart_lock_devices
      SET status = ${status}, updated_at = NOW()
      WHERE provider_device_reference = ${deviceRef} AND status != 'removed'
    `;
    logger.info("seam.webhook.device", { deviceRef, status });
    return;
  }

  // ── Access grant / access method issuance (confirms optimistic 'active') ───
  // We write credentials optimistically 'active' at grant-create time (audit
  // §1.7#3); these events let Seam confirm the PIN was actually programmed, or
  // mark it 'error' when issuance fails. Matched by the access_grant_id we store
  // as provider_credential_reference.
  if (eventType.startsWith("access_grant.") || eventType.startsWith("access_method.")) {
    const grantId = event.access_grant_id ?? null;
    if (!grantId) return;
    const isFailure = eventType.endsWith(".failed") || eventType.endsWith(".error");
    if (isFailure) {
      // Seam failed to program the PIN — the credential can never work. Mark it
      // 'revoked' (the credential_status enum has no 'error' member) so reveal
      // returns no working credential.
      await sql`
        UPDATE booking_access_credentials
        SET credential_status = 'revoked', updated_at = NOW()
        WHERE provider_credential_reference = ${grantId}
          AND credential_status IN ('pending','active')
      `;
    } else if (eventType.endsWith(".issued") || eventType.endsWith(".created")) {
      await sql`
        UPDATE booking_access_credentials
        SET credential_status = 'active', updated_at = NOW()
        WHERE provider_credential_reference = ${grantId}
          AND credential_status = 'pending'
      `;
    }
    logger.info("seam.webhook.access_grant", { grantId, eventType });
    return;
  }

  logger.info("seam.webhook.unhandled", { eventType });
}
