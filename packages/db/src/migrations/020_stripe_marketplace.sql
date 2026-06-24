-- Migration 020: Stripe Connect Marketplace & Payout Administration

-- ─── Stripe Connected Accounts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_connected_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id            UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  stripe_account_id     TEXT NOT NULL UNIQUE,
  account_type          TEXT NOT NULL DEFAULT 'express' CHECK (account_type IN ('express', 'standard', 'custom')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'enabled', 'restricted', 'rejected', 'deauthorized')),
  charges_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted     BOOLEAN NOT NULL DEFAULT FALSE,
  capabilities          JSONB,
  requirements          JSONB,
  onboarding_url        TEXT,
  country               TEXT NOT NULL DEFAULT 'US',
  currency              TEXT NOT NULL DEFAULT 'usd',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_connected_accounts_cleaner ON stripe_connected_accounts(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_stripe_connected_accounts_status ON stripe_connected_accounts(status);

-- ─── Platform Fee Settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_fee_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type                 TEXT NOT NULL DEFAULT 'percentage' CHECK (fee_type IN ('percentage', 'flat', 'hybrid')),
  fee_value                NUMERIC(8,4) NOT NULL DEFAULT 20.0000,  -- percent or cents
  minimum_platform_fee     INTEGER NOT NULL DEFAULT 200,           -- cents
  maximum_platform_fee     INTEGER,                                -- cents; NULL = uncapped
  processing_fee_strategy  TEXT NOT NULL DEFAULT 'absorb' CHECK (processing_fee_strategy IN ('absorb', 'pass_through', 'split')),
  processing_fee_split_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,    -- % passed to customer when strategy=split
  reserve_percentage       NUMERIC(5,2) NOT NULL DEFAULT 0.00,    -- % held in reserve
  payout_delay_days        INTEGER NOT NULL DEFAULT 2,
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               UUID REFERENCES users(id),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default row
INSERT INTO platform_fee_settings (
  fee_type, fee_value, minimum_platform_fee, processing_fee_strategy, payout_delay_days, notes
) VALUES (
  'percentage', 20.0000, 200, 'absorb', 2, 'Default platform fee — 20% with 2-day payout delay'
) ON CONFLICT DO NOTHING;

-- ─── Payout Settings Audit ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payout_settings_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID NOT NULL REFERENCES users(id),
  setting_name  TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_settings_audit_actor ON payout_settings_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_payout_settings_audit_created ON payout_settings_audit(created_at DESC);

-- ─── Cleaner Tier Multipliers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cleaner_tier_multipliers (
  tier          TEXT PRIMARY KEY CHECK (tier IN ('standard', 'preferred', 'elite')),
  multiplier    NUMERIC(4,3) NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cleaner_tier_multipliers (tier, multiplier, label, description) VALUES
  ('standard',  1.000, 'Standard',  'Base payout rate'),
  ('preferred', 1.050, 'Preferred', '5% bonus for preferred cleaners'),
  ('elite',     1.100, 'Elite',     '10% bonus for elite cleaners')
ON CONFLICT (tier) DO NOTHING;

-- ─── Expand payouts.status ────────────────────────────────────────────────────
ALTER TABLE payouts
  DROP CONSTRAINT IF EXISTS payouts_status_check;

ALTER TABLE payouts
  ADD CONSTRAINT payouts_status_check CHECK (
    status IN ('pending','scheduled','transferred','paid','failed','canceled','held','disputed','refunded')
  );

-- Add missing columns to payouts
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS platform_fee        INTEGER,
  ADD COLUMN IF NOT EXISTS gross_amount        INTEGER,
  ADD COLUMN IF NOT EXISTS net_amount          INTEGER,
  ADD COLUMN IF NOT EXISTS fee_rate            NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS tier_multiplier     NUMERIC(4,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS stripe_payout_id    TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_for       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS held_reason         TEXT,
  ADD COLUMN IF NOT EXISTS dispute_id          TEXT,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_scheduled_for ON payouts(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_cleaner_id ON payouts(cleaner_id);
