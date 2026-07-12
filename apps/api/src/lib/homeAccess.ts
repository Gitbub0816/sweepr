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
 * Home-access authorization — the security core of Smart Entry (spec §9, §10,
 * §28). A working credential (door code, digital key, unlock command) must
 * NEVER be exposed or usable merely because it exists or because a cleaner is
 * assigned. EVERY reveal/unlock/lock/view-instructions request must pass a
 * FRESH server-side decision here. The client is never trusted to evaluate any
 * of these conditions.
 *
 * When the safest action is uncertain, DENY and require support intervention.
 */
import type { Sql } from "./db";
import { haversineDistance } from "./haversine";
import type { SmartEntryConfig } from "./smartEntryConfig";

const MILES_TO_METERS = 1609.344;

export type AccessAction = "VIEW_CODE" | "UNLOCK" | "LOCK" | "VIEW_INSTRUCTIONS";

export interface AccessLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date;
}

export interface AccessInput {
  /** The authenticated caller's users.id (the cleaner). */
  cleanerUserId: string;
  bookingId: string;
  sessionId: string;
  action: AccessAction;
  location: AccessLocation;
  /** Timestamp of the cleaner's recent device biometric / passkey reauth. */
  reauthenticatedAt?: Date | null;
  ip?: string | null;
  deviceReference?: string | null;
}

export type AccessDecision =
  | { allowed: true; bookingId: string; cleanerId: string; authorizationId: string; deviceId: string | null; action: AccessAction }
  | { allowed: false; reason: string };

interface AccessRow {
  booking_id: string;
  booking_status: string;
  day_status: string | null;
  cleaner_row_id: string | null;
  cleaner_user_id: string | null;
  cleaner_status: string | null;
  didit_status: string | null;
  yardstik_status: string | null;
  customer_id: string | null;
  property_lat: number | null;
  property_lng: number | null;
  authorization_id: string | null;
  access_method: string | null;
  access_starts_at: string | null;
  access_ends_at: string | null;
  geofence_radius_meters: number | null;
  customer_authorized_at: string | null;
  access_revoked_at: string | null;
  lock_device_id: string | null;
}

