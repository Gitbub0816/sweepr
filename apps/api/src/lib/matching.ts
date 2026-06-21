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

  const [scheduleRaw, conflictRaw] = await Promise.all([
    db`
      SELECT cleaner_id, slot_type, day_of_week, start_time::text, end_time::text,
             specific_date::text
      FROM cleaner_schedule
      WHERE cleaner_id = ANY(${cleanerIds}) AND is_active = true
    `,
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

  const scheduleRows = scheduleRaw as unknown as ScheduleRow[];
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
    return isScheduleAvailable(byCleaner.get(c.id) ?? [], scheduledAt);
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
  start_minute: number;
  end_minute: number;
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

interface CleanerServiceRow {
  cleaner_id: string;
  service_type: string;
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

  for (const r of sameDay) {
    if (minuteOfDay >= r.start_minute && minuteOfDay <= r.end_minute) return 25;
  }
  for (const r of sameDay) {
    if (
      minuteOfDay >= r.start_minute - 60 &&
      minuteOfDay <= r.end_minute + 60
    ) {
      return 15;
    }
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

  // Batch lookups for all candidate cleaners.
  const [availabilityRaw, areaRaw, offerRaw, serviceRaw] = await Promise.all([
    db`
      SELECT cleaner_id, day_of_week, start_minute, end_minute
      FROM cleaner_availability
      WHERE cleaner_id = ANY(${cleanerIds})
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
      FROM job_offers
      WHERE cleaner_id = ANY(${cleanerIds})
      GROUP BY cleaner_id
    `,
    db`
      SELECT cleaner_id, service_type
      FROM cleaner_services
      WHERE cleaner_id = ANY(${cleanerIds})
    `,
  ]);

  const availabilityRows = availabilityRaw as unknown as AvailabilityRow[];
  const areaRows = areaRaw as unknown as ServiceAreaRow[];
  const offerRows = offerRaw as unknown as OfferStatsRow[];
  const serviceRows = serviceRaw as unknown as CleanerServiceRow[];

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
  const servicesByCleaner = byCleaner(serviceRows);
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

    // Distance
    let distance = 0;
    const area = (areaByCleaner.get(cleaner.id) ?? [])[0];
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

    // Service match
    const offersService = (servicesByCleaner.get(cleaner.id) ?? []).some(
      (s) => s.service_type === booking.service_type
    );
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
