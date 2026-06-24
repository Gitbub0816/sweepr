-- 014_schema_alignment.sql
-- Aligns the live DB with columns the API code references.
-- Idempotent — safe to run multiple times.
--
-- Root cause of the "no data in admin dashboard" bug: the admin queries
-- referenced columns that never existed in the schema, so every admin
-- endpoint threw and the console rendered empty.

-- Cleaner location (admin console + day-of-service display).
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS city  TEXT;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS state TEXT;

-- Stripe Connect onboarding status surfaced in the admin cleaners table.
-- One of: 'not_started' | 'pending' | 'active' | 'restricted' | 'rejected'
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT DEFAULT 'not_started';

-- Backfill a sensible status from existing connect IDs.
UPDATE cleaners
   SET stripe_connect_status = 'pending'
 WHERE stripe_connect_id IS NOT NULL
   AND (stripe_connect_status IS NULL OR stripe_connect_status = 'not_started');

-- The payments table stores cents in `amount`. Some code referenced
-- `amount_cents`; rather than duplicate the column we keep `amount` as the
-- single source of truth (the API has been corrected to match). This block
-- only runs if a stray `amount_cents` column was created by hand — it folds
-- the data back into `amount` and drops the duplicate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'amount_cents'
  ) THEN
    UPDATE payments SET amount = COALESCE(amount, amount_cents) WHERE amount IS NULL;
    ALTER TABLE payments DROP COLUMN amount_cents;
  END IF;
END $$;

-- Helpful indexes for the admin dashboard aggregations.
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_cleaners_status ON cleaners(status);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
