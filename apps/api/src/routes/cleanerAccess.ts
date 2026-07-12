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
 * Cleaner home-access endpoints — reveal a code / unlock / lock (spec §11, §12).
 * EVERY request runs the full homeAccess authorization decision; the client is
 * never trusted. Credentials are returned with Cache-Control: no-store, never
 * logged, never placed in a URL, and never persisted client-side.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { loadSmartEntryConfig } from "../lib/smartEntryConfig";
import { authorizeHomeAccess, recordAccessEvent, type AccessInput } from "../lib/homeAccess";
import { makeSeam } from "../lib/seam";
import { decryptSecret, requireEncryptionKey } from "../lib/crypto";
import { sendNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

export const cleanerAccessRouter = new Hono<AppBindings>();

cleanerAccessRouter.use("*", requireAuth);

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number(),
  capturedAt: z.string(), // ISO
  reauthenticatedAt: z.string().nullish(),
  sessionId: z.string().min(1),
  deviceReference: z.string().nullish(),
});

async function cleanerUserId(sql: ReturnType<typeof getDb>, clerkId: string): Promise<string | null> {
  const r = (await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`) as Array<{ id: string }>;
  return r[0]?.id ?? null;
}

function toInput(
  body: z.infer<typeof locationSchema>,
  cleanerUId: string,
  bookingId: string,
  action: AccessInput["action"],
  ip: string | null,
): AccessInput {
  return {
    cleanerUserId: cleanerUId,
    bookingId,
    sessionId: body.sessionId,
    action,
    location: {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyMeters: body.accuracyMeters,
      capturedAt: new Date(body.capturedAt),
    },
    reauthenticatedAt: body.reauthenticatedAt ? new Date(body.reauthenticatedAt) : null,
    ip,
    deviceReference: body.deviceReference ?? null,
  };
}

/** Reveal the working credential for a booking (short-lived, no-store). */
cleanerAccessRouter.post("/bookings/:id/access/reveal", zValidator("json", locationSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  const uid = await cleanerUserId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");
  const ip = c.req.header("CF-Connecting-IP") ?? null;

  const decision = await authorizeHomeAccess(
    sql,
    cfg,
    toInput(c.req.valid("json"), uid, bookingId, "VIEW_CODE", ip),
  );
  if (!decision.allowed) return c.json({ error: "denied", reason: decision.reason }, 403);

  // Load the active credential.
  const creds = (await sql`
    SELECT id, credential_type, encrypted_credential, provider_credential_reference, expires_at
    FROM booking_access_credentials
    WHERE authorization_id = ${decision.authorizationId} AND credential_status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `) as Array<{
    id: string;
    credential_type: string;
    encrypted_credential: string | null;
    provider_credential_reference: string | null;
    expires_at: string | null;
  }>;
  const cred = creds[0];
  if (!cred) return c.json({ error: "no_credential" }, 404);

  let credential: string | null = null;
  try {
    if (cred.encrypted_credential) {
      const key = requireEncryptionKey(c.env.ACCESS_CODE_ENCRYPTION_KEY, c.env.ENVIRONMENT);
      credential = key ? await decryptSecret(cred.encrypted_credential, key) : cred.encrypted_credential;
    } else if (cred.provider_credential_reference && c.env.SEAM_API_KEY) {
      credential = await makeSeam(c.env.SEAM_API_KEY).getIssuedCode(cred.provider_credential_reference);
    }
  } catch (err) {
    logger.error("credential reveal failed", err, { bookingId }); // never logs the credential
    return c.json({ error: "reveal_failed" }, 502);
  }
  if (!credential) return c.json({ error: "credential_not_ready" }, 409);

  // Record the reveal (event carries NO credential) + bump the counter.
  await sql`
    UPDATE booking_access_credentials
    SET reveal_count = reveal_count + 1, last_revealed_at = NOW(), updated_at = NOW()
    WHERE id = ${cred.id}
  `;
  await recordAccessEvent(sql, {
    bookingId,
    cleanerId: uid,
    deviceId: decision.deviceId,
    eventType: "reveal_requested",
    decision: "allowed",
    sessionId: c.req.valid("json").sessionId,
    ip,
  });

  const remaining = Math.max(0, cfg.maxCodeRevealsPerBooking - 0);
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  return c.json({
    credentialType: cred.credential_type,
    credential,
    expiresAt: cred.expires_at,
    // Client hides the code after this many seconds (spec §11).
    displaySeconds: 45,
    remainingRevealCount: remaining,
  });
});

/** Server-triggered remote unlock (spec §12). */
cleanerAccessRouter.post("/bookings/:id/access/unlock", zValidator("json", locationSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.remoteUnlockEnabled) return c.json({ error: "remote_unlock_disabled" }, 403);
  const uid = await cleanerUserId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");
  const ip = c.req.header("CF-Connecting-IP") ?? null;

  const decision = await authorizeHomeAccess(
    sql,
    cfg,
    toInput(c.req.valid("json"), uid, bookingId, "UNLOCK", ip),
  );
  if (!decision.allowed) return c.json({ error: "denied", reason: decision.reason }, 403);
  if (!decision.deviceId || !c.env.SEAM_API_KEY) return c.json({ error: "no_device" }, 409);

  const dev = (await sql`
    SELECT provider_device_reference FROM smart_lock_devices WHERE id = ${decision.deviceId} LIMIT 1
  `) as Array<{ provider_device_reference: string }>;
  const deviceRef = dev[0]?.provider_device_reference;
  if (!deviceRef) return c.json({ error: "no_device" }, 409);

  // Notify the customer BEFORE the action so a failed provider call still alerts.
  const cust = (await sql`
    SELECT a.customer_id FROM booking_access_authorizations a WHERE a.id = ${decision.authorizationId} LIMIT 1
  `) as Array<{ customer_id: string }>;

  try {
    const attempt = await makeSeam(c.env.SEAM_API_KEY).unlockDoor(deviceRef);
    await recordAccessEvent(sql, {
      bookingId,
      cleanerId: uid,
      customerId: cust[0]?.customer_id ?? null,
      deviceId: decision.deviceId,
      eventType: "unlocked",
      decision: "allowed",
      providerEventReference: attempt.actionAttemptId,
      sessionId: c.req.valid("json").sessionId,
      ip,
    });
    if (cust[0]) {
      await sendNotification(sql, cust[0].customer_id, {
        type: "smart_entry",
        title: "Your door was unlocked",
        body: "Your Sweepr cleaner used Smart Entry to unlock your door for the scheduled cleaning.",
        data: { bookingId },
      });
    }
    return c.json({ status: "SUCCESS", eventId: attempt.actionAttemptId, message: "The door was unlocked." });
  } catch (err) {
    logger.error("smart entry unlock failed", err, { bookingId });
    await recordAccessEvent(sql, {
      bookingId,
      cleanerId: uid,
      deviceId: decision.deviceId,
      eventType: "unlock_denied",
      decision: "denied",
      denialReason: "PROVIDER_ERROR",
      ip,
    });
    return c.json({ status: "FAILED", message: "Smart Entry is temporarily unavailable." }, 502);
  }
});

/** Server-triggered remote lock at checkout (spec §14). */
cleanerAccessRouter.post("/bookings/:id/access/lock", zValidator("json", locationSchema), async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.remoteUnlockEnabled) return c.json({ error: "remote_unlock_disabled" }, 403);
  const uid = await cleanerUserId(sql, c.get("user").clerkId);
  if (!uid) return c.json({ error: "no_account" }, 400);
  const bookingId = c.req.param("id");
  const ip = c.req.header("CF-Connecting-IP") ?? null;

  const decision = await authorizeHomeAccess(
    sql,
    cfg,
    toInput(c.req.valid("json"), uid, bookingId, "LOCK", ip),
  );
  if (!decision.allowed) return c.json({ error: "denied", reason: decision.reason }, 403);
  if (!decision.deviceId || !c.env.SEAM_API_KEY) return c.json({ error: "no_device" }, 409);
  const dev = (await sql`
    SELECT provider_device_reference FROM smart_lock_devices WHERE id = ${decision.deviceId} LIMIT 1
  `) as Array<{ provider_device_reference: string }>;
  if (!dev[0]?.provider_device_reference) return c.json({ error: "no_device" }, 409);
  try {
    const attempt = await makeSeam(c.env.SEAM_API_KEY).lockDoor(dev[0].provider_device_reference);
    await recordAccessEvent(sql, {
      bookingId, cleanerId: uid, deviceId: decision.deviceId,
      eventType: "locked", decision: "allowed", providerEventReference: attempt.actionAttemptId, ip,
    });
    return c.json({ status: "SUCCESS", message: "The door was locked." });
  } catch (err) {
    logger.error("smart entry lock failed", err, { bookingId });
    return c.json({ status: "FAILED", message: "Could not lock the door." }, 502);
  }
});
