/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 102_team_cleans_compensation.sql
-- Team Cleans (multi-cleaner crews) — per-member compensation, tips & ratings.
--
-- Wave 1 foundation (101) added booking_crew_assignments (with per-seat
-- earnings_cents + stripe_transfer_id) and crew_peer_ratings. This migration
-- relaxes the two per-booking UNIQUE constraints that block per-crew-member
-- tips and ratings, so a booking can now carry one tip row and one review row
-- PER cleaner instead of exactly one per booking.
--
-- Payouts stay booking-level (the POOL): payouts.booking_id UNIQUE (mig 052)
-- and payout_ledger's booking-unique index are DELIBERATELY untouched — the
-- per-seat split is tracked on booking_crew_assignments.earnings_cents /
-- stripe_transfer_id (already added in 101), never by fanning out payouts rows.
--
-- Solo bookings are the degenerate crew of one: a single (booking_id, cleaner_id)
-- pair behaves exactly like the old (booking_id) UNIQUE, so solo tips/ratings
-- are unchanged.

-- ─── booking_tips: per-member tips ──────────────────────────────────────────
-- The original inline column UNIQUE (mig 058) is auto-named
-- booking_tips_booking_id_key. Replace it with a composite so each crew member
-- can receive their own split of a customer tip.
ALTER TABLE booking_tips DROP CONSTRAINT IF EXISTS booking_tips_booking_id_key;
ALTER TABLE booking_tips
  ADD CONSTRAINT booking_tips_booking_cleaner_key UNIQUE (booking_id, cleaner_id);

-- ─── reviews: per-member ratings ────────────────────────────────────────────
-- The original inline column UNIQUE (mig 001) is auto-named
-- reviews_booking_id_key. Replace it with a composite so a customer rating can
-- target each cleaner who performed the booking (or the booking overall via the
-- LEAD's cleaner_id).
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_booking_id_key;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_booking_cleaner_key UNIQUE (booking_id, cleaner_id);

-- Admin/reporting: which cleaners performed a given booking, and each seat's
-- rating. Ratings join booking_crew_assignments on (booking_id, cleaner_id).
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);
