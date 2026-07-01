-- Migration 052: Unique constraint on payouts.booking_id so the release-payout
-- route can use INSERT ... ON CONFLICT / a guaranteed-unique row to prevent
-- concurrent/retried requests from creating two Stripe transfers for one booking.
ALTER TABLE payouts ADD CONSTRAINT payouts_booking_id_unique UNIQUE (booking_id);
