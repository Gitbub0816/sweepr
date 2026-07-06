/**
 * Unified cleaner availability — single source of truth.
 *
 * Historically two disconnected systems existed:
 *   - `cleaner_availability` (weekly day-of-week blocks) + `cleaner_blocked_dates`,
 *     written by the dashboard's Availability tab and read by the customer
 *     booking slots endpoint;
 *   - `cleaner_schedule` (recurring / flexible / available_now rows), written by
 *     the Schedule page and read by matching.
 * A cleaner who set hours in one place was invisible to readers of the other.
 *
 * This module merges them into one read model used EVERYWHERE:
 *   weekly blocks (cleaner_availability, active)
 *   + one-off "flexible" slots (cleaner_schedule, is_active)
 *   + the ephemeral available_now flag (cleaner_schedule)
 *   − blocked dates (cleaner_blocked_dates)
 *
 * Writes: weekly ("recurring") edits go to `cleaner_availability` no matter
 * which screen they come from; flexible one-offs and available_now stay in
 * `cleaner_schedule`. Both screens therefore always show the same state.
 */
import type { Sql } from "./db";

export interface MergedSlot {
  id: string;
  cleaner_id: string;
  slot_type: "recurring" | "flexible" | "available_now";
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  specific_date: string | null;
}

/** All active slots for a set of cleaners (or all when ids omitted), merged. */
export async function getMergedSlots(sql: Sql, cleanerIds?: string[]): Promise<MergedSlot[]> {
  const weekly = (cleanerIds
    ? await sql`
        SELECT id, cleaner_id, day_of_week, start_time::text AS start_time, end_time::text AS end_time
        FROM cleaner_availability
        WHERE active = true AND cleaner_id = ANY(${cleanerIds})
      `
    : await sql`
        SELECT id, cleaner_id, day_of_week, start_time::text AS start_time, end_time::text AS end_time
        FROM cleaner_availability WHERE active = true
      `) as Array<{
    id: string;
    cleaner_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;

  const oneOffs = (cleanerIds
    ? await sql`
        SELECT id, cleaner_id, slot_type, day_of_week,
               start_time::text AS start_time, end_time::text AS end_time,
               specific_date::text AS specific_date
        FROM cleaner_schedule
        WHERE is_active = true AND slot_type IN ('recurring', 'flexible', 'available_now')
          AND cleaner_id = ANY(${cleanerIds})
      `
    : await sql`
        SELECT id, cleaner_id, slot_type, day_of_week,
               start_time::text AS start_time, end_time::text AS end_time,
               specific_date::text AS specific_date
        FROM cleaner_schedule
        WHERE is_active = true AND slot_type IN ('recurring', 'flexible', 'available_now')
      `) as MergedSlot[];

  return [
    ...weekly.map((w) => ({
      id: w.id,
      cleaner_id: w.cleaner_id,
      slot_type: "recurring" as const,
      day_of_week: w.day_of_week,
      start_time: w.start_time,
      end_time: w.end_time,
      specific_date: null,
    })),
    ...oneOffs,
  ];
}

/** Cleaner ids that are blocked (unavailable) on a specific date. */
export async function getBlockedCleaners(sql: Sql, date: string, cleanerIds?: string[]): Promise<Set<string>> {
  const rows = (cleanerIds
    ? await sql`
        SELECT cleaner_id FROM cleaner_blocked_dates
        WHERE blocked_date = ${date} AND cleaner_id = ANY(${cleanerIds})
      `
    : await sql`
        SELECT cleaner_id FROM cleaner_blocked_dates WHERE blocked_date = ${date}
      `) as Array<{ cleaner_id: string }>;
  return new Set(rows.map((r) => r.cleaner_id));
}

export interface DayAvailabilityRow {
  cleaner_id: string;
  start_time: string;
  end_time: string;
}

/**
 * Concrete availability windows for a given date (YYYY-MM-DD) across all
 * approved/active cleaners: weekly blocks whose day matches + flexible slots on
 * that date, minus cleaners who blocked the date. This is what the customer
 * booking slots endpoint and the anonymized availability endpoint consume.
 */
export async function getAvailabilityForDate(sql: Sql, date: string): Promise<DayAvailabilityRow[]> {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

  const [weekly, flexible, blockedRows] = await Promise.all([
    sql`
      SELECT ca.cleaner_id, ca.start_time::text AS start_time, ca.end_time::text AS end_time
      FROM cleaner_availability ca
      JOIN cleaners cl ON cl.id = ca.cleaner_id
      WHERE ca.day_of_week = ${dayOfWeek} AND ca.active = true
        AND cl.status IN ('approved', 'active')
    `,
    sql`
      SELECT cs.cleaner_id, cs.start_time::text AS start_time, cs.end_time::text AS end_time
      FROM cleaner_schedule cs
      JOIN cleaners cl ON cl.id = cs.cleaner_id
      WHERE cs.slot_type = 'flexible' AND cs.is_active = true
        AND cs.specific_date = ${date}
        AND cl.status IN ('approved', 'active')
    `,
    sql`SELECT cleaner_id FROM cleaner_blocked_dates WHERE blocked_date = ${date}`,
  ]);

  const blocked = new Set(
    (blockedRows as Array<{ cleaner_id: string }>).map((r) => r.cleaner_id),
  );

  return [...(weekly as DayAvailabilityRow[]), ...(flexible as DayAvailabilityRow[])].filter(
    (r) => !blocked.has(r.cleaner_id) && r.start_time && r.end_time,
  );
}
