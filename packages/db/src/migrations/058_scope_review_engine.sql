/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 058: Scope review engine foundation.
--
-- Schema for the cleaning-level / scope-review-request system: cleaners can
-- flag a job as needing an "Additional Attention Fee" or as a full service
-- refusal, an AI pass triages the request, admins adjudicate the rest, and
-- every dollar change to a booking is recorded on an append-only price
-- ledger. Also adds customer account-status tracking, address greylisting,
-- cleaner privileges (per-cleaner ability to raise these requests), and
-- booking tips.
--
-- Money is stored in integer cents throughout.

-- ── Scope review requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scope_review_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  cleaner_id          UUID REFERENCES cleaners(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,

  request_type        TEXT NOT NULL CHECK (request_type IN ('additional_attention', 'refusal')),
  status               TEXT NOT NULL DEFAULT 'pending_ai'
    CHECK (status IN ('pending_ai', 'pending_admin', 'approved', 'denied', 'hard_denied', 'expired', 'cancelled')),

  selected_package    TEXT,
  selected_condition  TEXT,

  cleaner_notes       TEXT,
  refusal_reason       TEXT
    CHECK (refusal_reason IS NULL OR refusal_reason IN (
      'excessive_clutter', 'hoarding', 'unsafe_environment', 'biohazard',
      'animal_hazard', 'structural_hazard', 'inaccessible', 'scope_exceeded', 'other'
    )),

  ai_confidence        INT,
  ai_recommendation    TEXT,
  ai_response_json     JSONB,

  admin_decision       TEXT CHECK (admin_decision IS NULL OR admin_decision IN ('approved', 'denied', 'overridden_approved')),
  admin_id             TEXT,
  admin_decided_at     TIMESTAMPTZ,

  fee_code             TEXT
    CHECK (fee_code IS NULL OR fee_code IN (
      'none', 'additional_attention_small', 'additional_attention_medium',
      'additional_attention_large', 'refusal_fee'
    )),
  fee_amount_cents     INT,

  photos               JSONB NOT NULL DEFAULT '[]',

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scope_review_requests_booking ON scope_review_requests (booking_id);
CREATE INDEX IF NOT EXISTS idx_scope_review_requests_cleaner ON scope_review_requests (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_scope_review_requests_customer ON scope_review_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_scope_review_requests_status ON scope_review_requests (status);

-- Only one ACTIVE request per (booking, request_type) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scope_review_requests_active
  ON scope_review_requests (booking_id, request_type)
  WHERE status IN ('pending_ai', 'pending_admin');

-- ── Booking price ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_price_ledger (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type                TEXT NOT NULL
    CHECK (event_type IN (
      'initial_quote', 'addon_purchase', 'level_surcharge', 'additional_attention_fee',
      'refusal_fee', 'admin_adjustment', 'tax_adjustment'
    )),

  previous_total_cents      INT NOT NULL,
  adjustment_cents          INT NOT NULL,
  new_total_cents           INT NOT NULL,

  reason                    TEXT,
  source                    TEXT NOT NULL CHECK (source IN ('customer', 'cleaner_request', 'admin', 'system')),

  approved_by               TEXT,
  customer_consent_id       TEXT,
  scope_review_request_id   UUID REFERENCES scope_review_requests(id) ON DELETE SET NULL,

  stripe_payment_intent_id  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_price_ledger_booking ON booking_price_ledger (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_price_ledger_scope_review ON booking_price_ledger (scope_review_request_id);
CREATE INDEX IF NOT EXISTS idx_booking_price_ledger_event_type ON booking_price_ledger (event_type);

-- ── Cleaner privileges ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cleaner_privileges (
  cleaner_id                    UUID PRIMARY KEY REFERENCES cleaners(id) ON DELETE CASCADE,
  additional_attention_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  refusal_request_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  disabled_reason               TEXT,
  disabled_until                TIMESTAMPTZ,
  stats_window_start            TIMESTAMPTZ,
  stats_window_end              TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Address greylist ────────────────────────────────────────────────────────
-- normalized_key is computed in application code as
-- lower(trim(street_address)) || '|' || lower(trim(unit)) || '|' || zip
-- so that "3A" and "3B" at the same street/zip are treated as distinct
-- addresses.
CREATE TABLE IF NOT EXISTS address_greylist (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  street_address     TEXT NOT NULL,
  unit               TEXT NOT NULL DEFAULT '',
  city               TEXT,
  state              TEXT,
  zip                TEXT,
  latitude           DOUBLE PRECISION,
  longitude          DOUBLE PRECISION,
  normalized_key     TEXT NOT NULL,
  reason             TEXT,
  source_booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id        TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_address_greylist_normalized_key ON address_greylist (normalized_key);
CREATE INDEX IF NOT EXISTS idx_address_greylist_source_booking ON address_greylist (source_booking_id);

-- ── Booking tips ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_tips (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  cleaner_id                UUID REFERENCES cleaners(id) ON DELETE SET NULL,

  amount_cents              INT NOT NULL CHECK (amount_cents > 0),
  stripe_payment_intent_id  TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  visible_to_cleaner        BOOLEAN NOT NULL DEFAULT FALSE,
  paid_out_at               TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_tips_cleaner ON booking_tips (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_status ON booking_tips (status);

-- ── Customer account status ─────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'normal'
  CHECK (account_status IN ('normal', 'investigating', 'restricted', 'suspended', 'banned'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status_until TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_account_status ON customers (account_status);

-- ── Booking cleaning level ──────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cleaning_level TEXT
  CHECK (cleaning_level IS NULL OR cleaning_level IN ('refresh', 'extra_attention', 'significant_attention'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cleaning_level_surcharge_cents INT NOT NULL DEFAULT 0;

-- ── Pricing add-ons: package inclusion ──────────────────────────────────────
ALTER TABLE pricing_addons ADD COLUMN IF NOT EXISTS included_in_packages TEXT[] NOT NULL DEFAULT '{}';

-- ── Settings defaults (site_settings is a TEXT key/value store) ─────────────
INSERT INTO site_settings (key, value) VALUES
  ('scope_review.fee_additional_attention_small_cents', '2500'),
  ('scope_review.fee_additional_attention_medium_cents', '5000'),
  ('scope_review.fee_additional_attention_large_cents', '10000'),
  ('scope_review.refusal_fee_min_cents', '5000'),
  ('scope_review.refusal_fee_max_cents', '20000'),
  ('scope_review.refusal_fee_pct', '20'),
  ('scope_review.abuse_request_rate_pct', '70'),
  ('scope_review.abuse_denial_rate_pct', '70'),
  ('scope_review.abuse_min_jobs', '10'),
  ('scope_review.privilege_disable_days', '180'),
  ('scope_review.suspension_days', '180'),
  ('scope_review.investigating_days', '180'),
  ('scope_review.auto_cancel_on_high_confidence_refusal', 'false'),
  ('scope_review.level_surcharge_extra_attention_pct', '15'),
  ('scope_review.level_surcharge_significant_attention_pct', '35')
ON CONFLICT (key) DO NOTHING;
