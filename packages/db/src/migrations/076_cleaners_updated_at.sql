-- Migration 076: add cleaners.updated_at.
--
-- The cleaners table was created (001) with only created_at, but many write
-- paths set `updated_at = NOW()` — PUT /cleaner-dashboard/settings, cleaner
-- profile edits, Stripe Connect linking, and admin checkr-status updates. Every
-- one of those 500s with 42703 (undefined_column) because the column never
-- existed. Add it idempotently.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
