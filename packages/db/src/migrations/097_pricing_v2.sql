-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- All Rights Reserved.
--
-- Proprietary and Confidential.
--
-- Unauthorized copying, modification, disclosure,
-- distribution, reverse engineering, or use is prohibited.

-- Pricing v2: ONE authoritative, versioned quote service (labor-minutes
-- model with ordinal room-condition inference) replacing the five parallel
-- pricing formulas. See docs/PRICING_V2.md.
--
-- Rollout gate: the v2 engine only prices customer bookings once an admin
-- PUBLISHES a pricing version to Active for the booking's service area and
-- currency. Until then every existing path behaves exactly as before, so
-- deploying this migration changes no prices.
--
-- Money: integer cents. Durations: integer minutes. The full engine
-- configuration (labor matrix, clutter/size adjustments, extras, rates,
-- payout, scheduling, inference parameters) is snapshotted whole into
-- `config` JSONB per version — published versions are immutable (enforced
-- at the API layer; editing clones a new draft).

CREATE TABLE IF NOT EXISTS pricing_versions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,
  service_area           TEXT        NOT NULL DEFAULT 'default',
  currency               TEXT        NOT NULL DEFAULT 'USD',
  status                 TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'superseded', 'archived')),
  -- Full engine configuration snapshot (shape: PricingConfigV2 in
  -- apps/api/src/lib/quoteEngine/types.ts).
  config                 JSONB       NOT NULL,
  -- Provenance of the inference parameters: cold_start | learned | blended.
  inference_provenance   TEXT        NOT NULL DEFAULT 'cold_start',
  source_version_id      UUID        REFERENCES pricing_versions(id) ON DELETE SET NULL,
  change_summary         TEXT,
  -- Result of the last server-side validation run ({ok, errors[], warnings[]}).
  validation             JSONB,
  effective_at           TIMESTAMPTZ,
  effective_end          TIMESTAMPTZ,
  created_by_clerk_id    TEXT,
  published_by_clerk_id  TEXT,
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Exactly one Active version per (service_area, currency) at any instant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_versions_one_active
  ON pricing_versions(service_area, currency) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pricing_versions_status ON pricing_versions(status);
CREATE INDEX IF NOT EXISTS idx_pricing_versions_scheduled
  ON pricing_versions(effective_at) WHERE status = 'scheduled';

-- Immutable quote snapshots. Every v2 quote shown to a customer (or used at
-- checkout) is persisted here; bookings reference the exact snapshot so a
-- later pricing change can never rewrite what a customer accepted.
CREATE TABLE IF NOT EXISTS pricing_quotes_v2 (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_version_id     UUID        NOT NULL REFERENCES pricing_versions(id),
  -- Normalized input (rooms, conditions, clutter, counts-by-level overrides,
  -- sqft, extras, schedule, promo ids) and the complete engine result
  -- (components, inference breakdown, minutes, money, warnings).
  input                  JSONB       NOT NULL,
  result                 JSONB       NOT NULL,
  currency               TEXT        NOT NULL DEFAULT 'USD',
  total_cents            INT         NOT NULL,
  expected_labor_minutes INT         NOT NULL,
  scheduled_labor_minutes INT        NOT NULL,
  fingerprint            TEXT        NOT NULL,
  manual_review_required BOOLEAN     NOT NULL DEFAULT FALSE,
  customer_id            UUID        REFERENCES customers(id) ON DELETE SET NULL,
  consumed_by_booking_id UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_v2_created ON pricing_quotes_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_v2_customer ON pricing_quotes_v2(customer_id);

-- Append-only audit trail for the pricing workspace (draft edits, validation
-- runs, simulations, scheduling, publication, rollback clones, overrides).
-- Deliberately separate from admin_audit_log so pricing history is complete,
-- exportable, and cheap to query on its own.
CREATE TABLE IF NOT EXISTS pricing_audit_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       UUID        REFERENCES pricing_versions(id) ON DELETE SET NULL,
  actor_clerk_id   TEXT,
  event            TEXT        NOT NULL,
  detail           JSONB       NOT NULL DEFAULT '{}',
  request_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_version ON pricing_audit_events(version_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_created ON pricing_audit_events(created_at DESC);

-- Bookings carry immutable references to the exact version + quote snapshot
-- that priced them (v2 path only; legacy bookings leave these NULL).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pricing_version_id UUID REFERENCES pricing_versions(id),
  ADD COLUMN IF NOT EXISTS pricing_quote_v2_id UUID REFERENCES pricing_quotes_v2(id);