/** Append an immutable access event. Never include a credential in metadata. */
export async function recordAccessEvent(
  sql: Sql,
  e: {
    bookingId?: string | null;
    customerId?: string | null;
    cleanerId?: string | null; // users.id
    deviceId?: string | null;
    eventType: string;
    decision?: "allowed" | "denied" | null;
    denialReason?: string | null;
    providerEventReference?: string | null;
    distanceMeters?: number | null;
    accuracyMeters?: number | null;
    sessionId?: string | null;
    ip?: string | null;
    deviceReference?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await sql`
    INSERT INTO home_access_events (
      booking_id, customer_id, cleaner_id, device_id, event_type, decision,
      denial_reason, provider_event_reference, location_distance_meters,
      location_accuracy_meters, session_id, ip_address, device_reference, metadata
    ) VALUES (
      ${e.bookingId ?? null}, ${e.customerId ?? null}, ${e.cleanerId ?? null},
      ${e.deviceId ?? null}, ${e.eventType}, ${e.decision ?? null},
      ${e.denialReason ?? null}, ${e.providerEventReference ?? null},
      ${e.distanceMeters ?? null}, ${e.accuracyMeters ?? null},
      ${e.sessionId ?? null}, ${e.ip ?? null}, ${e.deviceReference ?? null},
      ${e.metadata ? JSON.stringify(e.metadata) : null}::jsonb
    )
  `;
}

/** Cleaner's background-check status is eligible for home access. */
function backgroundEligible(yardstik: string | null): boolean {
  // Anything not explicitly cleared/complete is treated as ineligible.
  return yardstik === "clear" || yardstik === "complete" || yardstik === "eligible";
}

/**
 * The core decision. Records a denial event on any failure and an allowed event
 * only after the caller performs the action (callers should log the concrete
 * outcome). Returns a typed decision; never leaks a credential.
 */
export async function authorizeHomeAccess(
  sql: Sql,
  cfg: SmartEntryConfig,
  input: AccessInput,
  now = new Date(),
): Promise<AccessDecision> {
  if (!cfg.smartEntryEnabled) return deny("SMART_ENTRY_DISABLED");

  const rows = (await sql`
    SELECT
      b.id                AS booking_id,
      b.status            AS booking_status,
      b.day_status        AS day_status,
      cl.id               AS cleaner_row_id,
      cl.user_id          AS cleaner_user_id,
      cl.status           AS cleaner_status,
      cl.didit_status     AS didit_status,
      cl.yardstik_status  AS yardstik_status,
      a.user_id           AS customer_id,
      addr.lat            AS property_lat,
      addr.lng            AS property_lng,
      auth.id             AS authorization_id,
      auth.access_method  AS access_method,
      auth.access_starts_at,
      auth.access_ends_at,
      auth.geofence_radius_meters,
      auth.customer_authorized_at,
      auth.revoked_at     AS access_revoked_at,
      auth.lock_device_id AS lock_device_id
    FROM bookings b
    LEFT JOIN cleaners cl ON cl.id = b.cleaner_id
    LEFT JOIN addresses addr ON addr.id = b.address_id
    LEFT JOIN customers cust ON cust.id = b.customer_id
    LEFT JOIN users a ON a.id = cust.user_id
    LEFT JOIN booking_access_authorizations auth ON auth.booking_id = b.id
    WHERE b.id = ${input.bookingId}
    LIMIT 1
  `) as AccessRow[];

  const r = rows[0];
  const denyLogged = async (reason: string): Promise<AccessDecision> => {
    await recordAccessEvent(sql, {
      bookingId: input.bookingId,
      customerId: r?.customer_id ?? null,
      cleanerId: input.cleanerUserId,
      deviceId: r?.lock_device_id ?? null,
      eventType: eventTypeFor(input.action, false),
      decision: "denied",
      denialReason: reason,
      accuracyMeters: input.location?.accuracyMeters ?? null,
      sessionId: input.sessionId,
      ip: input.ip ?? null,
      deviceReference: input.deviceReference ?? null,
    });
    return { allowed: false, reason };
  };

  if (!r) return deny("NOT_FOUND");

  // ── Cleaner identity & eligibility ─────────────────────────────────────────
  if (!r.cleaner_row_id || r.cleaner_user_id !== input.cleanerUserId) {
    return denyLogged("NOT_ASSIGNED_CLEANER");
  }
  if (r.cleaner_status !== "approved") return denyLogged("CLEANER_NOT_ELIGIBLE");
  if (r.didit_status !== "approved") return denyLogged("CLEANER_NOT_ELIGIBLE");
  if (!backgroundEligible(r.yardstik_status)) return denyLogged("CLEANER_NOT_ELIGIBLE");

  // ── Booking assignment & status ────────────────────────────────────────────
  if (["cancelled", "completed", "canceled"].includes(r.booking_status)) {
    return denyLogged("INVALID_BOOKING_STATUS");
  }
  if (!r.day_status || !["arrived", "in_progress"].includes(r.day_status)) {
    return denyLogged("NOT_CHECKED_IN");
  }

  // ── Customer authorization must exist & not be revoked ─────────────────────
  if (!r.authorization_id) return denyLogged("NO_ACCESS_AUTHORIZATION");
  if (!["smart_entry", "keypad_code", "lockbox", "other"].includes(r.access_method ?? "")) {
    return denyLogged("NO_CREDENTIAL_FOR_METHOD");
  }
  if (r.access_revoked_at) return denyLogged("ACCESS_REVOKED");
  if (!r.customer_authorized_at) return denyLogged("CUSTOMER_NOT_AUTHORIZED");

  // ── Server-controlled time window ──────────────────────────────────────────
  if (!r.access_starts_at || !r.access_ends_at) return denyLogged("NO_ACCESS_WINDOW");
  if (now < new Date(r.access_starts_at) || now > new Date(r.access_ends_at)) {
    return denyLogged("OUTSIDE_ACCESS_WINDOW");
  }

  // ── Fresh, accurate location within the geofence ──────────────────────────
  const loc = input.location;
  if (!loc) return denyLogged("LOCATION_REQUIRED");
  const ageMs = now.getTime() - new Date(loc.capturedAt).getTime();
  if (ageMs > cfg.maxLocationAgeSeconds * 1000) return denyLogged("STALE_LOCATION");
  if (loc.accuracyMeters > cfg.maxLocationAccuracyMeters) return denyLogged("LOCATION_NOT_ACCURATE");
  if (r.property_lat == null || r.property_lng == null) return denyLogged("PROPERTY_LOCATION_UNKNOWN");
  const distanceMeters =
    haversineDistance(loc.latitude, loc.longitude, r.property_lat, r.property_lng) * MILES_TO_METERS;
  const radius = Math.min(r.geofence_radius_meters ?? cfg.maxGeofenceRadiusMeters, cfg.maxGeofenceRadiusMeters);
  if (distanceMeters > radius) return denyLogged("OUTSIDE_GEOFENCE");

  // ── Recent reauthentication ────────────────────────────────────────────────
  if (cfg.requireBiometric) {
    if (!input.reauthenticatedAt) return denyLogged("REAUTHENTICATION_REQUIRED");
    const reauthAge = now.getTime() - new Date(input.reauthenticatedAt).getTime();
    if (reauthAge < 0 || reauthAge > cfg.reauthMaxAgeSeconds * 1000) {
      return denyLogged("REAUTHENTICATION_EXPIRED");
    }
  }

  // ── Rate limiting (server-counted from the immutable event log) ────────────
  const limited = await isRateLimited(sql, cfg, input, now);
  if (limited) return denyLogged("RATE_LIMITED");

  return {
    allowed: true,
    bookingId: r.booking_id,
    cleanerId: input.cleanerUserId,
    authorizationId: r.authorization_id,
    deviceId: r.lock_device_id,
    action: input.action,
  };
}

function deny(reason: string): AccessDecision {
  return { allowed: false, reason };
}

function eventTypeFor(action: AccessAction, allowed: boolean): string {
  const base =
    action === "UNLOCK" ? "unlock" : action === "LOCK" ? "lock" : action === "VIEW_CODE" ? "reveal" : "view_instructions";
  return allowed ? `${base}_requested` : `${base}_denied`;
}

async function isRateLimited(
  sql: Sql,
  cfg: SmartEntryConfig,
  input: AccessInput,
  now: Date,
): Promise<boolean> {
  if (input.action === "UNLOCK") {
    const since = new Date(now.getTime() - 10 * 60_000).toISOString();
    const rows = (await sql`
      SELECT COUNT(*)::int AS n FROM home_access_events
      WHERE booking_id = ${input.bookingId}
        AND event_type IN ('unlock_requested','unlocked','unlock_denied')
        AND occurred_at >= ${since}
    `) as { n: number }[];
    return (rows[0]?.n ?? 0) >= cfg.maxUnlockAttemptsPer10Min;
  }
  if (input.action === "VIEW_CODE") {
    const rows = (await sql`
      SELECT COUNT(*)::int AS n FROM home_access_events
      WHERE booking_id = ${input.bookingId} AND event_type = 'reveal_requested'
    `) as { n: number }[];
    return (rows[0]?.n ?? 0) >= cfg.maxCodeRevealsPerBooking;
  }
  return false;
}

/**
 * Revoke all access for a booking (spec §15). Idempotent. Marks the
 * authorization revoked, expires credentials, and logs the reason. Provider-
 * side revocation (deleting Seam codes) is handled by the caller.
 */
export async function revokeBookingAccess(
  sql: Sql,
  bookingId: string,
  reason: string,
): Promise<void> {
  const auth = (await sql`
    UPDATE booking_access_authorizations
    SET revoked_at = COALESCE(revoked_at, NOW()), revocation_reason = ${reason}, updated_at = NOW()
    WHERE booking_id = ${bookingId} AND revoked_at IS NULL
    RETURNING id, customer_id
  `) as { id: string; customer_id: string }[];
  if (!auth[0]) return;
  await sql`
    UPDATE booking_access_credentials
    SET credential_status = 'revoked', updated_at = NOW()
    WHERE authorization_id = ${auth[0].id}
      AND credential_status IN ('pending','active')
  `;
  await recordAccessEvent(sql, {
    bookingId,
    customerId: auth[0].customer_id,
    eventType: "access_revoked",
    decision: "allowed",
    denialReason: reason,
  });
}
