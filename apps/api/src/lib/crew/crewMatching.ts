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
 * Crew matching — multi-cleaner ranking that REUSES (never replaces) the solo
 * engine (lib/matching.ts). The base score from `rankCleanersForBooking` (a
 * fair, weighted, hard-filtered per-cleaner score) is the foundation; crew
 * matching layers explainable, additive crew terms on top:
 *
 *   LEAD candidates  → HISTORICAL PERFORMANCE FIRST (completed-job volume,
 *                      rating average, reliability/no-show record — see the
 *                      exact formula on rankLeadCandidates), plus customer
 *                      continuity.
 *   CREW candidates  → availability-overlap, distance, reliability,
 *                      qualification, prior-pairing (crew_peer_ratings),
 *                      preferred-teammate (mutual cleaner_relationships),
 *                      team-compatibility with the accepted LEAD.
 *
 * Every candidate carries a full `breakdown` so admins can see WHY a cleaner
 * ranked where they did (mirrors assignment_queue.score_breakdown). The base
 * engine already applies the HARD filters (service offering + service area) and
 * the eligibility/conflict gate (schedule + double-booking, widened for crews),
 * so crew terms only reorder survivors — they never smuggle in an ineligible or
 * out-of-area cleaner.
 */

import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import {
  rankCleanersForBooking,
  eligibleCleanersForBooking,
  type MatchScore,
} from "../matching";

// ── Crew-term weights ────────────────────────────────────────────────────────
// LEAD selection is driven PRIMARILY by historical performance (owner
// decision): the three performance terms' ceiling (60+50+40 = 150) exceeds the
// solo base ceiling (MAX_MATCH_SCORE = 90), so a cleaner's track record —
// completed-job volume, customer-rating average, and reliability (no-show /
// cancel record) — dominates the ordering. The base score (schedule fit,
// distance, fairness, …) remains the eligibility-gated secondary signal, and
// the hard filters (service offering, area, schedule/conflict, job-type
// preferences) still remove ineligible cleaners before any scoring.
const LEAD_WEIGHTS = {
  jobVolume: 60, // completed-job count (cleaners.total_jobs), saturates at 25 jobs
  ratingAvg: 50, // customer rating average (cleaners.rating / 5; 0.6 neutral unrated)
  reliability: 40, // completed vs cancelled/no-show record (bookings + crew seats)
  continuity: 10, // has led good jobs for THIS customer before
} as const;

const CREW_WEIGHTS = {
  availabilityOverlap: 10, // schedule tightly covers the booking window
  distance: 12, // near the job within their own radius
  reliability: 15,
  qualification: 10, // offers the service type + has real job volume
  priorPairing: 14, // peer thumbs-up with the LEAD (thumbs-down sinks them)
  preferredTeammate: 18, // mutual PREFERRED_TEAMMATE bond with the LEAD
  teamCompatibility: 8, // avoid pairing two green cleaners with no anchor
} as const;

/** Explainable score: `base` from the solo engine + each named crew term. */
export interface CrewScoreBreakdown {
  base: number;
  [term: string]: number;
}

export interface CrewCandidateScore {
  cleanerId: string;
  /** base + sum of crew terms. */
  score: number;
  baseScore: number;
  breakdown: CrewScoreBreakdown;
}

