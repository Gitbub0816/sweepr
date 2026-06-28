-- Migration 029: fix cleaner self-service dashboard schema gaps.
--
-- 1) cleaner_availability was created in 001 WITHOUT active/created_at/updated_at.
--    Migration 024 re-declared it with CREATE TABLE IF NOT EXISTS, which is a
--    no-op when the table already exists — so those columns were never added and
--    GET/PUT /cleaner-dashboard/availability 500s. Add them idempotently.
--
-- 2) The cleaner settings columns referenced by /cleaner-dashboard/settings were
--    never defined in any migration, so that endpoint always 500s. Add them.

ALTER TABLE cleaner_availability
  ADD COLUMN IF NOT EXISTS active     BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS max_jobs_per_day        INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_distance_miles      INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS accepts_last_minute     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_job_offer  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_reminder   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_payout     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_marketing  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_service_types TEXT[] NOT NULL DEFAULT ARRAY['standard','deep']::TEXT[];

-- Defensive: ensure the day-of-service column exists (added in 012) in case a
-- baseline skipped it on this database.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS day_status TEXT;
