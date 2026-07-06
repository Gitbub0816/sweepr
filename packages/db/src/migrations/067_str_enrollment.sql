-- Migration 067: explicit short-term-rental enrollment.
--
-- A property must be explicitly enrolled (disclaimer accepted) before the
-- monthly subscription applies and turnaround cleanings can be booked from its
-- calendar. Existing rows keep active=TRUE (they predate enrollment gating);
-- new rows are created inactive until the host taps Enroll.
ALTER TABLE short_term_rental_properties
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrollment_disclaimer_version TEXT;
