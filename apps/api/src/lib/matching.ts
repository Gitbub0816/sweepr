import type { Sql, BookingRow, CleanerRow } from "@sweepr/db";
import { haversineDistance } from "./haversine";

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
    `) as { lat: string | null; lng: string | null }[];
    if (addr[0]?.lat && addr[0]?.lng) {
      bookingLat = Number(addr[0].lat);
      bookingLng = Number(addr[0].lng);
    }
  }

  // Batch lookups for all candidate cleaners.
  const [availabilityRows, areaRows, offerRows, serviceRows] =
    await Promise.all([
      db`
        SELECT cleaner_id, day_of_week, start_minute, end_minute
        FROM cleaner_availability
        WHERE cleaner_id = ANY(${cleanerIds})
      ` as Promise<AvailabilityRow[]>,
      db`
        SELECT cleaner_id, center_lat, center_lng, radius_miles
        FROM cleaner_service_areas
        WHERE cleaner_id = ANY(${cleanerIds})
      ` as Promise<ServiceAreaRow[]>,
      db`
        SELECT cleaner_id,
               COUNT(*)::int AS offered,
               COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
        FROM job_offers
        WHERE cleaner_id = ANY(${cleanerIds})
        GROUP BY cleaner_id
      ` as Promise<OfferStatsRow[]>,
      db`
        SELECT cleaner_id, service_type
        FROM cleaner_services
        WHERE cleaner_id = ANY(${cleanerIds})
      ` as Promise<CleanerServiceRow[]>,
    ]);

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
