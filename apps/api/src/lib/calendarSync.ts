/**
 * Short-term rental calendar sync engine.
 *
 * Polls connected .ics feeds, turns checkout dates into turnaround cleanings,
 * and dedupes on (property, source, externalUid, checkoutDate). Every fetch goes
 * through the SSRF-hardened `fetchCalendar`. Raw ICS is never persisted — only
 * the derived reservation fields.
 */
import type { Sql } from "./db";
import { fetchCalendar, CalendarValidationError } from "./calendarSecurity";
import { loadStrConfig } from "./pricingConfig";
import { calculateTurnaroundPrice } from "@sweepr/utils";
import { logger } from "./logger";

interface SourceRow {
  id: string;
  property_id: string;
  ics_url: string;
  auto_book: boolean;
}

export interface SyncOutcome {
  ok: boolean;
  eventCount: number;
  imported: number;
  autoBooked: number;
  error?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sync a single calendar source. Best-effort and self-contained: failures are
 * recorded on the source row (status='error') and never throw out of here.
 */
export async function syncCalendarSource(sql: Sql, sourceId: string): Promise<SyncOutcome> {
  const rows = (await sql`
    SELECT id, property_id, ics_url, auto_book
    FROM calendar_sources WHERE id = ${sourceId} LIMIT 1
  `) as SourceRow[];
  const source = rows[0];
  if (!source) return { ok: false, eventCount: 0, imported: 0, autoBooked: 0, error: "not_found" };

  try {
    const { reservations } = await fetchCalendar(source.ics_url);
    const today = todayIso();
    let imported = 0;
    let autoBooked = 0;

    for (const r of reservations) {
      if (!r.end) continue; // no checkout date — skip
      const checkout = r.end.slice(0, 10);
      if (checkout < today) continue; // past turnover — ignore

      // Dedupe insert. COALESCE('') mirrors the unique index on null UIDs.
      const inserted = (await sql`
        INSERT INTO imported_calendar_reservations (
          property_id, calendar_source_id, external_uid, summary, ics_status,
          checkin_date, checkout_date, cleaning_status
        ) VALUES (
          ${source.property_id}, ${source.id}, ${r.externalUid}, ${r.summary},
          ${r.status}, ${r.start ? r.start.slice(0, 10) : null}, ${checkout}, 'pending'
        )
        ON CONFLICT (property_id, calendar_source_id, COALESCE(external_uid, ''), checkout_date)
        DO UPDATE SET summary = EXCLUDED.summary, ics_status = EXCLUDED.ics_status,
                      checkin_date = EXCLUDED.checkin_date, updated_at = NOW()
        RETURNING id, cleaning_status, booking_id
      `) as { id: string; cleaning_status: string; booking_id: string | null }[];

      const row = inserted[0];
      if (!row) continue;
      imported++;

      // Auto-book: create a turnaround booking for still-pending rows.
      if (source.auto_book && row.cleaning_status === "pending" && !row.booking_id) {
        const bookingId = await createTurnaroundBooking(sql, source.property_id, checkout);
        if (bookingId) {
          await sql`
            UPDATE imported_calendar_reservations
            SET cleaning_status = 'scheduled', booking_id = ${bookingId}, updated_at = NOW()
            WHERE id = ${row.id}
          `;
          autoBooked++;
        }
      }
    }

    await sql`
      UPDATE calendar_sources
      SET status = 'active', last_synced_at = NOW(), last_sync_error = NULL,
          last_sync_event_count = ${reservations.length}, updated_at = NOW()
      WHERE id = ${source.id}
    `;
    return { ok: true, eventCount: reservations.length, imported, autoBooked };
  } catch (err) {
    const msg =
      err instanceof CalendarValidationError ? `${err.code}: ${err.message}` : "sync_failed";
    await sql`
      UPDATE calendar_sources
      SET status = 'error', last_sync_error = ${msg}, last_synced_at = NOW(), updated_at = NOW()
      WHERE id = ${source.id}
    `;
    logger.warn("calendar_sync.failed", { sourceId, error: msg });
    return { ok: false, eventCount: 0, imported: 0, autoBooked: 0, error: msg };
  }
}

/**
 * Create a minimal turnaround booking for an STR property at a checkout date.
 * Priced from the admin-configured STR turnaround fee (never hardcoded).
 * Returns the booking id, or null if the property can't be booked.
 */
async function createTurnaroundBooking(
  sql: Sql,
  propertyId: string,
  checkoutDate: string,
): Promise<string | null> {
  const props = (await sql`
    SELECT customer_id, nickname, bedrooms, bathrooms, sqft
    FROM short_term_rental_properties WHERE id = ${propertyId} AND active = TRUE LIMIT 1
  `) as {
    customer_id: string;
    nickname: string;
    bedrooms: number | null;
    bathrooms: number | null;
    sqft: number | null;
  }[];
  const prop = props[0];
  if (!prop) return null;

  const cfg = await loadStrConfig(sql);
  const price = calculateTurnaroundPrice(cfg);
  const totalCents = Math.round(price.totalOwed * 100);
  // Schedule the turnover for checkout day at a default late-morning window.
  const scheduledAt = `${checkoutDate}T11:00:00Z`;

  try {
    const rows = (await sql`
      INSERT INTO bookings (
        customer_id, status, service_type, bedrooms, bathrooms, sqft, home_type,
        scheduled_at, base_price, addons_total, service_fee, tax, total_price,
        notes, arrival_window_start, arrival_window_end
      ) VALUES (
        ${prop.customer_id}, 'booked', 'vacation_rental',
        ${prop.bedrooms ?? 1}, ${prop.bathrooms ?? 1}, ${prop.sqft ?? 800}, 'apartment',
        ${scheduledAt}, ${price.turnaroundCents}, 0, 0, ${price.taxCents}, ${totalCents},
        ${`STR turnaround — ${prop.nickname}`}, '11:00', '13:00'
      ) RETURNING id
    `) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch (err) {
    logger.warn("calendar_sync.booking_failed", { propertyId, error: String(err) });
    return null;
  }
}

/**
 * Sync all active sources due for a refresh (last_synced_at older than their
 * interval). Called from the cron handler. Caps work per fire to stay well
 * within the Worker CPU budget.
 */
export async function syncDueCalendarSources(sql: Sql, limit = 25): Promise<number> {
  const due = (await sql`
    SELECT id FROM calendar_sources
    WHERE status IN ('active', 'error')
      AND (last_synced_at IS NULL
           OR last_synced_at < NOW() - (sync_interval_minutes || ' minutes')::INTERVAL)
    ORDER BY last_synced_at ASC NULLS FIRST
    LIMIT ${limit}
  `) as { id: string }[];
  let synced = 0;
  for (const s of due) {
    await syncCalendarSource(sql, s.id);
    synced++;
  }
  return synced;
}
