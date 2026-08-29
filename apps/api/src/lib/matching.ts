/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import { haversineDistance } from "./haversine";

interface ScheduleRow {
  cleaner_id: string;
  slot_type: "recurring" | "flexible" | "available_now";
  day_of_week: number | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  specific_date: string | null; // "YYYY-MM-DD"
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

/**
 * Determine whether a cleaner is schedule-available for a booking time.
 *
 * A cleaner is "available" if:
 *  1. They have a 'recurring' slot matching day_of_week with a time overlap, OR
 *  2. They have a 'flexible' slot on the specific date with a time overlap, OR
 *  3. They have 'available_now' AND the booking is within 2 hours of now.
 */
export function isScheduleAvailable(
  slots: ScheduleRow[],
  scheduledAt: Date,
  now: Date = new Date()
): boolean {
  const dayOfWeek = scheduledAt.getUTCDay();
  const minuteOfDay =
    scheduledAt.getUTCHours() * 60 + scheduledAt.getUTCMinutes();
  const dateStr = scheduledAt.toISOString().slice(0, 10);

  for (const s of slots) {
    if (s.slot_type === "available_now") {
      const diffMs = scheduledAt.getTime() - now.getTime();
      if (diffMs <= 2 * 60 * 60 * 1000) return true;
      continue;
    }

    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    const overlaps =
      start != null && end != null && minuteOfDay >= start && minuteOfDay <= end;

    if (s.slot_type === "recurring" && s.day_of_week === dayOfWeek && overlaps) {
      return true;
    }
    if (
      s.slot_type === "flexible" &&
      s.specific_date?.slice(0, 10) === dateStr &&
      overlaps
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Return cleaners who are eligible for a booking: schedule-available AND with
 * no accepted/in-progress booking within 3 hours of the requested time.
 */
export async function eligibleCleanersForBooking(
  booking: BookingRow,
  candidates: CleanerRow[],
  db: Sql
): Promise<CleanerRow[]> {
  if (candidates.length === 0 || !booking.scheduled_at) return [];
  const scheduledAt = new Date(booking.scheduled_at);
  const cleanerIds = candidates.map((c) => c.id);

  // Unified availability read model (lib/availability.ts): weekly blocks from
  // cleaner_availability + flexible/available_now from cleaner_schedule, minus
  // cleaners who explicitly blocked this booking's date.
  const { getMergedSlots, getBlockedCleaners } = await import("./availability");
  const dateStr = scheduledAt.toISOString().slice(0, 10);
  const [mergedSlots, blocked, conflictRaw] = await Promise.all([
    getMergedSlots(db, cleanerIds),
    getBlockedCleaners(db, dateStr, cleanerIds),
    db`
      SELECT DISTINCT cleaner_id FROM (
        -- Solo assignment (unchanged): a cleaner who is the booking-level cleaner
        -- (the LEAD, via bookings.cleaner_id) on a live job in the window.
        SELECT cleaner_id, scheduled_at
        FROM bookings
        WHERE cleaner_id = ANY(${cleanerIds})
          AND status IN ('cleaner_accepted', 'confirmed', 'cleaner_on_the_way',
                         'arrived', 'in_progress')
          AND scheduled_at IS NOT NULL
        UNION ALL
        -- Team Cleans: a cleaner holding an ACCEPTED crew SEAT on ANOTHER booking
        -- is just as unavailable, even when they are a non-LEAD member that
        -- bookings.cleaner_id never surfaces. Solo behavior is unchanged: a solo
        -- job's backfilled LEAD seat mirrors the same cleaner the first branch
        -- already excludes, so the deduped set is identical for solo cleaners.
        SELECT bca.cleaner_id, b2.scheduled_at
        FROM booking_crew_assignments bca
        JOIN bookings b2 ON b2.id = bca.booking_id
        WHERE bca.cleaner_id = ANY(${cleanerIds})
          AND bca.status = 'ACCEPTED'
          AND b2.scheduled_at IS NOT NULL
      ) conflicts
      WHERE ABS(EXTRACT(EPOCH FROM (scheduled_at - ${booking.scheduled_at}::timestamptz))) < 10800
    `,
  ]);

  const scheduleRows = mergedSlots as unknown as ScheduleRow[];
  const conflicts = new Set(
    (conflictRaw as unknown as { cleaner_id: string }[]).map((r) => r.cleaner_id)
  );

  const byCleaner = new Map<string, ScheduleRow[]>();
  for (const r of scheduleRows) {
    const list = byCleaner.get(r.cleaner_id) ?? [];
    list.push(r);
    byCleaner.set(r.cleaner_id, list);
  }

  return candidates.filter((c) => {
    if (conflicts.has(c.id)) return false;
    if (blocked.has(c.id)) return false;
    const schedule = byCleaner.get(c.id);
    // Soft schedule gate: a cleaner who hasn't configured any cleaner_schedule
    // rows yet (e.g. freshly approved, hasn't visited the availability screen)
    // previously fell through isScheduleAvailable's empty loop straight to
    // `false` — permanently excluding them from every offer, which is why a
    // brand-new cleaner's job board stayed empty forever. Treat "no schedule
    // configured" as available-for-anything rather than available-for-nothing;
    // cleaners who *have* configured a schedule are still matched against it.
    if (!schedule || schedule.length === 0) return true;
    return isScheduleAvailable(schedule, scheduledAt);
  });
}

export interface MatchBreakdown {
  availability: number; // 0-12  schedule fit
  serviceArea: number; // 0-15  closeness within the cleaner's own radius
  rating: number; // 0-20  performance rating
  acceptance: number; // 0-15  acceptance rate (penalized declines drag it down)
  pastInteraction: number; // 0-8  prior good jobs with THIS customer (small)
  tier: number; // 0-10
  fairness: number; // 0-10  exploration boost for rarely-offered cleaners
}

export interface MatchScore {
  cleanerId: string;
  score: number;
  breakdown: MatchBreakdown;
}

/**
 * Turn a set of scored candidates into a WEIGHTED-RANDOM ordering (position 1
 * first). Selection is mostly chance — every eligible cleaner keeps a real
 * shot (a floor weight) so work spreads around and the fairness term can lift
 * underdogs — while higher scores lean the odds toward the best match. Uses
 * Efraimidis–Spirakis weighted sampling without replacement, so the whole
 * cascade order (not just position 1) is a single weighted draw.
 */
export function weightedAssignmentOrder(scores: MatchScore[], floor = 0.35): MatchScore[] {
  if (scores.length <= 1) return [...scores];
  // FLOOR keeps it "largely up to chance": even the lowest-scoring eligible
  // cleaner samples with weight `floor` vs a perfect match at 1.0 — a lean, not
  // a lock (admin-tunable). Normalize against the ABSOLUTE max score (not the
  // pool's spread) so two near-equal cleaners get near-equal odds and a lone
  // weak candidate isn't artificially inflated to the top of its own tiny pool.
  const FLOOR = Math.max(0, Math.min(0.9, floor));
  return scores
    .map((s) => {
      const norm = Math.max(0, Math.min(1, s.score / MAX_MATCH_SCORE)); // 0..1
      const weight = FLOOR + (1 - FLOOR) * norm; // 0.35..1
      // key = U^(1/weight): larger weight → key skews toward 1 → picked earlier.
      const key = Math.pow(Math.random() || 1e-9, 1 / weight);
      return { s, key };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.s);
}

/** Maximum attainable match score — sum of every factor's ceiling. */
export const MAX_MATCH_SCORE = 12 + 15 + 20 + 15 + 8 + 10 + 10; // = 90

interface AvailabilityRow {
  cleaner_id: string;
  day_of_week: number;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
}

interface ServiceAreaRow {
  cleaner_id: string;
  center_lat: string | number | null;
  center_lng: string | number | null;
  radius_miles: number | null;
}

function tierPoints(tier: string): number {
  switch (tier) {
    case "elite":
      return 10;
    case "preferred":
      return 7;
    default:
      return 4;
  }
}

/**
 * Score availability against the booking's scheduled day/time.
 * Exact block match = 25, adjacent (within an hour of a block) = 15,
 * same day but no block = 5, otherwise 0.
 */
function availabilityPoints(
  rows: AvailabilityRow[],
  dayOfWeek: number,
  minuteOfDay: number
): number {
  const sameDay = rows.filter((r) => r.day_of_week === dayOfWeek);
  if (sameDay.length === 0) return 0;

  const toMin = (t: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
  };

  for (const r of sameDay) {
    const s = toMin(r.start_time);
    const e = toMin(r.end_time);
    if (s != null && e != null && minuteOfDay >= s && minuteOfDay <= e) return 25;
  }
  for (const r of sameDay) {
    const s = toMin(r.start_time);
    const e = toMin(r.end_time);
    if (s != null && e != null && minuteOfDay >= s - 60 && minuteOfDay <= e + 60) return 15;
  }
  return 5;
}

/** Closeness score within a cleaner's own service radius (0-15, nearer = more). */
function serviceAreaPoints(miles: number, radius: number): number {
  const frac = Math.min(1, miles / Math.max(1, radius)); // 0 at center, 1 at edge
  return Math.round((1 - frac) * 15 * 100) / 100;
}

/**
 * Rank eligible cleaners for a booking. This applies the HARD filters
 * (service offering + the cleaner's own service area) and produces a fair,
 * multi-factor score per surviving candidate. The score is NOT used to pick a
 * winner directly — `weightedAssignmentOrder()` turns these into a
 * weighted-random cascade order so selection stays mostly up to chance while
 * leaning toward the best match.
 *
 * Hard filters (a mismatch removes the cleaner entirely):
 *  - Service offering: a cleaner who has configured service types and does NOT
 *    offer this booking's service type is never assigned it (e.g. no deep
 *    clean in their profile → no deep-clean jobs).
 *  - Service area: if a cleaner has set their own area and the booking is
 *    outside its radius, they are not offered the job.
 *
 * Weighted factors (into the score):
 *  performance rating, acceptance rate (penalized declines drag it down),
 *  prior good jobs with this exact customer (small), service-area closeness,
 *  tier, and a fairness/exploration boost for rarely-offered cleaners.
 */
export async function rankCleanersForBooking(
  booking: BookingRow,
  availableCleaners: CleanerRow[],
  db: Sql
): Promise<MatchScore[]> {
  if (availableCleaners.length === 0) return [];
  const cleanerIds = availableCleaners.map((c) => c.id);

  // Booking time decomposition.
  const scheduled = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
  const dayOfWeek = scheduled ? scheduled.getUTCDay() : -1;
  const minuteOfDay = scheduled
    ? scheduled.getUTCHours() * 60 + scheduled.getUTCMinutes()
    : -1;

  // Booking location.
  let bookingLat: number | null = null;
  let bookingLng: number | null = null;
  if (booking.address_id) {
    const addr = (await db`
      SELECT lat, lng FROM addresses WHERE id = ${booking.address_id}
    `) as unknown as { lat: string | null; lng: string | null }[];
    if (addr[0]?.lat && addr[0]?.lng) {
      bookingLat = Number(addr[0].lat);
      bookingLng = Number(addr[0].lng);
    }
  }

  const [availabilityRaw, areaRaw, acceptRaw, serviceRaw, recentRaw, interactionRaw] =
    await Promise.all([
      db`
        SELECT cleaner_id, day_of_week,
               start_time::text AS start_time, end_time::text AS end_time
        FROM cleaner_availability
        WHERE cleaner_id = ANY(${cleanerIds}) AND active = true
      `,
      db`
        SELECT cleaner_id, center_lat, center_lng, radius_miles
        FROM cleaner_service_areas
        WHERE cleaner_id = ANY(${cleanerIds})
      `,
      // Acceptance stats: accepted vs PENALIZED declines only. A cleaner's one
      // free decline per day (declined_free = true) is intentionally excluded
      // so it never dents their acceptance rate.
      db`
        SELECT cleaner_id,
               COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
               COUNT(*) FILTER (WHERE status = 'declined' AND declined_free = false)::int AS penalized_declines
        FROM assignment_queue
        WHERE cleaner_id = ANY(${cleanerIds})
        GROUP BY cleaner_id
      `,
      db`
        SELECT id AS cleaner_id, preferred_service_types,
               founding_member, founding_member_revoked
        FROM cleaners
        WHERE id = ANY(${cleanerIds})
      `,
      // Exploration signal: how many offers this cleaner has seen recently.
      db`
        SELECT cleaner_id, COUNT(*)::int AS recent_offers
        FROM assignment_queue
        WHERE cleaner_id = ANY(${cleanerIds})
          AND offered_at > NOW() - INTERVAL '30 days'
        GROUP BY cleaner_id
      `,
      // Prior good history between THIS customer and each cleaner.
      booking.customer_id
        ? db`
            SELECT b.cleaner_id,
                   COUNT(*)::int AS jobs,
                   AVG(r.rating)::float AS avg_rating
            FROM bookings b
            LEFT JOIN reviews r ON r.booking_id = b.id
            WHERE b.customer_id = ${booking.customer_id}
              AND b.cleaner_id = ANY(${cleanerIds})
              AND b.status = 'completed'
            GROUP BY b.cleaner_id
          `
        : Promise.resolve([] as unknown),
    ]);

  const availabilityRows = availabilityRaw as unknown as AvailabilityRow[];
  const areaRows = areaRaw as unknown as ServiceAreaRow[];
  const acceptRows = acceptRaw as unknown as Array<{
    cleaner_id: string;
    accepted: number;
    penalized_declines: number;
  }>;
  const serviceRows = serviceRaw as unknown as Array<{
    cleaner_id: string;
    preferred_service_types: string[] | null;
    founding_member: boolean;
    founding_member_revoked: boolean;
  }>;
  // Active Founding Members — used ONLY as a tiebreaker between otherwise
  // equal-scoring cleaners (never adds to the score, so it can never override
  // distance, availability, qualifications, or eligibility).
  const foundingSet = new Set(
    serviceRows.filter((r) => r.founding_member && !r.founding_member_revoked).map((r) => r.cleaner_id),
  );
  const recentRows = recentRaw as unknown as Array<{ cleaner_id: string; recent_offers: number }>;
  const interactionRows = interactionRaw as unknown as Array<{
    cleaner_id: string;
    jobs: number;
    avg_rating: number | null;
  }>;

  const byCleaner = <T extends { cleaner_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const list = map.get(r.cleaner_id) ?? [];
      list.push(r);
      map.set(r.cleaner_id, list);
    }
    return map;
  };

  const availByCleaner = byCleaner(availabilityRows);
  const areaByCleaner = byCleaner(areaRows);
  const servicesByCleaner = new Map(
    serviceRows.map((r) => [r.cleaner_id, r.preferred_service_types ?? []]),
  );
  const acceptByCleaner = new Map(acceptRows.map((r) => [r.cleaner_id, r]));
  const recentByCleaner = new Map(recentRows.map((r) => [r.cleaner_id, r.recent_offers]));
  const interactionByCleaner = new Map(interactionRows.map((r) => [r.cleaner_id, r]));
  const maxRecent = Math.max(1, ...recentRows.map((r) => r.recent_offers));

  const scores: MatchScore[] = [];
  for (const cleaner of availableCleaners) {
    // ── HARD FILTER 1: service offering ─────────────────────────────────────
    // A cleaner who lists service types and does not include this booking's
    // type is never assigned it. (No configured types = generalist.)
    const prefs = servicesByCleaner.get(cleaner.id) ?? [];
    if (prefs.length > 0 && !prefs.includes(booking.service_type)) continue;

    // ── HARD FILTER 2: the cleaner's own service area ───────────────────────
    const area = (areaByCleaner.get(cleaner.id) ?? [])[0];
    let serviceArea = 10; // neutral when we can't measure (no area set or no geo)
    if (
      area?.center_lat != null &&
      area?.center_lng != null &&
      bookingLat !== null &&
      bookingLng !== null
    ) {
      const radius = area.radius_miles ?? 15;
      const miles = haversineDistance(
        bookingLat,
        bookingLng,
        Number(area.center_lat),
        Number(area.center_lng),
      );
      if (miles > radius) continue; // outside their radius → not offered
      serviceArea = serviceAreaPoints(miles, radius);
    }

    // Schedule fit (already eligibility-gated; this just rewards a tight fit).
    const availability =
      dayOfWeek >= 0
        ? Math.round((availabilityPoints(availByCleaner.get(cleaner.id) ?? [], dayOfWeek, minuteOfDay) / 25) * 12 * 100) / 100
        : 0;

    // Performance rating: rating * 4 capped at 20; new cleaners default 12.
    const ratingValue = cleaner.rating != null ? Number(cleaner.rating) : null;
    const rating = ratingValue == null ? 12 : Math.min(20, ratingValue * 4);

    // Acceptance rate → 0-15. New cleaners (no history) default to a healthy 0.85.
    const acc = acceptByCleaner.get(cleaner.id);
    const totalResolved = acc ? acc.accepted + acc.penalized_declines : 0;
    const acceptanceRate = totalResolved === 0 ? 0.85 : acc!.accepted / totalResolved;
    const acceptance = Math.round(acceptanceRate * 15 * 100) / 100;

    // Prior good jobs with THIS customer (small weight, 0-8).
    const inter = interactionByCleaner.get(cleaner.id);
    let pastInteraction = 0;
    if (inter && inter.jobs > 0) {
      const ratingBoost = inter.avg_rating == null ? 0.6 : Math.max(0, (inter.avg_rating - 3) / 2); // 3★→0, 5★→1
      pastInteraction = Math.round(Math.min(8, inter.jobs * 2 * (0.5 + ratingBoost)) * 100) / 100;
    }

    const tier = tierPoints(cleaner.tier);

    // Fairness/exploration (0-10): rarely-offered cleaners get a lift so work
    // spreads and the "available but never picked" don't get starved.
    const recent = recentByCleaner.get(cleaner.id) ?? 0;
    const fairness = Math.round((1 - recent / maxRecent) * 10 * 100) / 100;

    const breakdown: MatchBreakdown = {
      availability,
      serviceArea,
      rating: Math.round(rating * 100) / 100,
      acceptance,
      pastInteraction,
      tier,
      fairness,
    };

    const score =
      Math.round(
        (availability + serviceArea + rating + acceptance + pastInteraction + tier + fairness) * 100,
      ) / 100;

    scores.push({ cleanerId: cleaner.id, score, breakdown });
  }

  // Sort by score; break EXACT ties in favor of Founding Members (recognition
  // tiebreaker only — see foundingSet above). Stable for non-founders.
  return scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const af = foundingSet.has(a.cleanerId) ? 1 : 0;
    const bf = foundingSet.has(b.cleanerId) ? 1 : 0;
    return bf - af;
  });
}
