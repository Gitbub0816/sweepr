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
 * Team Cleans client helpers (cleaner app).
 *
 * Everything here degrades to "solo": a booking whose crew_status is null has no
 * crew, so fetchCrewRoster returns null and every caller falls back to the exact
 * single-cleaner UI. We never invent endpoints — these call only the documented
 * crew contracts in apps/api (routes/crew.ts, routes/dayOfService.ts,
 * routes/crewTasks.ts, routes/reviews.ts peer).
 */

export type CrewRole = "LEAD" | "MEMBER";

export type CrewSeatStatus =
  | "CANDIDATE"
  | "INVITED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "REMOVED"
  | "NO_SHOW"
  | "COMPLETED";

export interface CrewSeat {
  id: string;
  bookingId: string;
  cleanerId: string | null;
  role: CrewRole;
  seatIndex: number;
  status: CrewSeatStatus;
  personMinutes: number | null;
  assignmentScore: number | null;
  earningsCents: number;
  offeredAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  vouchedByAssignmentId: string | null;
  stripeTransferId: string | null;
  crewAssignmentVersion: number;
}

export interface CrewBookingMeta {
  id: string;
  crewStatus: string | null;
  requiredCrewSize: number | null;
  minCrewSize: number | null;
  targetCrewSize: number | null;
  crewAssignmentVersion: number | null;
  extraCleanerRequested: boolean;
}

export interface CrewRoster {
  booking: CrewBookingMeta;
  seats: CrewSeat[];
}

type Fetcher = (path: string, opts?: RequestInit) => Promise<Response>;

/**
 * Load a booking's crew roster. Returns null for solo/legacy bookings
 * (crew_status null), when the feature is off, or on any error — every caller
 * then renders the existing single-cleaner UI unchanged.
 */
export async function fetchCrewRoster(authFetch: Fetcher, bookingId: string): Promise<CrewRoster | null> {
  try {
    const res = await authFetch(`/bookings/${bookingId}/crew`);
    if (!res.ok) return null;
    const data = (await res.json()) as CrewRoster;
    if (!data?.booking || data.booking.crewStatus == null) return null;
    return data;
  } catch {
    return null;
  }
}

/** How many seats the crew is targeting (falls back to the seat count). */
export function crewSize(roster: CrewRoster): number {
  const b = roster.booking;
  const active = roster.seats.filter(
    (s) => s.status !== "REMOVED" && s.status !== "CANCELLED" && s.status !== "NO_SHOW",
  ).length;
  return b.requiredCrewSize ?? b.targetCrewSize ?? Math.max(active, roster.seats.length, 1);
}

/** Total person-minutes across the crew's seats (0 when none are estimated). */
export function totalPersonMinutes(seats: CrewSeat[]): number {
  return seats.reduce((sum, s) => sum + (s.personMinutes ?? 0), 0);
}

/**
 * Rough on-site (elapsed) estimate for the crew: person-minutes shared across
 * the crew size. Naive parallelism, so it is only ever shown as an estimate.
 * Returns null when there is no labor estimate (legacy / v2-dark bookings).
 */
export function estimatedElapsedMinutes(roster: CrewRoster): number | null {
  const total = totalPersonMinutes(roster.seats);
  if (total <= 0) return null;
  const size = Math.max(crewSize(roster), 1);
  return Math.round(total / size);
}

/**
 * A seat's estimated share of the payout pool, in cents. Uses the seat's
 * person-minutes share when available, otherwise an equal split. Always a
 * display-only estimate — real earnings are computed server-side at payout.
 */
export function estimatedSeatEarningsCents(
  seat: CrewSeat | null,
  roster: CrewRoster,
  poolCents: number,
): number | null {
  if (poolCents <= 0) return null;
  if (seat?.earningsCents && seat.earningsCents > 0) return seat.earningsCents;
  const total = totalPersonMinutes(roster.seats);
  if (seat && seat.personMinutes != null && total > 0) {
    return Math.round((poolCents * seat.personMinutes) / total);
  }
  const size = Math.max(crewSize(roster), 1);
  return Math.round(poolCents / size);
}

/** The single open position a cleaner is being offered, if any. */
export function openInvitedSeat(roster: CrewRoster): CrewSeat | null {
  return roster.seats.find((s) => s.status === "INVITED" && s.cleanerId == null) ?? null;
}

/** Seats that count as active crew for day-of display (accepted/present/done). */
export function presentableSeats(roster: CrewRoster): CrewSeat[] {
  return roster.seats
    .filter((s) => s.status === "ACCEPTED" || s.status === "COMPLETED" || s.status === "NO_SHOW")
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

export interface MySeat {
  assignmentId: string;
  cleanerId: string | null;
  role: CrewRole | null;
  seat: CrewSeat | null;
}

/**
 * Resolve the signed-in cleaner's own seat on a crew booking via the vouch-PIN
 * endpoint (the only contract that returns "my" assignment id). The PIN is a
 * stateless, time-boxed value; asking for it has no side effects. Returns null
 * when the caller is not on this crew.
 */
export async function fetchMySeat(
  authFetch: Fetcher,
  bookingId: string,
  roster: CrewRoster,
): Promise<MySeat | null> {
  try {
    const res = await authFetch(`/jobs/bookings/${bookingId}/crew/pin`, { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { assignment_id?: string };
    if (!data.assignment_id) return null;
    const seat = roster.seats.find((s) => s.id === data.assignment_id) ?? null;
    return {
      assignmentId: data.assignment_id,
      cleanerId: seat?.cleanerId ?? null,
      role: seat?.role ?? null,
      seat,
    };
  } catch {
    return null;
  }
}
