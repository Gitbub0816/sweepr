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
 * Crew assignment — seat CRUD on booking_crew_assignments and the concurrency-
 * safe ACCEPT path.
 *
 * SEAT MODEL. Each crew POSITION is one row (stable seat_index: 0 = LEAD,
 * 1..N-1 = MEMBER), respecting UNIQUE(booking_id, seat_index). A position is a
 * claimable slot: while open its cleaner_id is NULL and it holds an invitation
 * POOL (the top-N candidates invited in the current wave) in score_breakdown.
 * Multiple candidates are invited to the SAME position row; the FIRST valid
 * acceptance claims it.
 *
 * CLAIM-THEN-ACT (the last-seat race). Acceptance is a single conditional
 * UPDATE that flips the row INVITED→ACCEPTED and stamps cleaner_id only while it
 * is still open and on the same invitation wave:
 *
 *   UPDATE booking_crew_assignments
 *      SET status='ACCEPTED', cleaner_id=$me, responded_at=NOW()
 *    WHERE id=$seat AND status='INVITED' AND cleaner_id IS NULL
 *      AND crew_assignment_version=$wave
 *   RETURNING id
 *
 * Two cleaners accepting the same position race on ONE row; Postgres row-level
 * locking guarantees exactly one sees it still open — the loser gets 0 rows and
 * "position already filled". crew_assignment_version additionally rejects a
 * late acceptance from a previous invitation wave (after a TTL re-invite).
 * Eligibility + conflict are RE-VALIDATED at acceptance, never trusted from
 * invite time. On a LEAD accept the booking's compat pointer (bookings.cleaner_id)
 * is claimed too, exactly as the solo path does.
 */

import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import type { CrewRole, CrewSeat, CrewSeatStatus } from "./types";
import {
  rankCleanersForBooking,
  eligibleCleanersForBooking,
} from "../matching";
import { checkInsurance } from "../cleanerRequirements";
import { sendNotification } from "../notifications";
import { logger } from "../logger";
import { serverTrack } from "../posthog";

// ── Analytics (best-effort; never breaks a crew flow) ────────────────────────
// Team-clean events flow through the existing serverTrack/PostHog infra. The
// booking id is the distinct id (no PII). env is optional and threaded from the
// route/cron caller; without POSTHOG_KEY the emit is a no-op.
export type CrewAnalyticsEnv = { POSTHOG_KEY?: string };

async function emitCrewEvent(
  env: CrewAnalyticsEnv | undefined,
  event: string,
  bookingId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!env?.POSTHOG_KEY) return;
  try {
    await serverTrack(env, event, bookingId, { feature: "team_cleans", booking_id: bookingId, ...props });
  } catch {
    /* best-effort: analytics must never break a crew flow */
  }
}

// ── Invitation pool carried in a seat's score_breakdown while open ───────────
export interface CrewSeatPool {
  /** Invitation wave (mirrors crew_assignment_version at invite time). */
  wave: number;
  /** Cleaner ids invited in the CURRENT wave (eligible to accept now). */
  invited: string[];
  /** Cleaner ids who declined (any wave) — never re-invited. */
  declined: string[];
  /** Cleaner ids ever contacted (all waves) — for cascade exclusion. */
  contacted: string[];
  /** Per-candidate explainable scores, for admin visibility. */
  scores?: Record<string, { score: number; breakdown: Record<string, number> }>;
}

export interface CandidateInvite {
  cleanerId: string;
  score: number;
  breakdown: Record<string, number>;
}

export type AcceptFailure =
  | "seat_not_found"
  | "booking_not_found"
  | "position_filled"
  | "not_invited"
  | "already_on_crew"
  | "insurance_required"
  | "inactive"
  | "conflict"
  | "out_of_area";

export interface AcceptResult {
  ok: boolean;
  reason?: AcceptFailure;
  seat?: CrewSeat;
  role?: CrewRole;
}

// ── Row mapping ──────────────────────────────────────────────────────────────

