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
 * Team Cleans domain types. A booking has zero-or-more crew SEATS: exactly one
 * LEAD (the cleaner responsible to Sweepr and the customer) plus N MEMBER seats
 * (helpers). Solo bookings are the degenerate crew of one LEAD. See
 * docs/team-cleans-audit.md and docs/team-cleans.md.
 */

export type CrewRole = "LEAD" | "MEMBER";

export type CrewSeatStatus =
  | "CANDIDATE" // open seat being staffed (cleaner_id NULL)
  | "INVITED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "REMOVED"
  | "NO_SHOW"
  | "COMPLETED";

/** Orthogonal to bookings.status (like day_status). NULL = solo/legacy booking. */
export type CrewStatus =
  | "NEEDS_STAFFING"
  | "STAFFING"
  | "PARTIALLY_STAFFED"
  | "CONFIRMED"
  | "AT_RISK"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "STAFFING_FAILED";

/** A single crew seat (row of booking_crew_assignments). */
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

/** Reason codes explaining why a crew size was chosen (admin-visible). */
export type CrewSizeReasonCode =
  | "LOW_TOTAL_LABOR" // small job, one cleaner
  | "HIGH_TOTAL_LABOR"
  | "MULTIPLE_HIGH_INTENSITY_ROOMS"
  | "LONG_SOLO_DURATION" // a solo shift would exceed the max
  | "CUSTOMER_COMPLETION_WINDOW"
  | "CUSTOMER_EXTRA_CLEANER" // customer bought one extra cleaner
  | "DIMINISHING_RETURNS" // an extra cleaner would not meaningfully help
  | "MIN_USEFUL_WORK_LIMIT" // capped so each cleaner has meaningful work
  | "NO_LABOR_ESTIMATE"; // no v2 person-minutes; sizing deferred/solo

export interface CrewSizePlan {
  /** Total human cleaning labor the booking requires. */
  estimatedPersonMinutes: number | null;
  /** How many seats Sweepr will try to fill. */
  recommendedCrewSize: number;
  /** Below this the job cannot reasonably run. */
  minCrewSize: number;
  /** Adding beyond this gives each cleaner too little useful work. */
  maxUsefulCrewSize: number;
  /** Elapsed on-site minutes for the recommended size. */
  estimatedElapsedMinutes: number | null;
  /** Elapsed minutes keyed by candidate crew size (for admin comparison). */
  elapsedBySize: Record<number, number>;
  reasonCodes: CrewSizeReasonCode[];
  /** 0..1 — lower near band boundaries or without a labor estimate. */
  confidence: number;
}
