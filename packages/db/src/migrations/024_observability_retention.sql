-- Migration 024: Observability retention (cleanup driven by cron)
-- Adds logged_at column aliases so the retention cron can use a uniform column name.

ALTER TABLE api_request_logs
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Payment observability: add missing columns if not present
ALTER TABLE payment_observability_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS booking_id        UUID REFERENCES bookings(id),
  ADD COLUMN IF NOT EXISTS amount_cents      INTEGER,
  ADD COLUMN IF NOT EXISTS success           BOOLEAN,
  ADD COLUMN IF NOT EXISTS error_code        TEXT,
  ADD COLUMN IF NOT EXISTS error_message     TEXT,
  ADD COLUMN IF NOT EXISTS metadata          JSONB;

CREATE INDEX IF NOT EXISTS idx_payment_obs_type ON payment_observability_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_obs_booking ON payment_observability_events(booking_id) WHERE booking_id IS NOT NULL;

-- Cleaner availability table
CREATE TABLE IF NOT EXISTS cleaner_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id   UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cleaner_id, day_of_week)
);

-- Cleaner blocked dates
CREATE TABLE IF NOT EXISTS cleaner_blocked_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id   UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cleaner_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_cleaner_availability_cleaner ON cleaner_availability(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_blocked_dates_cleaner ON cleaner_blocked_dates(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_blocked_dates_date ON cleaner_blocked_dates(blocked_date);
