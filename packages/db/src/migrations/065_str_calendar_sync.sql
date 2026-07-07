/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 065: Short-Term Rental calendar sync.
--
-- Hosts of short-term rentals (Airbnb / Vrbo / Booking.com / Google Calendar /
-- PMS / other) connect an iCal (.ics) feed. Checkout dates from that feed are
-- turned into turnaround cleanings (review-first by default, or auto-booked).
--
-- Security posture (enforced in app code, mirrored here as intent):
--   * Calendar URLs are validated server-side with SSRF protection before ever
--     being stored or fetched (see lib/calendarSecurity.ts).
--   * Raw ICS content is NEVER exposed to cleaners; only the derived fields
--     below (external uid, source, start/end, title, status) are persisted, and
--     cleaner-facing endpoints project a subset.

-- ── Connected calendar feeds ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS short_term_rental_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,

  -- Property address (turnarounds are booked here).
  street_address TEXT,
  unit TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  bedrooms INTEGER,
  bathrooms NUMERIC,
  sqft INTEGER,

  -- Monthly connection fee snapshot (cents) at time of activation.
  monthly_fee_cents INTEGER NOT NULL DEFAULT 2000,
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_str_properties_customer ON short_term_rental_properties(customer_id);

CREATE TABLE IF NOT EXISTS calendar_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES short_term_rental_properties(id) ON DELETE CASCADE,

  provider TEXT NOT NULL DEFAULT 'other'
    CHECK (provider IN ('airbnb','vrbo','booking_com','google_calendar','pms','other')),
  ics_url TEXT NOT NULL,

  -- Sync behavior.
  auto_book BOOLEAN NOT NULL DEFAULT FALSE,          -- false = create pending (review-first)
  sync_interval_minutes INTEGER NOT NULL DEFAULT 120 -- 1–3h; clamped in app
    CHECK (sync_interval_minutes BETWEEN 60 AND 180),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','error')),
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  last_sync_event_count INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_sources_property ON calendar_sources(property_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sources_due
  ON calendar_sources(last_synced_at) WHERE status = 'active';

-- ── Imported reservations (derived; never the raw ICS) ───────────────────────
CREATE TABLE IF NOT EXISTS imported_calendar_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES short_term_rental_properties(id) ON DELETE CASCADE,
  calendar_source_id UUID NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,

  external_uid TEXT,          -- VEVENT UID from the feed (may be null)
  summary TEXT,               -- VEVENT SUMMARY (e.g. "Reserved")
  ics_status TEXT,            -- VEVENT STATUS
  checkin_date DATE,          -- DTSTART
  checkout_date DATE NOT NULL, -- DTEND == turnaround trigger

  -- Lifecycle of the derived turnaround cleaning.
  cleaning_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (cleaning_status IN ('pending','scheduled','skipped','cancelled')),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Duplicate prevention: propertyId + calendarSourceId + externalUid + checkoutDate.
-- COALESCE so rows with a null UID still dedupe on (property, source, checkout).
CREATE UNIQUE INDEX IF NOT EXISTS uq_imported_reservation_dedupe
  ON imported_calendar_reservations(
    property_id, calendar_source_id, COALESCE(external_uid, ''), checkout_date
  );
CREATE INDEX IF NOT EXISTS idx_imported_reservations_pending
  ON imported_calendar_reservations(property_id) WHERE cleaning_status = 'pending';
