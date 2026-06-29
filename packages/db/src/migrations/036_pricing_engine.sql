-- Migration 036: Algorithmic Cleaning Pricing.
--
-- Versioned pricing rules, add-ons, stored quotes, and a pricing-change approval
-- flow (parallel to the fee approval engine but kept separate for clarity).
-- Bookings store the exact pricing rule version + quote snapshot used.

-- ── Versioned pricing rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  market_city TEXT,
  market_state TEXT,
  market_zip TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','active','superseded','archived')),
  currency TEXT NOT NULL DEFAULT 'USD',

  base_fee_cents INTEGER NOT NULL DEFAULT 0,
  minimum_booking_price_cents INTEGER NOT NULL DEFAULT 0,
  maximum_booking_price_cents INTEGER,

  sqft_pricing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sqft_included_in_base INTEGER DEFAULT 750,
  sqft_tiers_json JSONB,                 -- [{ "max": 1000, "add_cents": 2000 }, ...]
  sqft_overage_rate_cents_per_sqft INTEGER,
  sqft_custom_quote_threshold INTEGER,

  bedrooms_included_in_base INTEGER DEFAULT 1,
  price_per_extra_bedroom_cents INTEGER DEFAULT 0,
  bedroom_tiers_json JSONB,

  bathrooms_included_in_base NUMERIC DEFAULT 1,
  price_per_extra_bathroom_cents INTEGER DEFAULT 0,
  half_bathroom_price_cents INTEGER DEFAULT 0,
  bathroom_tiers_json JSONB,

  distance_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  free_distance_miles NUMERIC DEFAULT 0,
  price_per_mile_cents INTEGER DEFAULT 0,
  distance_calculation_origin TEXT,
  maximum_service_distance_miles NUMERIC,
  long_distance_surcharge_cents INTEGER,

  property_type_adjustments_json JSONB,   -- { "apartment": 0, "townhouse": 500, ... } (bps or cents? -> bps)
  service_type_multiplier_json JSONB,     -- { "standard": 100, "deep": 145, ... } (percent x100)
  service_type_fixed_surcharge_json JSONB,
  intensity_multiplier_json JSONB,        -- { "light": 90, "normal": 100, ... }

  pet_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pet_base_fee_cents INTEGER DEFAULT 0,
  price_per_pet_cents INTEGER DEFAULT 0,
  max_pet_count_before_custom_quote INTEGER,

  urgency_pricing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  urgency_rules_json JSONB,               -- { "same_day": 120, "next_day": 110, ... } (percent x100)

  recurring_discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_discount_json JSONB,          -- { "weekly_bps": 1500, "biweekly_bps": 1000, "monthly_bps": 500 }

  rounding_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rounding_strategy TEXT DEFAULT 'end_in_9',
  rounding_increment_cents INTEGER DEFAULT 1000,
  rounding_ending_cents INTEGER DEFAULT 900,

  maximum_auto_quote_price_cents INTEGER,
  requires_custom_quote_above_cents INTEGER,
  max_discount_bps INTEGER,
  max_dynamic_adjustment_bps INTEGER,

  active_from TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_rule_id UUID REFERENCES pricing_rules(id),
  created_by TEXT NOT NULL,
  approved_proposal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_status ON pricing_rules (status);

-- ── Add-ons (versioned with the rule) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_rule_id UUID REFERENCES pricing_rules(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  addon_description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER,
  cleaner_payout_adjustment_cents INTEGER,
  requires_customer_disclosure BOOLEAN NOT NULL DEFAULT FALSE,
  requires_cleaner_acknowledgement BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_addons_rule ON pricing_addons (pricing_rule_id);

-- ── Stored quotes (snapshot used by a booking) ───────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  booking_id UUID,
  pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id),
  pricing_rule_version INTEGER NOT NULL,
  quote_input_json JSONB NOT NULL,
  quote_output_json JSONB NOT NULL,
  customer_total_cents INTEGER NOT NULL,
  estimated_cleaner_payout_cents INTEGER,
  estimated_platform_revenue_cents INTEGER,
  requires_custom_quote BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_booking ON pricing_quotes (booking_id);

-- ── Pricing change proposals (approval workflow) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id) ON DELETE CASCADE,
  proposer_clerk_id TEXT NOT NULL,
  proposer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  internal_notes TEXT,
  external_notice_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','collaboration','approved','cooldown',
      'notice_scheduled','notice_sent','effective','declined','expired_declined',
      'cancelled','revoked')),
  proposed_effective_at TIMESTAMPTZ NOT NULL,
  response_deadline_at TIMESTAMPTZ NOT NULL,
  response_deadline_removed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  cooldown_started_at TIMESTAMPTZ,
  cooldown_expires_at TIMESTAMPTZ,
  notice_sent_at TIMESTAMPTZ,
  notice_period_ends_at TIMESTAMPTZ,
  final_effective_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_proposals_status ON pricing_change_proposals (status);

CREATE TABLE IF NOT EXISTS pricing_change_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES pricing_change_proposals(id) ON DELETE CASCADE,
  actor_clerk_id TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  comment TEXT,
  proposed_modification_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pricing_actions_proposal ON pricing_change_actions (proposal_id);

CREATE TABLE IF NOT EXISTS pricing_change_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES pricing_change_proposals(id) ON DELETE CASCADE,
  clerk_id TEXT NOT NULL,
  email TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_approve_final BOOLEAN NOT NULL DEFAULT TRUE,
  approved_final_at TIMESTAMPTZ,
  UNIQUE (proposal_id, clerk_id)
);

-- ── Booking quote snapshot columns ───────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pricing_quote_id UUID,
  ADD COLUMN IF NOT EXISTS pricing_rule_id UUID,
  ADD COLUMN IF NOT EXISTS pricing_rule_version INTEGER,
  ADD COLUMN IF NOT EXISTS pricing_line_items_json JSONB,
  ADD COLUMN IF NOT EXISTS estimated_cleaner_payout_cents INTEGER;
