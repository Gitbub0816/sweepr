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
 * Crew staffing — the orchestration STATE MACHINE that drives a booking from
 * "needs a crew" to a fully CONFIRMED team, reusing the solo assignment engine
 * for the degenerate crew of one.
 *
 * crew_status is an ORTHOGONAL axis on bookings (like day_status); it never
 * touches bookings.status or isValidTransition. Transitions:
 *
 *   NEEDS_STAFFING  seats created, nothing invited yet
 *        │  invite LEAD wave
 *        ▼
 *   STAFFING        LEAD invitation(s) outstanding
 *        │  LEAD accepts (claims bookings.cleaner_id)
 *        ▼
 *   PARTIALLY_STAFFED  LEAD in; MEMBER seats being staffed in parallel
 *        │  every required seat ACCEPTED
 *        ▼
 *   CONFIRMED
 *        │  a confirmed member/lead drops
 *        ▼
 *   AT_RISK         replacement flow for the vacated seat ONLY (rest preserved)
 *        └─ replacement accepts ─► CONFIRMED
 *
 *   STAFFING_FAILED  a required seat's candidate pool is exhausted → admin
 *                    escalation. We NEVER silently shrink the crew or let an
 *                    unvetted helper through.
 *
 * DISPATCH. The LEAD is invited first (a small parallel batch). MEMBER seats
 * are staffed only once a LEAD exists (member scoring is relative to the LEAD)
 * and are PARALLEL_LIMITED: each open seat gets its own disjoint wave of the
 * top-N candidates; the first valid acceptance fills the seat and the rest of
 * that wave simply lose. TTL lapses and full-wave declines cascade to the next
 * batch of candidates until the pool is exhausted.
 *
 * Solo bookings (requiredCrewSize === 1) run the EXISTING single-seat path
 * (initiateAssignment) completely unchanged — no crew rows, crew_status NULL.
 */

import type { Sql, BookingRow } from "@sweepr/db";
import type { CrewSeat, CrewStatus } from "./types";
import { loadCrewConfig, isTeamFlagEnabled, type CrewConfig } from "./crewConfig";
import { computeCrewPlan } from "./crewSizing";
import { rankLeadCandidates, rankCrewCandidates, type CrewCandidateScore } from "./crewMatching";
import {
  createCrewSeats,
  getCrewSeats,
  getSeat,
  inviteCandidatesToSeat,
  releaseSeatForReplacement,
  expireSeatInvitation,
  type CandidateInvite,
  type SeatSpec,
  type CrewAnalyticsEnv,
} from "./crewAssignment";
import { initiateAssignment } from "../assignment";
import { sendNotification } from "../notifications";
import { logger } from "../logger";
import { serverTrack } from "../posthog";

// ── Analytics (best-effort; never breaks a crew flow) ────────────────────────
// env is optional and threaded from the route/cron caller; without POSTHOG_KEY
// the emit is a no-op. Booking id is the distinct id (no PII).
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

// Booking row plus the crew/pricing columns (migration 097 + 101) not on the
// shared BookingRow type. A CrewBookingRow is still a valid BookingRow, so the
// solo matching engine accepts it directly.
type CrewBookingRow = BookingRow & {
  pricing_version_id: string | null;
  pricing_quote_v2_id: string | null;
  extra_cleaner_requested: boolean;
  crew_status: CrewStatus | null;
  required_crew_size: number | null;
  target_crew_size: number | null;
  min_crew_size: number;
  crew_assignment_version: number;
};

