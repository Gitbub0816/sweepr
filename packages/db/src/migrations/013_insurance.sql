-- 013_insurance.sql
-- Cleaner insurance module: Sweepr Coverage Program vs personal policy upload

CREATE TYPE insurance_coverage_type AS ENUM ('sweepr_program', 'personal_policy');
CREATE TYPE insurance_policy_status AS ENUM (
  'pending_upload',   -- cleaner hasn't uploaded anything yet
  'pending_review',   -- document uploaded, awaiting admin review
  'active',           -- approved and not expired
  'expiring_soon',    -- within 30 days of expiry
  'expired',          -- past expiry date
  'rejected'          -- admin rejected the document
);

CREATE TABLE IF NOT EXISTS cleaner_insurance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id          UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,

  coverage_type       insurance_coverage_type NOT NULL DEFAULT 'sweepr_program',

  -- Sweepr Coverage Program (Stripe subscription)
  stripe_subscription_id TEXT,
  program_active_since   TIMESTAMPTZ,
  program_cancelled_at   TIMESTAMPTZ,

  -- Personal policy fields (cleaner uploads their own COI / declarations page)
  policy_status       insurance_policy_status NOT NULL DEFAULT 'pending_upload',
  policy_number       TEXT,
  insurer_name        TEXT,
  coverage_amount_usd INTEGER,         -- e.g. 1000000 for $1M
  policy_expires_at   TIMESTAMPTZ,
  doc_storage_key     TEXT,            -- R2 key of the uploaded PDF/image
  doc_uploaded_at     TIMESTAMPTZ,
  review_notes        TEXT,            -- admin rejection reason or approval note
  reviewed_by         TEXT,            -- admin clerk_id
  reviewed_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cleaner_id)
);

-- Audit trail for status changes
CREATE TABLE IF NOT EXISTS insurance_status_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id    UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  previous_status insurance_policy_status,
  new_status      insurance_policy_status NOT NULL,
  changed_by      TEXT,  -- clerk_id of actor (admin or system)
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for expiry-check cron jobs
CREATE INDEX IF NOT EXISTS idx_cleaner_insurance_expires
  ON cleaner_insurance (policy_expires_at)
  WHERE policy_status IN ('active', 'expiring_soon');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'cleaner_insurance_updated_at'
  ) THEN
    CREATE TRIGGER cleaner_insurance_updated_at
      BEFORE UPDATE ON cleaner_insurance
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