export interface CrewMatchOptions {
  /** Cleaners never to consider (already seated, the LEAD, prior contacted). */
  excludeCleanerIds?: Iterable<string>;
  /** Override the candidate pool (defaults to all approved/active cleaners). */
  candidatePool?: CleanerRow[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Load the default candidate pool: every approved/active cleaner. */
async function loadCandidatePool(db: Sql): Promise<CleanerRow[]> {
  return (await db`
    SELECT * FROM cleaners WHERE status IN ('approved', 'active')
  `) as CleanerRow[];
}

/**
 * Run the solo engine to produce the eligibility-gated, hard-filtered base
 * ranking. Returns the surviving cleaners plus a map of cleanerId → base score.
 */
async function baseRanking(
  booking: BookingRow,
  pool: CleanerRow[],
  db: Sql,
): Promise<{ survivors: CleanerRow[]; base: Map<string, MatchScore> }> {
  const eligible = await eligibleCleanersForBooking(booking, pool, db);
  const ranked = await rankCleanersForBooking(booking, eligible, db);
  const base = new Map(ranked.map((r) => [r.cleanerId, r]));
  const survivors = eligible.filter((c) => base.has(c.id));
  return { survivors, base };
}

/**
 * Reliability signal from crew history: seats that went well (ACCEPTED /
 * COMPLETED) vs seats that fell through (NO_SHOW / CANCELLED / REMOVED). New
 * cleaners with no crew history default to a healthy 0.9.
 */
async function reliabilityByCleaner(
  db: Sql,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  if (cleanerIds.length === 0) return new Map();
  const rows = (await db`
    SELECT cleaner_id,
           COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))::int AS good,
           COUNT(*) FILTER (WHERE status IN ('NO_SHOW', 'CANCELLED', 'REMOVED'))::int AS bad
    FROM booking_crew_assignments
    WHERE cleaner_id = ANY(${cleanerIds})
    GROUP BY cleaner_id
  `) as Array<{ cleaner_id: string; good: number; bad: number }>;
  const out = new Map<string, number>();
  for (const r of rows) {
    const total = r.good + r.bad;
    out.set(r.cleaner_id, total === 0 ? 0.9 : r.good / total);
  }
  return out;
}

/**
 * LEAD reliability: the schema's full no-show/cancel record for a cleaner,
 * combining
 *   - booking-level history as the cleaner-of-record: `completed` bookings
 *     count good, `cancelled_by_cleaner` count bad (covers solo bookings,
 *     which have no crew seats after migration 101's one-time backfill);
 *   - MEMBER crew-seat history: ACCEPTED/COMPLETED good, NO_SHOW/CANCELLED/
 *     REMOVED bad (LEAD seats are excluded — the booking row above already
 *     represents that job, so nothing is double-counted).
 * reliability = good / (good + bad); 0.9 default with no history at all.
 */
async function leadReliabilityByCleaner(
  db: Sql,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  if (cleanerIds.length === 0) return new Map();
  const [bookingRaw, seatRaw] = await Promise.all([
    db`
      SELECT cleaner_id,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS good,
             COUNT(*) FILTER (WHERE status = 'cancelled_by_cleaner')::int AS bad
      FROM bookings
      WHERE cleaner_id = ANY(${cleanerIds})
      GROUP BY cleaner_id
    `,
    db`
      SELECT cleaner_id,
             COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'COMPLETED'))::int AS good,
             COUNT(*) FILTER (WHERE status IN ('NO_SHOW', 'CANCELLED', 'REMOVED'))::int AS bad
      FROM booking_crew_assignments
      WHERE cleaner_id = ANY(${cleanerIds}) AND role = 'MEMBER'
      GROUP BY cleaner_id
    `,
  ]);
  const bookingRows = bookingRaw as unknown as Array<{ cleaner_id: string; good: number; bad: number }>;
  const seatRows = seatRaw as unknown as Array<{ cleaner_id: string; good: number; bad: number }>;
  const good = new Map<string, number>();
  const bad = new Map<string, number>();
  for (const r of [...bookingRows, ...seatRows]) {
    good.set(r.cleaner_id, (good.get(r.cleaner_id) ?? 0) + r.good);
    bad.set(r.cleaner_id, (bad.get(r.cleaner_id) ?? 0) + r.bad);
  }
  const out = new Map<string, number>();
  for (const id of new Set([...good.keys(), ...bad.keys()])) {
    const g = good.get(id) ?? 0;
    const b = bad.get(id) ?? 0;
    const total = g + b;
    out.set(id, total === 0 ? 0.9 : g / total);
  }
  return out;
}

// ── LEAD ranking ─────────────────────────────────────────────────────────────

/**
 * Rank candidates to be the LEAD (cleaner-of-record) for a booking.
 *
 * HISTORICAL PERFORMANCE IS THE PRIMARY CRITERION (owner decision). The exact
 * formula, using only what the schema already tracks:
 *
 *   jobVolume   = min(cleaners.total_jobs / 25, 1)          → × 60 pts
 *   ratingAvg   = cleaners.rating / 5   (0.6 when unrated)  → × 50 pts
 *   reliability = good / (good + bad)   (0.9 no history)    → × 40 pts
 *                 good = completed bookings as cleaner-of-record
 *                        + ACCEPTED/COMPLETED MEMBER crew seats
 *                 bad  = cancelled_by_cleaner bookings
 *                        + NO_SHOW/CANCELLED/REMOVED MEMBER crew seats
 *   continuity  = min(completed LEAD jobs for THIS customer / 3, 1) → × 10 pts
 *
 *   leadScore = 60·jobVolume + 50·ratingAvg + 40·reliability
 *             + 10·continuity + baseScore
 *
 * The performance ceiling (150) exceeds the solo base ceiling (90), so track
 * record dominates; the base score (schedule fit, distance, fairness, …) only
 * orders cleaners with similar records. All hard filters and the eligibility/
 * conflict gate still apply via the base ranking, and the staffing layer
 * re-validates account/vetting/insurance at acceptance.
 */
export async function rankLeadCandidates(
  booking: BookingRow,
  db: Sql,
  options: CrewMatchOptions = {},
): Promise<CrewCandidateScore[]> {
  const exclude = new Set(options.excludeCleanerIds ?? []);
  const pool = (options.candidatePool ?? (await loadCandidatePool(db))).filter(
    (c) => !exclude.has(c.id),
  );
  const { survivors, base } = await baseRanking(booking, pool, db);
  if (survivors.length === 0) return [];

  const ids = survivors.map((c) => c.id);
  const [reliability, continuity] = await Promise.all([
    leadReliabilityByCleaner(db, ids),
    leadContinuityByCleaner(db, booking.customer_id, ids),
  ]);

  const scored: CrewCandidateScore[] = survivors.map((cleaner) => {
    const b = base.get(cleaner.id)!;
    const baseScore = b.score;

    // Completed-job volume: saturates at 25 completed jobs.
    const jobVolumeFactor = clamp01((cleaner.total_jobs ?? 0) / 25);
    const jobVolume = jobVolumeFactor * LEAD_WEIGHTS.jobVolume;

    // Customer-rating average: neutral 0.6 for a not-yet-rated cleaner so new
    // cleaners are neither punished nor handed the lead over proven ones.
    const ratingFactor =
      cleaner.rating != null ? clamp01(Number(cleaner.rating) / 5) : 0.6;
    const ratingAvg = ratingFactor * LEAD_WEIGHTS.ratingAvg;

    // Reliability: the combined no-show/cancel record (see leadReliabilityByCleaner).
    const relFactor = reliability.get(cleaner.id) ?? 0.9;
    const reliabilityPts = relFactor * LEAD_WEIGHTS.reliability;

    const contFactor = continuity.get(cleaner.id) ?? 0;
    const continuityPts = clamp01(contFactor) * LEAD_WEIGHTS.continuity;

    const breakdown: CrewScoreBreakdown = {
      base: round2(baseScore),
      jobVolume: round2(jobVolume),
      ratingAvg: round2(ratingAvg),
      reliability: round2(reliabilityPts),
      continuity: round2(continuityPts),
    };
    const score = round2(
      baseScore + jobVolume + ratingAvg + reliabilityPts + continuityPts,
    );
    return { cleanerId: cleaner.id, score, baseScore: round2(baseScore), breakdown };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/** Prior completed LEAD jobs for THIS customer → a 0..1 continuity factor. */
async function leadContinuityByCleaner(
  db: Sql,
  customerId: string | null,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!customerId || cleanerIds.length === 0) return out;
  const rows = (await db`
    SELECT bca.cleaner_id, COUNT(*)::int AS jobs
    FROM booking_crew_assignments bca
    JOIN bookings b ON b.id = bca.booking_id
    WHERE bca.role = 'LEAD'
      AND bca.status = 'COMPLETED'
      AND bca.cleaner_id = ANY(${cleanerIds})
      AND b.customer_id = ${customerId}
    GROUP BY bca.cleaner_id
  `) as Array<{ cleaner_id: string; jobs: number }>;
  for (const r of rows) out.set(r.cleaner_id, clamp01(r.jobs / 3));
  return out;
}

// ── CREW (member) ranking ────────────────────────────────────────────────────

/**
 * Rank candidates for the MEMBER (helper) seats of a booking whose LEAD has
 * already accepted. Adds crew-fit terms relative to that LEAD on top of the
 * base score. The accepted LEAD (and any already-seated / previously-contacted
 * cleaners, via options.excludeCleanerIds) are removed from the pool.
 *
 * `remainingSeats` is advisory (how many open MEMBER seats remain); the full
 * ranked list is returned and the staffing layer decides how deep to invite.
 */
export async function rankCrewCandidates(
  booking: BookingRow,
  acceptedLeadCleanerId: string,
  remainingSeats: number,
  db: Sql,
  options: CrewMatchOptions = {},
): Promise<CrewCandidateScore[]> {
  const exclude = new Set(options.excludeCleanerIds ?? []);
  exclude.add(acceptedLeadCleanerId);
  const pool = (options.candidatePool ?? (await loadCandidatePool(db))).filter(
    (c) => !exclude.has(c.id),
  );
  const { survivors, base } = await baseRanking(booking, pool, db);
  if (survivors.length === 0 || remainingSeats <= 0) return [];

  const ids = survivors.map((c) => c.id);
  const [reliability, peer, preferred, lead] = await Promise.all([
    reliabilityByCleaner(db, ids),
    peerRatingWithLead(db, acceptedLeadCleanerId, ids),
    preferredTeammateWithLead(db, acceptedLeadCleanerId, ids),
    loadCleaner(db, acceptedLeadCleanerId),
  ]);
  const leadExperience = clamp01((lead?.total_jobs ?? 0) / 20);

  const scored: CrewCandidateScore[] = survivors.map((cleaner) => {
    const b = base.get(cleaner.id)!;
    const baseScore = b.score;

    // availability-overlap & distance reuse the base sub-signals (schedule fit
    // and service-area closeness) as explicit, re-weighted crew emphases rather
    // than re-querying — same source of truth as the solo engine.
    const availabilityOverlap =
      clamp01(b.breakdown.availability / 12) * CREW_WEIGHTS.availabilityOverlap;
    const distance =
      clamp01(b.breakdown.serviceArea / 15) * CREW_WEIGHTS.distance;

    const relFactor = reliability.get(cleaner.id) ?? 0.9;
    const reliabilityPts = relFactor * CREW_WEIGHTS.reliability;

    // qualification: base already hard-filtered non-offerers; reward real job
    // volume (a proven helper) plus the base acceptance signal.
    const qualFactor = clamp01(
      0.6 * clamp01((cleaner.total_jobs ?? 0) / 20) +
        0.4 * clamp01(b.breakdown.acceptance / 15),
    );
    const qualification = qualFactor * CREW_WEIGHTS.qualification;

    // prior-pairing: peer thumbs between this candidate and the LEAD. A
    // thumbs-DOWN in either direction is a strong negative (they asked not to be
    // paired) — never a hard block, but enough to sink them below fresh pairings.
    const peerVal = peer.get(cleaner.id) ?? 0; // +1 up, -1 down, 0 none
    const priorPairing =
      peerVal > 0 ? CREW_WEIGHTS.priorPairing : peerVal < 0 ? -CREW_WEIGHTS.priorPairing * 2 : 0;

    // preferred-teammate: mutual (both-directions ACCEPTED) bond gets the full
    // bonus; a one-directional preference toward the candidate gets half.
    const prefVal = preferred.get(cleaner.id) ?? 0; // 2 mutual, 1 one-way, 0 none
    const preferredTeammate =
      prefVal >= 2
        ? CREW_WEIGHTS.preferredTeammate
        : prefVal === 1
          ? CREW_WEIGHTS.preferredTeammate * 0.5
          : 0;

    // team-compatibility: at least one anchor of experience on the pair. Two
    // brand-new cleaners together is the weakest crew; reward the max of the
    // two experience levels so a green helper alongside a seasoned LEAD is fine.
    const compatFactor = Math.max(
      leadExperience,
      clamp01((cleaner.total_jobs ?? 0) / 20),
    );
    const teamCompatibility = compatFactor * CREW_WEIGHTS.teamCompatibility;

    const breakdown: CrewScoreBreakdown = {
      base: round2(baseScore),
      availabilityOverlap: round2(availabilityOverlap),
      distance: round2(distance),
      reliability: round2(reliabilityPts),
      qualification: round2(qualification),
      priorPairing: round2(priorPairing),
      preferredTeammate: round2(preferredTeammate),
      teamCompatibility: round2(teamCompatibility),
    };
    const score = round2(
      baseScore +
        availabilityOverlap +
        distance +
        reliabilityPts +
        qualification +
        priorPairing +
        preferredTeammate +
        teamCompatibility,
    );
    return { cleanerId: cleaner.id, score, baseScore: round2(baseScore), breakdown };
  });

  return scored.sort((a, b) => b.score - a.score);
}

async function loadCleaner(db: Sql, cleanerId: string): Promise<CleanerRow | null> {
  const rows = (await db`SELECT * FROM cleaners WHERE id = ${cleanerId} LIMIT 1`) as CleanerRow[];
  return rows[0] ?? null;
}

/** Peer thumbs between the LEAD and each candidate: +1 up, -1 down, 0 none. */
async function peerRatingWithLead(
  db: Sql,
  leadId: string,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cleanerIds.length === 0) return out;
  const rows = (await db`
    SELECT rater_cleaner_id, ratee_cleaner_id, thumbs
    FROM crew_peer_ratings
    WHERE (rater_cleaner_id = ${leadId} AND ratee_cleaner_id = ANY(${cleanerIds}))
       OR (ratee_cleaner_id = ${leadId} AND rater_cleaner_id = ANY(${cleanerIds}))
  `) as Array<{ rater_cleaner_id: string; ratee_cleaner_id: string; thumbs: "up" | "down" }>;
  for (const r of rows) {
    const other = r.rater_cleaner_id === leadId ? r.ratee_cleaner_id : r.rater_cleaner_id;
    const delta = r.thumbs === "up" ? 1 : -1;
    // A single thumbs-down dominates (worst signal wins).
    const prev = out.get(other) ?? 0;
    out.set(other, delta < 0 ? -1 : Math.max(prev, delta));
  }
  return out;
}

/**
 * Preferred-teammate bond between the LEAD and each candidate:
 *   2 = mutual (an ACCEPTED PREFERRED_TEAMMATE row in BOTH directions),
 *   1 = one-directional (only one accepted side),
 *   0 = none.
 */
async function preferredTeammateWithLead(
  db: Sql,
  leadId: string,
  cleanerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cleanerIds.length === 0) return out;
  const rows = (await db`
    SELECT cleaner_id, other_cleaner_id
    FROM cleaner_relationships
    WHERE relationship = 'PREFERRED_TEAMMATE'
      AND status = 'ACCEPTED'
      AND ((cleaner_id = ${leadId} AND other_cleaner_id = ANY(${cleanerIds}))
        OR (other_cleaner_id = ${leadId} AND cleaner_id = ANY(${cleanerIds})))
  `) as Array<{ cleaner_id: string; other_cleaner_id: string }>;
  const leadToOther = new Set<string>();
  const otherToLead = new Set<string>();
  for (const r of rows) {
    if (r.cleaner_id === leadId) leadToOther.add(r.other_cleaner_id);
    if (r.other_cleaner_id === leadId) otherToLead.add(r.cleaner_id);
  }
  for (const id of cleanerIds) {
    const a = leadToOther.has(id);
    const b = otherToLead.has(id);
    out.set(id, a && b ? 2 : a || b ? 1 : 0);
  }
  return out;
}
