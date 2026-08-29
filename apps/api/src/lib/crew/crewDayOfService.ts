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
 * Team Cleans — per-cleaner day-of-service operations.
 *
 * Every function here is gated at the ROUTE layer behind
 * isTeamFlagEnabled(sql, 'enabled') and a non-NULL bookings.crew_status. Solo /
 * legacy bookings (crew_status IS NULL) never reach this module, so their
 * behavior is byte-for-byte unchanged.
 *
 * Core invariants:
 *   - Each crew member checks in INDEPENDENTLY. A LEAD checking in never implies
 *     the members are present.
 *   - A MEMBER is marked present by EITHER their own GPS arrival OR a valid
 *     short-lived PIN vouch by an already-ACCEPTED+arrived crew member.
 *   - A no-show member is not paid (earnings_cents = 0); on-site elapsed time is
 *     recomputed for the reduced crew.
 *   - Only the LEAD completes the booking; one seat's premature action must
 *     never complete the others.
 *
 * ── PIN mechanism (NO schema change) ────────────────────────────────────────
 * The vouch PIN is EPHEMERAL and DERIVED, never stored. It is a TOTP-style
 * HMAC-SHA256 of (assignmentId, timeWindow) keyed by an existing worker secret.
 * The SECONDARY (helper) app fetches its own current PIN (generateVouchPin over
 * the helper's own seat id); the PRIMARY (lead) types it in on-site and the
 * server re-derives + compares (verifyVouchPin). Because the PIN is a pure
 * function of (assignmentId, current time window, secret), nothing is persisted
 * — no column on migration 101 is added or needed. The PIN rotates every
 * PIN_WINDOW_MS and a one-window grace is accepted, giving a short (~2×window)
 * validity that survives clock skew / network latency without a stored expiry.
 */

import type { Sql } from "@sweepr/db";
import type { CrewConfig } from "./crewConfig";
import type { CrewRole, CrewSeatStatus, CrewSizePlan } from "./types";
import { computeCrewPlan, elapsedMinutes } from "./crewSizing";

// ─── PIN (ephemeral, derived — no schema change) ────────────────────────────

/** How long a single derived PIN value is the "current" one. */
export const PIN_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
/** How many past windows still verify (clock-skew / latency grace). */
export const PIN_GRACE_WINDOWS = 1;
/** Digits in the human-typed PIN. */
export const PIN_DIGITS = 6;

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** RFC-4226-style dynamic truncation → zero-padded PIN_DIGITS string. */
function truncateToPin(mac: Uint8Array): string {
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const mod = 10 ** PIN_DIGITS;
  return String(bin % mod).padStart(PIN_DIGITS, "0");
}

async function pinForWindow(assignmentId: string, secret: string, windowIndex: number): Promise<string> {
  const mac = await hmacSha256(secret, `crew-vouch:${assignmentId}:${windowIndex}`);
  return truncateToPin(mac);
}

/** The current PIN a helper seat should display, for entry by the lead on-site. */
export async function generateVouchPin(
  assignmentId: string,
  secret: string,
  now: number = Date.now(),
): Promise<{ pin: string; expiresAt: string }> {
  const win = Math.floor(now / PIN_WINDOW_MS);
  const pin = await pinForWindow(assignmentId, secret, win);
  // Expiry the caller can surface: end of the last still-valid window.
  const expiresAt = new Date((win + 1) * PIN_WINDOW_MS).toISOString();
  return { pin, expiresAt };
}

/** Constant-time-ish equality over equal-length strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True iff `pin` matches the current or a within-grace prior window. */
export async function verifyVouchPin(
  assignmentId: string,
  pin: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (typeof pin !== "string" || !/^\d+$/.test(pin) || pin.length !== PIN_DIGITS) return false;
  const win = Math.floor(now / PIN_WINDOW_MS);
  for (let w = win; w >= win - PIN_GRACE_WINDOWS; w--) {
    const candidate = await pinForWindow(assignmentId, secret, w);
    if (safeEqual(candidate, pin)) return true;
  }
  return false;
}

// ─── Seat row shape ─────────────────────────────────────────────────────────

export interface CrewSeatRow {
  id: string;
  booking_id: string;
  cleaner_id: string | null;
  role: CrewRole;
  seat_index: number;
  status: CrewSeatStatus;
  person_minutes: number | null;
  earnings_cents: number;
  check_in_at: string | null;
  check_out_at: string | null;
  vouched_by_assignment_id: string | null;
}

const SEAT_COLUMNS =
  "id, booking_id, cleaner_id, role, seat_index, status, person_minutes, earnings_cents, check_in_at, check_out_at, vouched_by_assignment_id";

/** The ACCEPTED/COMPLETED seat a cleaner holds on a booking, if any. */
export async function findCrewSeat(
  sql: Sql,
  bookingId: string,
  cleanerId: string,
): Promise<CrewSeatRow | null> {
  const rows = (await sql`
    SELECT id, booking_id, cleaner_id, role, seat_index, status, person_minutes,
           earnings_cents, check_in_at, check_out_at, vouched_by_assignment_id
    FROM booking_crew_assignments
    WHERE booking_id = ${bookingId} AND cleaner_id = ${cleanerId}
      AND status IN ('ACCEPTED', 'COMPLETED')
    LIMIT 1
  `) as CrewSeatRow[];
  return rows[0] ?? null;
}

/** A specific seat by id, scoped to the booking. */
export async function getCrewSeat(
  sql: Sql,
  bookingId: string,
  assignmentId: string,
): Promise<CrewSeatRow | null> {
  const rows = (await sql`
    SELECT id, booking_id, cleaner_id, role, seat_index, status, person_minutes,
           earnings_cents, check_in_at, check_out_at, vouched_by_assignment_id
    FROM booking_crew_assignments
    WHERE booking_id = ${bookingId} AND id = ${assignmentId}
    LIMIT 1
  `) as CrewSeatRow[];
  return rows[0] ?? null;
}

// ─── Independent per-member check-in ────────────────────────────────────────

export interface RecordCheckInParams {
  bookingId: string;
  assignmentId: string;
  /** The voucher's seat id when a member is vouched in by PIN; null for self/GPS. */
  vouchedByAssignmentId?: string | null;
  nowIso?: string;
}

export interface CheckInResult {
  ok: boolean;
  reason?: "not_eligible" | "already_checked_in";
  seat?: CrewSeatRow;
}

/**
 * Mark ONE seat present. Claim-then-act: only an ACCEPTED seat that has not
 * already checked in is affected, so this is idempotent and never lets a LEAD's
 * check-in touch a member's row. The caller decides the source (GPS self-arrival
 * or PIN vouch) and passes vouchedByAssignmentId accordingly.
 */
export async function recordCrewCheckIn(sql: Sql, params: RecordCheckInParams): Promise<CheckInResult> {
  const now = params.nowIso ?? new Date().toISOString();
  const vouchedBy = params.vouchedByAssignmentId ?? null;

  const claimed = (await sql`
    UPDATE booking_crew_assignments
    SET check_in_at = ${now},
        vouched_by_assignment_id = ${vouchedBy},
        updated_at = NOW()
    WHERE id = ${params.assignmentId}
      AND booking_id = ${params.bookingId}
      AND status = 'ACCEPTED'
      AND check_in_at IS NULL
    RETURNING id, booking_id, cleaner_id, role, seat_index, status, person_minutes,
              earnings_cents, check_in_at, check_out_at, vouched_by_assignment_id
  `) as CrewSeatRow[];

  if (claimed[0]) return { ok: true, seat: claimed[0] };

  // Nothing claimed — distinguish already-present from ineligible so callers can
  // return the right status (200 idempotent vs 409/403).
  const current = await getCrewSeat(sql, params.bookingId, params.assignmentId);
  if (current && current.check_in_at) return { ok: false, reason: "already_checked_in", seat: current };
  return { ok: false, reason: "not_eligible", seat: current ?? undefined };
}

/**
 * Verify a voucher is entitled to vouch: they must hold an ACCEPTED seat on the
 * booking and be on-site themselves (checked in). Returns the voucher seat or null.
 */
export async function resolveVoucherSeat(
  sql: Sql,
  bookingId: string,
  voucherCleanerId: string,
): Promise<CrewSeatRow | null> {
  const seat = await findCrewSeat(sql, bookingId, voucherCleanerId);
  if (!seat) return null;
  if (seat.status !== "ACCEPTED" && seat.status !== "COMPLETED") return null;
  if (!seat.check_in_at) return null; // an absent voucher cannot vouch anyone in
  return seat;
}

// ─── No-show handling + crew re-plan ────────────────────────────────────────

export interface NoShowParams {
  bookingId: string;
  assignmentId: string;
  config: CrewConfig;
  productivityPermille?: Record<string, number>;
  nowIso?: string;
}

export interface NoShowResult {
  ok: boolean;
  reason?: "not_eligible";
  /** Seats still expected on-site after the no-show (checked-in or awaiting arrival minus this one). */
  presentCrewSize: number;
  /** Total booking labor (person-minutes) — unchanged by a no-show. */
  personMinutes: number | null;
  /** Recomputed on-site elapsed minutes for the reduced crew. */
  revisedElapsedMinutes: number | null;
  /** Full re-plan for the reduced crew (admin/lead context). */
  plan?: CrewSizePlan;
}

/**
 * At (or past) expected arrival, a member who never checked in → NO_SHOW, zero
 * pay, booking crew_status AT_RISK, and the on-site elapsed estimate recomputed
 * for the smaller crew. Claim-then-act guards against paying / double-processing
 * a member who actually did arrive.
 */
export async function handleNoShow(sql: Sql, params: NoShowParams): Promise<NoShowResult> {
  const now = params.nowIso ?? new Date().toISOString();

  const claimed = (await sql`
    UPDATE booking_crew_assignments
    SET status = 'NO_SHOW',
        earnings_cents = 0,
        updated_at = NOW()
    WHERE id = ${params.assignmentId}
      AND booking_id = ${params.bookingId}
      AND status = 'ACCEPTED'
      AND check_in_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;

  if (!claimed[0]) {
    return { ok: false, reason: "not_eligible", presentCrewSize: 0, personMinutes: null, revisedElapsedMinutes: null };
  }

  // Move the booking to AT_RISK (only if it is a crew booking — NULL stays NULL).
  await sql`
    UPDATE bookings SET crew_status = 'AT_RISK', updated_at = NOW()
    WHERE id = ${params.bookingId} AND crew_status IS NOT NULL
  `;

  // Reduced crew = seats still in play; total labor does not shrink.
  const agg = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))::int AS present,
      COALESCE(SUM(person_minutes), 0)::int AS total_pm
    FROM booking_crew_assignments
    WHERE booking_id = ${params.bookingId}
  `) as Array<{ present: number; total_pm: number }>;

  const presentCrewSize = agg[0]?.present ?? 0;
  const totalPm = agg[0]?.total_pm ?? 0;
  const personMinutes = totalPm > 0 ? totalPm : null;

  let revisedElapsedMinutes: number | null = null;
  let plan: CrewSizePlan | undefined;
  if (personMinutes != null && presentCrewSize > 0) {
    revisedElapsedMinutes = elapsedMinutes(personMinutes, presentCrewSize, params.productivityPermille);
    plan = computeCrewPlan({
      personMinutes,
      productivityPermille: params.productivityPermille,
      config: params.config,
    });
  }

  return { ok: true, presentCrewSize, personMinutes, revisedElapsedMinutes, plan };
}

// ─── Crew-aware completion (LEAD only) ──────────────────────────────────────

export interface CompleteCrewParams {
  bookingId: string;
  /** The completing cleaner's id (must be the LEAD). */
  callerCleanerId: string;
  nowIso?: string;
}

export interface CompleteCrewResult {
  ok: boolean;
  reason?: "no_lead" | "not_lead" | "unresolved_attendance";
  /** Seats still ACCEPTED without a check-in and not marked NO_SHOW. */
  unresolvedSeatIds?: string[];
  completedSeats?: number;
  noShowSeats?: number;
}

/**
 * Complete a crew booking. ONLY the LEAD may complete. Every member seat must
 * have its attendance resolved first (checked in, or already NO_SHOW) — an
 * unresolved seat blocks completion so a member who silently never arrived is
 * not quietly closed out. Marks every present seat COMPLETED (with a checkout
 * timestamp) and flips crew_status to COMPLETED. A non-LEAD caller changes
 * nothing, so one seat's premature action can never complete the others.
 */
export async function completeCrewBooking(sql: Sql, params: CompleteCrewParams): Promise<CompleteCrewResult> {
  const now = params.nowIso ?? new Date().toISOString();

  const seats = (await sql`
    SELECT id, booking_id, cleaner_id, role, seat_index, status, person_minutes,
           earnings_cents, check_in_at, check_out_at, vouched_by_assignment_id
    FROM booking_crew_assignments
    WHERE booking_id = ${params.bookingId}
    ORDER BY seat_index ASC
  `) as CrewSeatRow[];

  const lead = seats.find((s) => s.role === "LEAD");
  if (!lead) return { ok: false, reason: "no_lead" };
  if (lead.cleaner_id !== params.callerCleanerId) return { ok: false, reason: "not_lead" };

  // Any ACCEPTED seat that never checked in and was never marked NO_SHOW blocks
  // completion — attendance must be explicitly resolved.
  const unresolved = seats.filter((s) => s.status === "ACCEPTED" && !s.check_in_at);
  if (unresolved.length > 0) {
    return { ok: false, reason: "unresolved_attendance", unresolvedSeatIds: unresolved.map((s) => s.id) };
  }

  const completed = (await sql`
    UPDATE booking_crew_assignments
    SET status = 'COMPLETED',
        check_out_at = COALESCE(check_out_at, ${now}),
        updated_at = NOW()
    WHERE booking_id = ${params.bookingId}
      AND status = 'ACCEPTED'
      AND check_in_at IS NOT NULL
    RETURNING id
  `) as Array<{ id: string }>;

  await sql`
    UPDATE bookings SET crew_status = 'COMPLETED', updated_at = NOW()
    WHERE id = ${params.bookingId} AND crew_status IS NOT NULL
  `;

  const noShowSeats = seats.filter((s) => s.status === "NO_SHOW").length;
  return { ok: true, completedSeats: completed.length, noShowSeats };
}
