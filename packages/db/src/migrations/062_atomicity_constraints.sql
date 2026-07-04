-- Migration 062: DB-level guarantees backing the atomic-transaction hardening
-- pass in apps/api (bookings, payments, addons). Idempotent. No CREATE INDEX
-- CONCURRENTLY — migrations run inside a transaction.

-- ─── payments: exactly one settled row per booking ────────────────────────────
-- The capture cron (apps/api/src/index.ts scheduled handler) checks for an
-- existing 'captured' row via a LEFT JOIN before inserting; without a unique
-- constraint two concurrent cron ticks racing on the same booking could both
-- pass the check and insert two rows (double-recording the same capture).
DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT payments_booking_id_unique UNIQUE (booking_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ─── booking_addons: never sell the same add-on twice on one booking ─────────
-- bookings.ts POST /:id/addons previously did a SELECT-then-INSERT to guard
-- against re-purchasing an add-on already on the booking; a concurrent second
-- request for the same key could pass the SELECT before either INSERT
-- committed. The route now does a guarded INSERT ... ON CONFLICT DO NOTHING,
-- which needs this unique constraint as its conflict target.
DO $$ BEGIN
  ALTER TABLE booking_addons ADD CONSTRAINT booking_addons_booking_key_unique UNIQUE (booking_id, addon_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- ─── bookings: reject an exact duplicate double-submit ───────────────────────
-- A double-click/double-tap on "Book now" sends two identical POST / requests.
-- Both can pass the per-request logic (each is a fresh row) and create two
-- bookings for the same customer, address, and time slot (and, downstream,
-- two PaymentIntents). A partial unique index on the natural key for
-- non-terminal bookings makes the second insert fail with 23505, which the
-- route now catches and returns the first (already-created) booking instead.
-- COALESCE folds NULL address_id into a fixed sentinel so two NULL-address
-- bookings for the same customer/time are still treated as duplicates (by
-- default NULLs compare as distinct and would not collide).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_customer_slot_active
  ON bookings (
    customer_id,
    COALESCE(address_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scheduled_at
  )
  WHERE status NOT IN ('cancelled_by_customer', 'cancelled_by_cleaner', 'cancelled', 'refunded');
