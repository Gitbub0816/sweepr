-- Migration 031: make the database genuinely hard-deletable for GDPR/CCPA.
--
-- Recreates the key foreign keys with ON DELETE CASCADE so deleting a user row
-- actually removes all of their data (no orphans, no FK-restrict failures).
-- Also adds a non-PII deletion audit log so we can prove a deletion happened
-- without retaining any personal data.

-- Helper: drop whatever FK exists on (table, single column) and re-add it with
-- ON DELETE CASCADE pointing at <ref>(id). Idempotent / safe to re-run.
CREATE OR REPLACE FUNCTION _recreate_fk_cascade(p_table regclass, p_column text, p_ref regclass)
RETURNS void AS $$
DECLARE cname text;
BEGIN
  IF to_regclass(p_table::text) IS NULL OR to_regclass(p_ref::text) IS NULL THEN RETURN; END IF;
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE contype = 'f' AND conrelid = p_table
    AND conkey = (SELECT array_agg(attnum)
                  FROM pg_attribute
                  WHERE attrelid = p_table AND attname = p_column AND NOT attisdropped);
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, cname);
  END IF;
  EXECUTE format(
    'ALTER TABLE %s ADD FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE CASCADE',
    p_table, p_column, p_ref
  );
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RETURN; -- table/column not present on this DB — skip
END$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Direct children of users
  PERFORM _recreate_fk_cascade('customers', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('cleaners', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('addresses', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('notifications', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('data_subject_requests', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('consent_log', 'user_id', 'users');
  PERFORM _recreate_fk_cascade('device_tokens', 'user_id', 'users');

  -- Bookings + their dependents
  PERFORM _recreate_fk_cascade('bookings', 'customer_id', 'customers');
  PERFORM _recreate_fk_cascade('bookings', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('bookings', 'address_id', 'addresses');
  PERFORM _recreate_fk_cascade('payments', 'booking_id', 'bookings');
  PERFORM _recreate_fk_cascade('reviews', 'booking_id', 'bookings');
  PERFORM _recreate_fk_cascade('reviews', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('reviews', 'customer_id', 'customers');
  PERFORM _recreate_fk_cascade('booking_addons', 'booking_id', 'bookings');
  PERFORM _recreate_fk_cascade('payouts', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('payouts', 'booking_id', 'bookings');
  PERFORM _recreate_fk_cascade('subscriptions', 'customer_id', 'customers');

  -- Cleaner-scoped data
  PERFORM _recreate_fk_cascade('cleaner_training_progress', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('cleaner_quiz_attempts', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('cleaner_insurance', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('stripe_connected_accounts', 'cleaner_id', 'cleaners');
  PERFORM _recreate_fk_cascade('payout_ledger', 'cleaner_id', 'cleaners');
END$$;

DROP FUNCTION IF EXISTS _recreate_fk_cascade(regclass, text, regclass);

-- Non-PII deletion audit (proves a deletion happened; stores no personal data).
CREATE TABLE IF NOT EXISTS account_deletion_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash  TEXT,                       -- sha256(email); never the raw email
  scope       TEXT NOT NULL,              -- 'pii' | 'account' | 'account_and_data'
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
