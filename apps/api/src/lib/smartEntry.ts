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
 * Smart Entry lifecycle — ties the booking access authorization, the Seam
 * Access Grant, and the encrypted credential row together (spec §7, §8, §15).
 * Credentials are never stored in plaintext; a customer-provided PIN is
 * envelope-encrypted, and Seam-issued PINs are fetched on demand at reveal time
 * (never persisted). Provider references are stored so we can revoke.
 */
import type { Sql } from "./db";
import type { Env } from "../types";
import { makeSeam } from "./seam";
import { encryptSecret, requireEncryptionKey } from "./crypto";
import { loadSmartEntryConfig, type SmartEntryConfig } from "./smartEntryConfig";
import { revokeBookingAccess, recordAccessEvent } from "./homeAccess";
import { sendNotification } from "./notifications";
import { logger } from "./logger";

/** Compute the booking's access window from config + schedule (spec §9). */
export function computeAccessWindow(
  scheduledAt: Date,
  durationMinutes: number | null,
  cfg: SmartEntryConfig,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(scheduledAt.getTime() - cfg.accessStartOffsetMinutes * 60_000);
  const completion = new Date(scheduledAt.getTime() + (durationMinutes ?? 120) * 60_000);
  const endsAt = new Date(completion.getTime() + cfg.accessEndOffsetMinutes * 60_000);
  return { startsAt, endsAt };
}

interface BookingRow {
  id: string;
  customer_user_id: string;
  address_id: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
}

async function loadBooking(sql: Sql, bookingId: string): Promise<BookingRow | null> {
  const rows = (await sql`
    SELECT b.id, cu.user_id AS customer_user_id, b.address_id,
           b.scheduled_at, b.duration_minutes
    FROM bookings b
    JOIN customers cu ON cu.id = b.customer_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `) as BookingRow[];
  return rows[0] ?? null;
}

/**
 * Persist the customer's chosen access method + explicit consent for a booking.
 * For sensitive methods (keypad_code / lockbox / other) the free-text/code is
 * envelope-encrypted into a credential row. Does NOT contact Seam — that
 * happens in `provisionSmartEntry` once a device is selected.
 */
export async function setBookingAccessMethod(
  sql: Sql,
  env: Env,
  input: {
    bookingId: string;
    method: "home" | "keypad_code" | "smart_entry" | "lockbox" | "front_desk" | "other";
    deviceId?: string | null;
    secretValue?: string | null; // PIN / lockbox code / free-text instructions
    consent?: { version: string; ip?: string | null; sessionId?: string | null } | null;
  },
): Promise<{ authorizationId: string }> {
  const cfg = await loadSmartEntryConfig(sql);
  const booking = await loadBooking(sql, input.bookingId);
  if (!booking) throw new Error("booking_not_found");

  const window =
    booking.scheduled_at != null
      ? computeAccessWindow(new Date(booking.scheduled_at), booking.duration_minutes, cfg)
      : null;

  const rows = (await sql`
    INSERT INTO booking_access_authorizations (
      booking_id, customer_id, property_id, lock_device_id, access_method,
      access_starts_at, access_ends_at, geofence_radius_meters,
      customer_authorized_at, consent_version, consent_ip, consent_session_id
    ) VALUES (
      ${input.bookingId}, ${booking.customer_user_id}, ${booking.address_id},
      ${input.deviceId ?? null}, ${input.method},
      ${window?.startsAt.toISOString() ?? null}, ${window?.endsAt.toISOString() ?? null},
      ${Math.min(cfg.maxGeofenceRadiusMeters, 150)},
      ${input.consent ? new Date().toISOString() : null},
      ${input.consent?.version ?? null}, ${input.consent?.ip ?? null},
      ${input.consent?.sessionId ?? null}
    )
    ON CONFLICT (booking_id) DO UPDATE SET
      property_id            = EXCLUDED.property_id,
      lock_device_id         = EXCLUDED.lock_device_id,
      access_method          = EXCLUDED.access_method,
      access_starts_at       = EXCLUDED.access_starts_at,
      access_ends_at         = EXCLUDED.access_ends_at,
      customer_authorized_at = COALESCE(EXCLUDED.customer_authorized_at, booking_access_authorizations.customer_authorized_at),
      consent_version        = COALESCE(EXCLUDED.consent_version, booking_access_authorizations.consent_version),
      consent_ip             = COALESCE(EXCLUDED.consent_ip, booking_access_authorizations.consent_ip),
      consent_session_id     = COALESCE(EXCLUDED.consent_session_id, booking_access_authorizations.consent_session_id),
      revoked_at             = NULL,
      revocation_reason      = NULL,
      updated_at             = NOW()
    RETURNING id
  `) as Array<{ id: string }>;
  const authorizationId = rows[0].id;

  // Store an encrypted customer-provided secret as a credential (never plaintext).
  if (input.secretValue && ["keypad_code", "lockbox", "other"].includes(input.method)) {
    const key = requireEncryptionKey(env.ACCESS_CODE_ENCRYPTION_KEY, env.ENVIRONMENT);
    const encrypted = key ? await encryptSecret(input.secretValue, key) : null;
    const credType = input.method === "keypad_code" ? "customer_pin" : "instructions";
    await sql`
      INSERT INTO booking_access_credentials (
        authorization_id, credential_type, encrypted_credential, credential_status,
        activates_at, expires_at
      ) VALUES (
        ${authorizationId}, ${credType}, ${encrypted}, 'active',
        ${window?.startsAt.toISOString() ?? null}, ${window?.endsAt.toISOString() ?? null}
      )
    `;
  }

  return { authorizationId };
}

