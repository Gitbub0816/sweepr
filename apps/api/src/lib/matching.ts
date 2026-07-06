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
      SELECT DISTINCT cleaner_id
      FROM bookings
      WHERE cleaner_id = ANY(${cleanerIds})
        AND status IN ('cleaner_accepted', 'confirmed', 'cleaner_on_the_way',
                       'arrived', 'in_progress')
        AND scheduled_at IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (scheduled_at - ${booking.scheduled_at}::timestamptz))) < 10800
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
  availability: number; // 0-25
  distance: number; // 0-25
  rating: number; // 0-20
  tier: number; // 0-10
  serviceMatch: number; // 0-10
  reliability: number; // 0-10
}

export interface MatchScore {
  cleanerId: string;
  score: number;
  breakdown: MatchBreakdown;
}

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

interface OfferStatsRow {
  cleaner_id: string;
  offered: number;
  accepted: number;
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

function distancePoints(miles: number): number {
  if (miles < 5) return 25;
  if (miles < 10) return 20;
  if (miles < 15) return 15;
  if (miles < 25) return 5;
  return 0;
}

/**
 * Rank available cleaners for a booking using a weighted scoring engine.
 * Returns scores sorted descending. Pure aside from the supplied db queries.
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

  // Batch lookups for all candidate cleaners. NOTE: these three queries were
  // all writing against tables/columns that do not exist (cleaner_availability
  // has start_time/end_time not start_minute/end_minute; offer stats live in
  // assignment_queue not job_offers.status; service prefs live in
  // cleaners.preferred_service_types not a cleaner_services table). The result:
  // rankCleanersForBooking threw on every booking and no cleaner was ever
  // ranked or offered — the whole marketplace silently never matched anyone.
  const [availabilityRaw, areaRaw, offerRaw, serviceRaw] = await Promise.all([
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
    db`
      SELECT cleaner_id,
             COUNT(*)::int AS offered,
             COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
      FROM assignment_queue
      WHERE cleaner_id = ANY(${cleanerIds})
      GROUP BY cleaner_id
    `,
    db`
      SELECT id AS cleaner_id, preferred_service_types
      FROM cleaners
      WHERE id = ANY(${cleanerIds})
    `,
  ]);

  const availabilityRows = availabilityRaw as unknown as AvailabilityRow[];
  const areaRows = areaRaw as unknown as ServiceAreaRow[];
  const offerRows = offerRaw as unknown as OfferStatsRow[];
  const serviceRows = serviceRaw as unknown as Array<{
    cleaner_id: string;
    preferred_service_types: string[] | null;
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
  const offerByCleaner = new Map(offerRows.map((r) => [r.cleaner_id, r]));

  const scores: MatchScore[] = availableCleaners.map((cleaner) => {
    // Availability
    const availability =
      dayOfWeek >= 0
        ? availabilityPoints(
            availByCleaner.get(cleaner.id) ?? [],
            dayOfWeek,
            minuteOfDay
          )
        : 0;

    // Distance. A cleaner with NO service-area rows configured hasn't set up
    // a preferred radius yet (common for a freshly-approved cleaner) — soft-
    // filter that case to a neutral mid-range score instead of 0, so they
    // aren't effectively excluded from ranking just for lacking config.
    const area = (areaByCleaner.get(cleaner.id) ?? [])[0];
    let distance = 15;
    if (
      bookingLat !== null &&
      bookingLng !== null &&
      area?.center_lat != null &&
      area?.center_lng != null
    ) {
      const miles = haversineDistance(
        bookingLat,
        bookingLng,
        Number(area.center_lat),
        Number(area.center_lng)
      );
      distance = distancePoints(miles);
    }

    // Rating: rating * 4 capped at 20; new cleaners default 12.
    const ratingValue = cleaner.rating != null ? Number(cleaner.rating) : null;
    const rating =
      ratingValue == null ? 12 : Math.min(20, ratingValue * 4);

    // Tier
    const tier = tierPoints(cleaner.tier);

    // Service match. A cleaner with no configured preferences is treated as
    // accepting all service types (soft rule, matches eligibility).
    const prefs = servicesByCleaner.get(cleaner.id) ?? [];
    const offersService = prefs.length === 0 || prefs.includes(booking.service_type);
    const serviceMatch = offersService ? 10 : 0;

    // Reliability: accepted/offered * 10; new cleaners default 8.
    const stats = offerByCleaner.get(cleaner.id);
    const reliability =
      !stats || stats.offered === 0
        ? 8
        : (stats.accepted / stats.offered) * 10;

    const breakdown: MatchBreakdown = {
      availability,
      distance,
      rating: Math.round(rating * 100) / 100,
      tier,
      serviceMatch,
      reliability: Math.round(reliability * 100) / 100,
    };

    const score =
      Math.round(
        (availability +
          distance +
          breakdown.rating +
          tier +
          serviceMatch +
          breakdown.reliability) *
          100
      ) / 100;

    return { cleanerId: cleaner.id, score, breakdown };
  });

  return scores.sort((a, b) => b.score - a.score);
}
