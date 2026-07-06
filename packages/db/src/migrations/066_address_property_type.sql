-- Migration 066: typed addresses.
--
-- Each saved address is either a "home" or a "short_term_rental". This drives
-- the booking entry (which flow to use) and lets a customer keep multiple
-- addresses; the booking flow asks which one when there is more than one.
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS property_type TEXT NOT NULL DEFAULT 'home'
  CHECK (property_type IN ('home', 'short_term_rental'));