export interface StartStaffingResult {
  mode: "solo" | "crew" | "skipped";
  reason?: string;
  requiredCrewSize?: number;
  crewStatus?: CrewStatus;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Plan the crew size from the booking's v2 person-minutes and start staffing.
 * Gated by the Team Cleans master flag (default OFF): with the flag off, or when
 * sizing lands on a solo job, the existing single-cleaner path runs unchanged.
 */
export async function planAndStartStaffing(
  db: Sql,
  bookingId: string,
  env?: CrewAnalyticsEnv,
): Promise<StartStaffingResult> {
  if (!(await isTeamFlagEnabled(db, "enabled"))) {
    await initiateAssignment(db, bookingId);
    return { mode: "solo", reason: "flag_off" };
  }

  const booking = await loadBooking(db, bookingId);
  if (!booking) return { mode: "skipped", reason: "not_found" };

  // Person-minutes are only trustworthy when v2 was active at booking time
  // (pricing_version_id NOT NULL). Otherwise sizing defers to solo.
  let personMinutes: number | null = null;
  let productivityPermille: Record<string, number> | undefined;
  if (booking.pricing_version_id) {
    const pm = await loadPersonMinutes(db, booking);
    personMinutes = pm.personMinutes;
    productivityPermille = pm.productivityPermille;
  }

  const cfg = await loadCrewConfig(db);
  const autoSizing = await isTeamFlagEnabled(db, "autoSizing");
  const plan = computeCrewPlan({
    personMinutes,
    productivityPermille,
    extraCleanerRequested: booking.extra_cleaner_requested,
    config: cfg,
  });

  await emitCrewEvent(env, "crew_size_calculated", bookingId, {
    crew_size: plan.recommendedCrewSize,
    person_minutes: personMinutes,
    elapsed_estimate: plan.estimatedElapsedMinutes,
    min_crew_size: plan.minCrewSize,
    max_useful_crew_size: plan.maxUsefulCrewSize,
    reason_codes: plan.reasonCodes,
    extra_cleaner_requested: booking.extra_cleaner_requested,
  });

  // Without auto-sizing enabled we only ever crew when the customer explicitly
  // bought an extra cleaner; otherwise the job stays solo.
  let requiredCrewSize = plan.recommendedCrewSize;
  if (!autoSizing && !booking.extra_cleaner_requested) requiredCrewSize = 1;
  requiredCrewSize = Math.max(1, Math.min(requiredCrewSize, cfg.maxCrewSize));

  if (requiredCrewSize === 1) {
    // SOLO — the existing single-seat path, untouched.
    await initiateAssignment(db, bookingId);
    return { mode: "solo" };
  }

  // ── CREW ──
  await emitCrewEvent(env, "team_clean_required", bookingId, {
    crew_size: requiredCrewSize,
    person_minutes: personMinutes,
    min_crew_size: plan.minCrewSize,
  });
  const version = booking.crew_assignment_version ?? 1;
  await createCrewSeats(db, bookingId, buildSeatSpecs(requiredCrewSize, personMinutes, cfg), version);
  await db`
    UPDATE bookings
    SET required_crew_size = ${requiredCrewSize}, target_crew_size = ${requiredCrewSize},
        min_crew_size = ${plan.minCrewSize}, crew_status = 'NEEDS_STAFFING', updated_at = NOW()
    WHERE id = ${bookingId}
  `;

  // Auto-matching decides whether we dispatch invitations now or leave the seats
  // for an admin to fill manually.
  if (!(await isTeamFlagEnabled(db, "autoMatching"))) {
    return { mode: "crew", requiredCrewSize, crewStatus: "NEEDS_STAFFING" };
  }

  const invited = await inviteLeadWave(db, booking, cfg, env);
  if (invited === 0) {
    await failStaffing(db, bookingId, "no_lead_candidates", env);
    return { mode: "crew", requiredCrewSize, crewStatus: "STAFFING_FAILED" };
  }
  await setCrewStatus(db, bookingId, "STAFFING");
  await emitCrewEvent(env, "crew_staffing_started", bookingId, {
    crew_size: requiredCrewSize,
    invitation_count: invited,
  });
  return { mode: "crew", requiredCrewSize, crewStatus: "STAFFING" };
}

/**
 * Kick (or resume) staffing dispatch for a booking that already has crew seats —
 * the manual "invite" action. Invites the LEAD wave while the lead is unfilled,
 * otherwise staffs the open member seats. No-op for solo/legacy bookings.
 */
export async function dispatchStaffing(
  db: Sql,
  bookingId: string,
  env?: CrewAnalyticsEnv,
): Promise<CrewStatus | null> {
  const booking = await loadBooking(db, bookingId);
  if (!booking || booking.required_crew_size == null) return null;
  const leadId = await currentLeadCleanerId(db, bookingId);
  const cfg = await loadCrewConfig(db);
  if (!leadId) {
    const invited = await inviteLeadWave(db, booking, cfg, env);
    if (invited === 0) {
      await failStaffing(db, bookingId, "no_lead_candidates", env);
      return "STAFFING_FAILED";
    }
    await setCrewStatus(db, bookingId, "STAFFING");
    await emitCrewEvent(env, "crew_staffing_started", bookingId, { invitation_count: invited });
  } else {
    await staffMemberSeats(db, bookingId, leadId, env);
  }
  return recomputeAndPersistCrewStatus(db, bookingId, env);
}

// ── Post-acceptance transitions ──────────────────────────────────────────────

/**
 * Called after a seat is ACCEPTED (from the route accept handler, once
 * crewAssignment.acceptSeat has claimed the row). Advances crew_status and, on
 * a LEAD accept, kicks off member staffing.
 */
export async function afterSeatAccepted(
  db: Sql,
  bookingId: string,
  acceptedSeat: CrewSeat,
  env?: CrewAnalyticsEnv,
): Promise<void> {
  if (acceptedSeat.role === "LEAD" && acceptedSeat.cleanerId) {
    await setCrewStatus(db, bookingId, "PARTIALLY_STAFFED");
    if (await isTeamFlagEnabled(db, "autoMatching")) {
      await staffMemberSeats(db, bookingId, acceptedSeat.cleanerId, env);
    }
  }
  await recomputeAndPersistCrewStatus(db, bookingId, env);
}

/**
 * Called after a seat invitation is DECLINED. If the current wave still has
 * outstanding invitees, we simply wait; if the whole wave declined, cascade to
 * the next batch immediately.
 */
export async function afterSeatDeclined(
  db: Sql,
  seatId: string,
  waveExhausted: boolean,
  env?: CrewAnalyticsEnv,
): Promise<void> {
  if (!waveExhausted) return;
  const cur = await getSeat(db, seatId);
  if (!cur) return;
  const booking = await loadBooking(db, cur.seat.bookingId);
  if (!booking) return;
  const cfg = await loadCrewConfig(db);
  // The whole wave declined — free the seat and cascade to the next candidates.
  await expireSeatInvitation(db, seatId);
  const seat = (await getSeat(db, seatId))?.seat;
  if (seat) await cascadeSeat(db, booking, seat, cfg, env);
  await recomputeAndPersistCrewStatus(db, booking.id, env);
}

/**
 * A confirmed crew member (or lead) drops after CONFIRMED. Move to AT_RISK and
 * open a replacement search for JUST that seat — the rest of the crew is
 * preserved. Never tears the whole crew down.
 */
export async function handleMemberDrop(
  db: Sql,
  seatId: string,
  departingStatus: "CANCELLED" | "NO_SHOW" | "REMOVED" = "CANCELLED",
  env?: CrewAnalyticsEnv,
): Promise<void> {
  const cur = await getSeat(db, seatId);
  if (!cur) return;
  const booking = await loadBooking(db, cur.seat.bookingId);
  if (!booking) return;
  const departingCleaner = cur.seat.cleanerId;
  const cfg = await loadCrewConfig(db);

  await setCrewStatus(db, booking.id, "AT_RISK");
  await emitCrewEvent(env, "crew_at_risk", booking.id, {
    seat_id: seatId,
    role: cur.seat.role,
    departing_status: departingStatus,
  });

  if (cur.seat.role === "LEAD") {
    // Release the booking compat pointer so a replacement lead can re-claim it.
    if (departingCleaner) {
      await db`
        UPDATE bookings SET cleaner_id = NULL, updated_at = NOW()
        WHERE id = ${booking.id} AND cleaner_id = ${departingCleaner}
      `;
    }
    await releaseSeatForReplacement(db, seatId, departingStatus);
    const fresh = await loadBooking(db, booking.id);
    if (fresh) await inviteLeadWave(db, fresh, cfg, env);
  } else {
    await releaseSeatForReplacement(db, seatId, departingStatus);
    const leadId = await currentLeadCleanerId(db, booking.id);
    const seat = (await getSeat(db, seatId))?.seat;
    if (leadId && seat) await cascadeSeat(db, booking, seat, cfg, env);
  }

  await emitCrewEvent(env, "crew_member_replaced", booking.id, {
    seat_id: seatId,
    role: cur.seat.role,
    departing_status: departingStatus,
    replacement_count: (cur.seat.crewAssignmentVersion ?? 1),
  });
  await notifyCustomerCrewChange(db, booking, "A crew member had to step off your booking; we are assigning a replacement.");
  logger.info("crew.member_drop", { bookingId: booking.id, seatId, departingStatus });
}

// ── Cascade / expiry ─────────────────────────────────────────────────────────

/**
 * Cron-compatible: expire timed-out crew invitations and cascade each freed
 * seat to its next candidate batch. Mirrors processExpiredOffers for the solo
 * queue. (Wire into the API cron alongside processExpiredOffers.)
 */
export async function expireStaleCrewInvitations(db: Sql, env?: CrewAnalyticsEnv): Promise<void> {
  const expired = (await db`
    SELECT id, booking_id
    FROM booking_crew_assignments
    WHERE status = 'INVITED' AND expires_at IS NOT NULL AND expires_at < NOW()
  `) as Array<{ id: string; booking_id: string }>;

  const cfg = await loadCrewConfig(db);
  for (const row of expired) {
    const seat = await expireSeatInvitation(db, row.id);
    if (!seat) continue;
    const booking = await loadBooking(db, row.booking_id);
    if (!booking) continue;
    await cascadeSeat(db, booking, seat, cfg, env);
    await recomputeAndPersistCrewStatus(db, booking.id, env);
  }
}

/**
 * Invite the next batch of candidates for an open seat, excluding everyone
 * already contacted on it (declined/expired waves) and everyone already seated
 * on the booking. If no fresh candidate remains, the seat cannot be filled →
 * STAFFING_FAILED (we do NOT shrink the crew).
 */
async function cascadeSeat(
  db: Sql,
  booking: CrewBookingRow,
  seat: CrewSeat,
  cfg: CrewConfig,
  env?: CrewAnalyticsEnv,
): Promise<void> {
  const fresh = await getSeat(db, seat.id);
  if (!fresh || (fresh.seat.status !== "CANDIDATE" && fresh.seat.status !== "INVITED")) return;

  const exclude = new Set<string>([
    ...(fresh.pool?.contacted ?? []),
    ...(fresh.pool?.declined ?? []),
    ...(await seatedCleanerIds(db, booking.id)),
  ]);

  let ranked: CrewCandidateScore[];
  if (seat.role === "LEAD") {
    ranked = await rankLeadCandidates(booking, db, { excludeCleanerIds: exclude });
  } else {
    const leadId = await currentLeadCleanerId(db, booking.id);
    if (!leadId) return; // members can't be staffed before a lead exists
    ranked = await rankCrewCandidates(booking, leadId, 1, db, { excludeCleanerIds: exclude });
  }

  const batch = ranked.slice(0, cfg.parallelInvitationCount).map(toInvite);
  if (batch.length === 0) {
    await failStaffing(db, booking.id, `seat_${seat.seatIndex}_exhausted`, env);
    return;
  }
  await inviteCandidatesToSeat(db, seat.id, batch, cfg.crewInvitationTtlMinutes, booking, env);
}

// ── Dispatch helpers ─────────────────────────────────────────────────────────

/** Invite the top LEAD candidates onto the lead seat. Returns invited count. */
async function inviteLeadWave(
  db: Sql,
  booking: CrewBookingRow,
  cfg: CrewConfig,
  env?: CrewAnalyticsEnv,
): Promise<number> {
  const seats = await getCrewSeats(db, booking.id);
  const leadSeat = seats.find((s) => s.role === "LEAD" && (s.status === "CANDIDATE" || s.status === "INVITED"));
  if (!leadSeat) return 0;
  const exclude = new Set<string>([
    ...(await seatedCleanerIds(db, booking.id)),
    ...((await getSeat(db, leadSeat.id))?.pool?.contacted ?? []),
  ]);
  const ranked = await rankLeadCandidates(booking, db, { excludeCleanerIds: exclude });
  const batch = ranked.slice(0, cfg.parallelInvitationCount).map(toInvite);
  const invited = await inviteCandidatesToSeat(db, leadSeat.id, batch, cfg.crewInvitationTtlMinutes, booking, env);
  return invited.length;
}

/**
 * Staff every open MEMBER seat in parallel: rank crew candidates ONCE relative
 * to the accepted lead, then give each open seat a DISJOINT wave of the top-N
 * (so one cleaner is never invited to two open seats at once).
 */
export async function staffMemberSeats(
  db: Sql,
  bookingId: string,
  leadCleanerId: string,
  env?: CrewAnalyticsEnv,
): Promise<void> {
  const booking = await loadBooking(db, bookingId);
  if (!booking) return;
  const cfg = await loadCrewConfig(db);
  const seats = await getCrewSeats(db, bookingId);
  const openMembers = seats.filter((s) => s.role === "MEMBER" && s.status === "CANDIDATE");
  if (openMembers.length === 0) {
    await recomputeAndPersistCrewStatus(db, bookingId, env);
    return;
  }

  const exclude = new Set<string>(await seatedCleanerIds(db, bookingId));
  exclude.add(leadCleanerId);
  const ranked = await rankCrewCandidates(booking, leadCleanerId, openMembers.length, db, {
    excludeCleanerIds: exclude,
  });

  let idx = 0;
  let anyInvited = false;
  const perSeat = cfg.parallelInvitationCount;
  for (const seat of openMembers) {
    const batch = ranked.slice(idx, idx + perSeat).map(toInvite);
    idx += perSeat;
    if (batch.length === 0) continue;
    const invited = await inviteCandidatesToSeat(db, seat.id, batch, cfg.crewInvitationTtlMinutes, booking, env);
    if (invited.length > 0) anyInvited = true;
  }

  if (!anyInvited) {
    // No candidates at all for any member seat.
    await failStaffing(db, bookingId, "no_member_candidates", env);
    return;
  }
  await recomputeAndPersistCrewStatus(db, bookingId, env);
}

// ── Status derivation ────────────────────────────────────────────────────────

/**
 * Derive crew_status from the current seat rows and persist it. CONFIRMED once
 * every required seat is ACCEPTED. Terminal/failure states are not overwritten
 * here except the natural AT_RISK→CONFIRMED recovery when the crew is whole again.
 */
export async function recomputeAndPersistCrewStatus(
  db: Sql,
  bookingId: string,
  env?: CrewAnalyticsEnv,
): Promise<CrewStatus | null> {
  const booking = await loadBooking(db, bookingId);
  if (!booking || booking.required_crew_size == null) return booking?.crew_status ?? null;

  // STAFFING_FAILED is sticky until an admin acts; don't auto-clear it here.
  if (booking.crew_status === "STAFFING_FAILED") return "STAFFING_FAILED";

  const seats = await getCrewSeats(db, bookingId);
  const accepted = seats.filter((s) => s.status === "ACCEPTED" || s.status === "COMPLETED");
  const leadAccepted = accepted.some((s) => s.role === "LEAD");
  const invitedOut = seats.some((s) => s.status === "INVITED");
  const required = booking.required_crew_size;

  let next: CrewStatus;
  if (accepted.length >= required && leadAccepted) {
    next = "CONFIRMED";
  } else if (leadAccepted) {
    next = "PARTIALLY_STAFFED";
  } else if (invitedOut) {
    next = "STAFFING";
  } else {
    next = "NEEDS_STAFFING";
  }

  if (next !== booking.crew_status) {
    await setCrewStatus(db, bookingId, next);
    if (next === "CONFIRMED") {
      await emitCrewEvent(env, "crew_confirmed", bookingId, {
        crew_size: required,
        person_minutes: accepted.reduce((sum, s) => sum + (s.personMinutes ?? 0), 0) || null,
      });
      await notifyCustomerCrewChange(db, booking, "Your full cleaning crew is confirmed.");
    }
  }
  return next;
}

async function failStaffing(
  db: Sql,
  bookingId: string,
  reason: string,
  env?: CrewAnalyticsEnv,
): Promise<void> {
  await setCrewStatus(db, bookingId, "STAFFING_FAILED");
  await emitCrewEvent(env, "crew_staffing_failed", bookingId, { reason });
  logger.warn("crew.staffing_failed", { bookingId, reason });
  const admins = (await db`SELECT id FROM users WHERE role = 'admin'`) as Array<{ id: string }>;
  for (const a of admins) {
    await sendNotification(db, a.id, {
      type: "team_staffing_failed",
      title: "Team clean needs manual staffing",
      body: `A crew seat could not be filled (${reason}) for booking ${bookingId}.`,
      data: { href: `/jobs/${bookingId}`, reason },
    });
  }
}

// ── Small DB helpers ─────────────────────────────────────────────────────────

async function setCrewStatus(db: Sql, bookingId: string, status: CrewStatus): Promise<void> {
  await db`UPDATE bookings SET crew_status = ${status}, updated_at = NOW() WHERE id = ${bookingId}`;
}

async function loadBooking(db: Sql, bookingId: string): Promise<CrewBookingRow | null> {
  const rows = (await db`SELECT * FROM bookings WHERE id = ${bookingId} LIMIT 1`) as CrewBookingRow[];
  return rows[0] ?? null;
}

async function seatedCleanerIds(db: Sql, bookingId: string): Promise<string[]> {
  const rows = (await db`
    SELECT cleaner_id FROM booking_crew_assignments
    WHERE booking_id = ${bookingId} AND cleaner_id IS NOT NULL
      AND status IN ('INVITED', 'ACCEPTED', 'COMPLETED')
  `) as Array<{ cleaner_id: string | null }>;
  return rows.map((r) => r.cleaner_id).filter((x): x is string => x != null);
}

async function currentLeadCleanerId(db: Sql, bookingId: string): Promise<string | null> {
  const rows = (await db`
    SELECT cleaner_id FROM booking_crew_assignments
    WHERE booking_id = ${bookingId} AND role = 'LEAD'
      AND status IN ('ACCEPTED', 'COMPLETED') AND cleaner_id IS NOT NULL
    LIMIT 1
  `) as Array<{ cleaner_id: string }>;
  return rows[0]?.cleaner_id ?? null;
}

async function loadPersonMinutes(
  db: Sql,
  booking: CrewBookingRow,
): Promise<{ personMinutes: number | null; productivityPermille?: Record<string, number> }> {
  let rows: Array<{ expected_labor_minutes?: number | string | null; config?: unknown }> = [];
  if (booking.pricing_quote_v2_id) {
    rows = (await db`
      SELECT q.expected_labor_minutes, v.config
      FROM pricing_quotes_v2 q
      JOIN pricing_versions v ON v.id = q.pricing_version_id
      WHERE q.id = ${booking.pricing_quote_v2_id} LIMIT 1
    `) as typeof rows;
  } else if (booking.pricing_version_id) {
    rows = (await db`
      SELECT config FROM pricing_versions WHERE id = ${booking.pricing_version_id} LIMIT 1
    `) as typeof rows;
  }
  const r = rows[0];
  const personMinutes =
    r?.expected_labor_minutes != null && Number.isFinite(Number(r.expected_labor_minutes))
      ? Number(r.expected_labor_minutes)
      : null;
  let productivityPermille: Record<string, number> | undefined;
  try {
    const cfg = r?.config
      ? ((typeof r.config === "string" ? JSON.parse(r.config) : r.config) as Record<string, unknown>)
      : null;
    const scheduling = cfg?.scheduling as Record<string, unknown> | undefined;
    const table = scheduling?.teamProductivityPermille as Record<string, number> | undefined;
    if (table && typeof table === "object") productivityPermille = table;
  } catch {
    /* leave undefined → sizing uses its default productivity curve */
  }
  return { personMinutes, productivityPermille };
}

function buildSeatSpecs(size: number, personMinutes: number | null, cfg: CrewConfig): SeatSpec[] {
  const share = personMinutes != null ? Math.round(personMinutes / size) : null;
  const specs: SeatSpec[] = [];
  for (let i = 0; i < size; i++) {
    specs.push({
      role: i === 0 ? "LEAD" : "MEMBER",
      seatIndex: i,
      personMinutes: share == null ? null : i === 0 ? share + cfg.leadOverheadMinutes : share,
    });
  }
  return specs;
}

function toInvite(c: CrewCandidateScore): CandidateInvite {
  return { cleanerId: c.cleanerId, score: c.score, breakdown: c.breakdown };
}

async function notifyCustomerCrewChange(db: Sql, booking: CrewBookingRow, body: string): Promise<void> {
  if (!booking.customer_id) return;
  const rows = (await db`
    SELECT u.id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ${booking.customer_id}
  `) as Array<{ id: string }>;
  if (rows[0]) {
    await sendNotification(db, rows[0].id, {
      type: "team_crew_update",
      title: "Team clean update",
      body,
      data: { href: `/bookings/${booking.id}` },
    });
  }
}
