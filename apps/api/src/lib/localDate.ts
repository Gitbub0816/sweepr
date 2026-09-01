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
 * Local-calendar-date helpers, extracted from routes/bookings.ts so the
 * calendar date-rules engine (lib/calendarRules.ts) and the booking flow share
 * ONE definition of "the booking's date".
 *
 * The invariant (established when computeArrivalInstant fixed the evening-
 * booking rollover bug): the booking's date is the calendar date as seen at
 * the CUSTOMER'S UTC offset — never the UTC date of the scheduled instant,
 * which rolls to the next day for evening bookings in negative-offset zones
 * (a 9pm PST booking is a 05:00Z instant on the NEXT UTC day).
 */

/** Format an ISO offset (minutes east of UTC) as "+HH:MM" / "-HH:MM". */
export function formatIsoOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** Parse an explicit ISO offset (minutes east of UTC) from a datetime string;
 *  null when the string carries no usable offset (e.g. ends in 'Z'). */
export function parseIsoOffsetMinutes(iso: string): number | null {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -mins : mins;
}

/**
 * Recover the customer's UTC offset from a stored booking, using the fact that
 * the scheduled instant was built as "local booking date + arrival-window
 * start, at the customer's offset" (computeArrivalInstant): the difference
 * between the window's local wall-clock time and the instant's UTC time of day
 * IS the offset. Wrapped into (-840, +600] minutes — every US offset (-4h EDT
 * through -10h HST) resolves unambiguously; offsets beyond +10h east would
 * alias, which this US-market product does not serve.
 *
 * Returns null when no window is stored (exact-time legacy bookings), in which
 * case callers fall back to the UTC date.
 */
export function deriveOffsetFromWindow(
  scheduledAtIso: string,
  arrivalWindowStart: string | null | undefined,
): number | null {
  if (!arrivalWindowStart || !/^\d{2}:\d{2}/.test(arrivalWindowStart)) return null;
  const instantMs = new Date(scheduledAtIso).getTime();
  if (!Number.isFinite(instantMs)) return null;
  const [wh, wm] = arrivalWindowStart.split(":").map(Number);
  const windowMinutes = wh * 60 + wm;
  const d = new Date(instantMs);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  let diff = windowMinutes - utcMinutes;
  if (diff > 600) diff -= 1440;
  if (diff <= -840) diff += 1440;
  return diff;
}

/**
 * The booking's LOCAL calendar date ("YYYY-MM-DD") — the date the customer
 * picked in the wizard. Offset resolution order:
 *   1. an explicit timezoneOffsetMinutes from the client (ISO sign convention,
 *      east of UTC positive — the client sends -new Date().getTimezoneOffset());
 *   2. an offset embedded in the scheduledAt string itself;
 *   3. an offset recovered from the arrival window (stored bookings);
 *   4. UTC (legacy exact-time bookings with no timezone information at all).
 */
export function localBookingDate(
  scheduledAt: string,
  timezoneOffsetMinutes?: number | null,
  arrivalWindowStart?: string | null,
): string {
  const offset =
    timezoneOffsetMinutes ??
    parseIsoOffsetMinutes(scheduledAt) ??
    deriveOffsetFromWindow(scheduledAt, arrivalWindowStart) ??
    0;
  const localMs = new Date(scheduledAt).getTime() + offset * 60_000;
  return new Date(localMs).toISOString().slice(0, 10);
}

/**
 * Resolve the authoritative arrival instant (UTC ISO) for a booking.
 *
 * When an arrival window is chosen the instant is the customer's LOCAL booking
 * date combined with the window's start time, interpreted at the customer's UTC
 * offset. The old code took the UTC date from toISOString() (which rolls to the
 * next day for evening bookings in negative-offset zones) and concatenated a
 * literal 'Z' onto the local wall-clock time (persisting local time AS UTC) —
 * both wrong. We derive the offset from an explicit timezoneOffsetMinutes, else
 * from an offset embedded in scheduledAt; when neither is available the client
 * already baked the window-start time into scheduledAt as a UTC instant, so we
 * trust it as-is rather than corrupting it.
 */
export function computeArrivalInstant(
  scheduledAt: string,
  arrivalWindowStart: string | undefined,
  timezoneOffsetMinutes?: number,
): string {
  if (!arrivalWindowStart) return scheduledAt;
  const offset = timezoneOffsetMinutes ?? parseIsoOffsetMinutes(scheduledAt);
  if (offset == null) {
    // No timezone info: scheduledAt already encodes the correct instant.
    return scheduledAt;
  }
  // Local date = the calendar date as seen at the customer's offset.
  const localMs = new Date(scheduledAt).getTime() + offset * 60_000;
  const localDate = new Date(localMs).toISOString().slice(0, 10);
  const instant = new Date(`${localDate}T${arrivalWindowStart}:00${formatIsoOffset(offset)}`);
  return instant.toISOString();
}