interface SeatRow {
  id: string;
  booking_id: string;
  cleaner_id: string | null;
  role: CrewRole;
  seat_index: number;
  status: CrewSeatStatus;
  person_minutes: number | null;
  assignment_score: string | number | null;
  score_breakdown: unknown;
  earnings_cents: number;
  offered_at: string | null;
  expires_at: string | null;
  responded_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  vouched_by_assignment_id: string | null;
  stripe_transfer_id: string | null;
  crew_assignment_version: number;
}

function rowToSeat(r: SeatRow): CrewSeat {
  return {
    id: r.id,
    bookingId: r.booking_id,
    cleanerId: r.cleaner_id,
    role: r.role,
    seatIndex: r.seat_index,
    status: r.status,
    personMinutes: r.person_minutes,
    assignmentScore: r.assignment_score == null ? null : Number(r.assignment_score),
    earningsCents: r.earnings_cents,
    offeredAt: r.offered_at,
    expiresAt: r.expires_at,
    respondedAt: r.responded_at,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    vouchedByAssignmentId: r.vouched_by_assignment_id,
    stripeTransferId: r.stripe_transfer_id,
    crewAssignmentVersion: r.crew_assignment_version,
  };
}

function parsePool(raw: unknown): CrewSeatPool | null {
  try {
    const obj = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") return null;
    const crew = (obj.crew ?? obj) as Record<string, unknown>;
    if (!Array.isArray(crew.invited)) return null;
    return {
      wave: typeof crew.wave === "number" ? crew.wave : 0,
      invited: (crew.invited as unknown[]).filter((x): x is string => typeof x === "string"),
      declined: Array.isArray(crew.declined)
        ? (crew.declined as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      contacted: Array.isArray(crew.contacted)
        ? (crew.contacted as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      scores: (crew.scores as CrewSeatPool["scores"]) ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

const SEAT_COLS = `id, booking_id, cleaner_id, role, seat_index, status,
  person_minutes, assignment_score, score_breakdown, earnings_cents,
  offered_at, expires_at, responded_at, check_in_at, check_out_at,
  vouched_by_assignment_id, stripe_transfer_id, crew_assignment_version`;

export async function getCrewSeats(db: Sql, bookingId: string): Promise<CrewSeat[]> {
  const rows = (await db`
    SELECT id, booking_id, cleaner_id, role, seat_index, status,
           person_minutes, assignment_score, score_breakdown, earnings_cents,
           offered_at, expires_at, responded_at, check_in_at, check_out_at,
           vouched_by_assignment_id, stripe_transfer_id, crew_assignment_version
    FROM booking_crew_assignments
    WHERE booking_id = ${bookingId}
    ORDER BY seat_index ASC
  `) as SeatRow[];
  return rows.map(rowToSeat);
}

export async function getSeat(db: Sql, seatId: string): Promise<{ seat: CrewSeat; pool: CrewSeatPool | null } | null> {
  const rows = (await db`
    SELECT id, booking_id, cleaner_id, role, seat_index, status,
           person_minutes, assignment_score, score_breakdown, earnings_cents,
           offered_at, expires_at, responded_at, check_in_at, check_out_at,
           vouched_by_assignment_id, stripe_transfer_id, crew_assignment_version
    FROM booking_crew_assignments
    WHERE id = ${seatId} LIMIT 1
  `) as SeatRow[];
  const r = rows[0];
  if (!r) return null;
  return { seat: rowToSeat(r), pool: parsePool(r.score_breakdown) };
}

// ── Seat creation ────────────────────────────────────────────────────────────

export interface SeatSpec {
  role: CrewRole;
  seatIndex: number;
  personMinutes: number | null;
}

/**
 * Create the crew seat rows for a booking (idempotent per seat_index). Seats
 * start as open CANDIDATEs (cleaner_id NULL). The booking's crew_assignment
 * generation is stamped onto each seat's version.
 */
export async function createCrewSeats(
  db: Sql,
  bookingId: string,
  specs: SeatSpec[],
  version = 1,
): Promise<void> {
  for (const s of specs) {
    await db`
      INSERT INTO booking_crew_assignments
        (booking_id, cleaner_id, role, seat_index, status, person_minutes, crew_assignment_version)
      VALUES (${bookingId}, NULL, ${s.role}, ${s.seatIndex}, 'CANDIDATE',
              ${s.personMinutes}, ${version})
      ON CONFLICT (booking_id, seat_index) DO NOTHING
    `;
  }
}

// ── Invitations ──────────────────────────────────────────────────────────────

/**
 * Invite a wave of candidates to a still-open position. Bumps the seat's
 * crew_assignment_version (invalidating any late accept from a prior wave),
 * writes the invitation pool, sets the TTL, and notifies each invited cleaner.
 * Returns the invited cleaner ids, or [] if there was nothing to invite.
 */
export async function inviteCandidatesToSeat(
  db: Sql,
  seatId: string,
  candidates: CandidateInvite[],
  ttlMinutes: number,
  booking: BookingRow,
  env?: CrewAnalyticsEnv,
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const current = await getSeat(db, seatId);
  if (!current) return [];
  const prev = current.pool;
  const invitedNow = candidates.map((c) => c.cleanerId);
  const contacted = Array.from(new Set([...(prev?.contacted ?? []), ...invitedNow]));
  const wave = (current.seat.crewAssignmentVersion ?? 1) + 1;
  const scores: NonNullable<CrewSeatPool["scores"]> = {};
  for (const c of candidates) scores[c.cleanerId] = { score: c.score, breakdown: c.breakdown };

  const pool: CrewSeatPool = {
    wave,
    invited: invitedNow,
    declined: prev?.declined ?? [],
    contacted,
    scores,
  };
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const claimed = (await db`
    UPDATE booking_crew_assignments
    SET status = 'INVITED', cleaner_id = NULL, offered_at = NOW(),
        expires_at = ${expiresAt}, crew_assignment_version = ${wave},
        score_breakdown = ${JSON.stringify({ crew: pool })}::jsonb, updated_at = NOW()
    WHERE id = ${seatId} AND status IN ('CANDIDATE', 'INVITED')
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) return [];

  const role = current.seat.role;
  for (const cid of invitedNow) {
    await notifyCleanerById(db, cid, {
      type: role === "LEAD" ? "team_lead_offered" : "team_seat_offered",
      title: role === "LEAD" ? "Lead a team clean" : "Join a team clean",
      body: `A ${booking.service_type} team clean needs a ${role === "LEAD" ? "lead" : "helper"} near you. Respond within ${ttlMinutes} minutes.`,
      data: { href: "/jobs", bookingId: booking.id, seatId },
    });
  }
  await emitCrewEvent(env, "crew_member_invited", booking.id, {
    seat_id: seatId,
    role: current.seat.role,
    seat_index: current.seat.seatIndex,
    invitation_count: invitedNow.length,
  });
  return invitedNow;
}

// ── Accept (claim-then-act) ──────────────────────────────────────────────────

/**
 * A cleaner accepts a crew seat invitation. Re-validates eligibility and
 * conflicts AT acceptance, then atomically claims the position row. On a LEAD
 * accept the booking's compat pointer is claimed too.
 */
export async function acceptSeat(
  db: Sql,
  seatId: string,
  cleanerId: string,
  env?: CrewAnalyticsEnv,
): Promise<AcceptResult> {
  const current = await getSeat(db, seatId);
  if (!current) return { ok: false, reason: "seat_not_found" };
  const { seat, pool } = current;

  if (seat.status !== "INVITED" || seat.cleanerId != null) {
    return { ok: false, reason: "position_filled", seat, role: seat.role };
  }
  // Must be in the CURRENT invited wave (and not among those who declined).
  const invited = new Set(pool?.invited ?? []);
  const declined = new Set(pool?.declined ?? []);
  if (!invited.has(cleanerId) || declined.has(cleanerId)) {
    return { ok: false, reason: "not_invited", seat, role: seat.role };
  }

  const bookingRows = (await db`SELECT * FROM bookings WHERE id = ${seat.bookingId} LIMIT 1`) as BookingRow[];
  const booking = bookingRows[0];
  if (!booking) return { ok: false, reason: "booking_not_found" };

  // A cleaner may hold at most one seat on a booking.
  const held = (await db`
    SELECT 1 FROM booking_crew_assignments
    WHERE booking_id = ${seat.bookingId} AND cleaner_id = ${cleanerId}
      AND status IN ('ACCEPTED', 'COMPLETED')
    LIMIT 1
  `) as Array<{ "?column?": number }>;
  if (held[0]) return { ok: false, reason: "already_on_crew", seat, role: seat.role };

  // Re-validate eligibility fresh (never trust invite-time state).
  const invalid = await revalidate(db, booking, cleanerId);
  if (invalid) return { ok: false, reason: invalid, seat, role: seat.role };

  // ── The claim: exactly one concurrent accept wins this row ────────────────
  const winnerScore = pool?.scores?.[cleanerId]?.score ?? seat.assignmentScore ?? null;
  const winnerBreakdown = pool?.scores?.[cleanerId]?.breakdown ?? null;
  const claimed = (await db`
    UPDATE booking_crew_assignments
    SET status = 'ACCEPTED', cleaner_id = ${cleanerId}, responded_at = NOW(),
        assignment_score = ${winnerScore},
        score_breakdown = ${winnerBreakdown == null ? null : JSON.stringify(winnerBreakdown)}::jsonb,
        updated_at = NOW()
    WHERE id = ${seatId}
      AND status = 'INVITED'
      AND cleaner_id IS NULL
      AND crew_assignment_version = ${seat.crewAssignmentVersion}
    RETURNING id
  `) as Array<{ id: string }>;
  if (!claimed[0]) {
    return { ok: false, reason: "position_filled", seat, role: seat.role };
  }

  // LEAD accept also claims the booking-level compat pointer, mirroring the
  // solo path (assignment.ts): bookings.cleaner_id + status='cleaner_accepted'.
  if (seat.role === "LEAD") {
    await db`
      UPDATE bookings
      SET cleaner_id = ${cleanerId}, status = 'cleaner_accepted', updated_at = NOW()
      WHERE id = ${seat.bookingId}
        AND (cleaner_id IS NULL OR cleaner_id = ${cleanerId})
        AND status NOT IN ('in_progress', 'completed', 'cancelled_by_customer',
                           'cancelled_by_cleaner', 'cancelled_by_admin', 'cancelled')
    `;
  }

  logger.info("crew.seat_accepted", { bookingId: seat.bookingId, seatId, cleanerId, role: seat.role });
  await emitCrewEvent(env, "crew_member_accepted", seat.bookingId, {
    seat_id: seatId,
    role: seat.role,
    seat_index: seat.seatIndex,
  });
  const after = await getSeat(db, seatId);
  return { ok: true, seat: after?.seat ?? seat, role: seat.role };
}

/**
 * Re-validate a cleaner against a booking at acceptance. Returns a failure
 * reason, or null when the cleaner is fully eligible. Reuses the solo engine:
 * eligibility (account active + schedule + double-booking, widened for crews)
 * and the hard filters (service offering + own service area).
 */
async function revalidate(
  db: Sql,
  booking: BookingRow,
  cleanerId: string,
): Promise<AcceptFailure | null> {
  const cleaners = (await db`
    SELECT * FROM cleaners WHERE id = ${cleanerId} LIMIT 1
  `) as CleanerRow[];
  const cleaner = cleaners[0];
  if (!cleaner || (cleaner.status !== "approved" && cleaner.status !== "active")) {
    return "inactive";
  }
  const insurance = await checkInsurance(db, cleanerId);
  if (!insurance.valid) return "insurance_required";

  const eligible = await eligibleCleanersForBooking(booking, [cleaner], db);
  if (eligible.length === 0) return "conflict";
  const ranked = await rankCleanersForBooking(booking, [cleaner], db);
  if (ranked.length === 0) return "out_of_area";
  return null;
}

// ── Decline ──────────────────────────────────────────────────────────────────

/**
 * A cleaner declines a seat invitation. Records the decline in the pool (never
 * re-invited). Returns whether the current wave is now exhausted (all invited
 * candidates have declined) so the caller can cascade immediately.
 */
export async function declineSeat(
  db: Sql,
  seatId: string,
  cleanerId: string,
  env?: CrewAnalyticsEnv,
): Promise<{ ok: boolean; waveExhausted: boolean; seat?: CrewSeat }> {
  const current = await getSeat(db, seatId);
  if (!current) return { ok: false, waveExhausted: false };
  const { seat, pool } = current;
  if (seat.status !== "INVITED" || !pool) return { ok: false, waveExhausted: false, seat };
  if (!pool.invited.includes(cleanerId)) return { ok: false, waveExhausted: false, seat };

  const declined = Array.from(new Set([...pool.declined, cleanerId]));
  const next: CrewSeatPool = { ...pool, declined };
  await db`
    UPDATE booking_crew_assignments
    SET score_breakdown = ${JSON.stringify({ crew: next })}::jsonb, updated_at = NOW()
    WHERE id = ${seatId} AND status = 'INVITED'
  `;
  const outstanding = pool.invited.filter((c) => !declined.includes(c));
  logger.info("crew.seat_declined", { bookingId: seat.bookingId, seatId, cleanerId });
  await emitCrewEvent(env, "crew_member_declined", seat.bookingId, {
    seat_id: seatId,
    role: seat.role,
    seat_index: seat.seatIndex,
    decline_count: declined.length,
    wave_exhausted: outstanding.length === 0,
  });
  return { ok: true, waveExhausted: outstanding.length === 0, seat };
}

// ── Status / lifecycle mutations ─────────────────────────────────────────────

export async function setSeatStatus(db: Sql, seatId: string, status: CrewSeatStatus): Promise<void> {
  await db`
    UPDATE booking_crew_assignments SET status = ${status}, updated_at = NOW()
    WHERE id = ${seatId}
  `;
}

/**
 * Release an ACCEPTED (or otherwise filled) seat back to an open CANDIDATE for
 * replacement: clears cleaner_id, bumps the version (so any stale accept from
 * the departing occupant's wave fails), and preserves the seat_index. Used by
 * the AT_RISK replacement flow — the rest of the crew is untouched.
 */
export async function releaseSeatForReplacement(
  db: Sql,
  seatId: string,
  departingStatus: CrewSeatStatus = "CANCELLED",
): Promise<CrewSeat | null> {
  const current = await getSeat(db, seatId);
  if (!current) return null;
  const nextVersion = (current.seat.crewAssignmentVersion ?? 1) + 1;
  const rows = (await db`
    UPDATE booking_crew_assignments
    SET status = 'CANDIDATE', cleaner_id = NULL, offered_at = NULL, expires_at = NULL,
        responded_at = NULL, assignment_score = NULL, score_breakdown = NULL,
        crew_assignment_version = ${nextVersion}, updated_at = NOW()
    WHERE id = ${seatId}
    RETURNING id
  `) as Array<{ id: string }>;
  logger.info("crew.seat_released", { seatId, departingStatus, wasCleaner: current.seat.cleanerId });
  if (!rows[0]) return null;
  const after = await getSeat(db, seatId);
  return after?.seat ?? null;
}

/** Expire the current invitation on a seat (TTL lapsed, nobody accepted). */
export async function expireSeatInvitation(db: Sql, seatId: string): Promise<CrewSeat | null> {
  const rows = (await db`
    UPDATE booking_crew_assignments
    SET status = 'CANDIDATE', cleaner_id = NULL, offered_at = NULL, expires_at = NULL, updated_at = NOW()
    WHERE id = ${seatId} AND status = 'INVITED'
    RETURNING id
  `) as Array<{ id: string }>;
  if (!rows[0]) return null;
  const after = await getSeat(db, seatId);
  return after?.seat ?? null;
}

/** Permanently remove/cancel a seat (admin force action). */
export async function cancelSeat(db: Sql, seatId: string, status: CrewSeatStatus = "REMOVED"): Promise<void> {
  await db`
    UPDATE booking_crew_assignments SET status = ${status}, updated_at = NOW()
    WHERE id = ${seatId}
  `;
}

// ── Notification helper ──────────────────────────────────────────────────────

async function notifyCleanerById(
  db: Sql,
  cleanerId: string,
  payload: { type: string; title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const rows = (await db`SELECT user_id FROM cleaners WHERE id = ${cleanerId} LIMIT 1`) as Array<{
    user_id: string;
  }>;
  if (rows[0]?.user_id) {
    await sendNotification(db, rows[0].user_id, payload);
  }
}