/**
 * Provision a Seam-backed credential for a smart_entry booking: create a
 * time-bound Access Grant (PIN) on the selected device. Idempotent-ish — skips
 * if a live grant already exists. Safe no-op when Seam isn't configured.
 */
export async function provisionSmartEntry(sql: Sql, env: Env, bookingId: string): Promise<void> {
  const cfg = await loadSmartEntryConfig(sql);
  if (!cfg.smartEntryEnabled || !env.SEAM_API_KEY) return;

  const auth = (await sql`
    SELECT a.id, a.access_method, a.access_starts_at, a.access_ends_at, a.lock_device_id,
           a.customer_id, d.provider_device_reference, d.supports_remote_unlock
    FROM booking_access_authorizations a
    LEFT JOIN smart_lock_devices d ON d.id = a.lock_device_id
    WHERE a.booking_id = ${bookingId} AND a.revoked_at IS NULL
    LIMIT 1
  `) as Array<{
    id: string;
    access_method: string;
    access_starts_at: string | null;
    access_ends_at: string | null;
    lock_device_id: string | null;
    customer_id: string;
    provider_device_reference: string | null;
    supports_remote_unlock: boolean | null;
  }>;
  const a = auth[0];
  if (!a || a.access_method !== "smart_entry" || !a.provider_device_reference) return;
  if (!a.access_starts_at || !a.access_ends_at) return;

  // Already provisioned?
  const existing = (await sql`
    SELECT id FROM booking_access_credentials
    WHERE authorization_id = ${a.id} AND credential_status IN ('pending','active')
      AND credential_type IN ('generated_pin','remote_unlock')
    LIMIT 1
  `) as Array<{ id: string }>;
  if (existing[0]) return;

  const seam = makeSeam(env.SEAM_API_KEY);
  try {
    const identity = await seam.createUserIdentity(
      `sweepr-cleaner-booking-${bookingId}`,
      "Sweepr Cleaner",
    );
    const grant = await seam.createCodeGrant({
      userIdentityId: identity,
      deviceIds: [a.provider_device_reference],
      startsAt: a.access_starts_at,
      endsAt: a.access_ends_at,
    });
    await sql`
      INSERT INTO booking_access_credentials (
        authorization_id, credential_type, provider_credential_reference,
        credential_status, activates_at, expires_at
      ) VALUES (
        ${a.id}, ${a.supports_remote_unlock ? "remote_unlock" : "generated_pin"},
        ${grant.accessGrantId}, 'active', ${a.access_starts_at}, ${a.access_ends_at}
      )
    `;
    await recordAccessEvent(sql, {
      bookingId,
      customerId: a.customer_id,
      deviceId: a.lock_device_id,
      eventType: "code_created",
      decision: "allowed",
      providerEventReference: grant.accessGrantId,
    });
    await sendNotification(sql, a.customer_id, {
      type: "smart_entry",
      title: "Smart Entry is ready",
      body: "Temporary access for your upcoming cleaning is scheduled and will only work during your booking window.",
      data: { bookingId },
    });
  } catch (err) {
    logger.error("smart entry provision failed", err, { bookingId });
  }
}

/**
 * Revoke ALL access for a booking (spec §15): mark the authorization + creds
 * revoked in our DB, and delete the Seam grant so the physical PIN stops
 * working. Idempotent and safe if Seam is unconfigured.
 */
export async function revokeSmartEntry(
  sql: Sql,
  env: Env,
  bookingId: string,
  reason: string,
): Promise<void> {
  // Collect provider grant refs before our DB revoke flips their status.
  const creds = (await sql`
    SELECT c.provider_credential_reference
    FROM booking_access_credentials c
    JOIN booking_access_authorizations a ON a.id = c.authorization_id
    WHERE a.booking_id = ${bookingId}
      AND c.provider_credential_reference IS NOT NULL
      AND c.credential_status IN ('pending','active')
  `) as Array<{ provider_credential_reference: string }>;

  await revokeBookingAccess(sql, bookingId, reason);

  if (env.SEAM_API_KEY && creds.length) {
    const seam = makeSeam(env.SEAM_API_KEY);
    for (const c of creds) {
      try {
        await seam.deleteAccessGrant(c.provider_credential_reference);
      } catch (err) {
        logger.warn("seam grant delete failed during revoke", { bookingId, err });
      }
    }
  }
}
