-- Migration 046: Seed initial active pricing rule.
--
-- Mirrors the hardcoded values in pricingEngine.ts so the DB becomes the
-- single source of truth. Skipped if an active rule already exists.

INSERT INTO pricing_rules (
  name,
  description,
  status,
  base_fee_cents,
  minimum_booking_price_cents,

  -- Bedroom pricing: $10/bedroom on top of base
  bedrooms_included_in_base,
  price_per_extra_bedroom_cents,

  -- Bathroom pricing: $15/full bath on top of base
  bathrooms_included_in_base,
  price_per_extra_bathroom_cents,
  half_bathroom_price_cents,

  -- Sqft pricing: free up to 1000 sqft, then $0.08/sqft
  sqft_pricing_enabled,
  sqft_included_in_base,
  sqft_overage_rate_cents_per_sqft,

  -- Service type multipliers (percent × 100; standard = 100 = 1.00×)
  -- deep ≈ 150%, move_in_out ≈ 200%, recurring ≈ 90%
  service_type_multiplier_json,

  -- Pet fee
  pet_pricing_enabled,
  pet_base_fee_cents,

  -- Rounding: end prices in $X.99
  rounding_enabled,
  rounding_strategy,
  rounding_ending_cents,

  -- Platform service fee: 8% added to customer total (applied in checkout)
  -- Not stored here — handled by platform_fee_settings table

  active_from,
  version,
  created_by
)
SELECT
  'Bay Area Standard',
  'Initial pricing rule seeded from pricingEngine.ts defaults. Standard base $99, deep $149, move-in/out $199, recurring $89.',
  'active',
  9900,   -- $99.00 standard base
  5900,   -- $59.00 minimum

  0,      -- bedrooms included in base
  1000,   -- $10.00 per bedroom

  0,      -- bathrooms included in base
  1500,   -- $15.00 per full bath
  750,    -- $7.50 per half bath

  TRUE,
  1000,   -- first 1000 sqft free
  8,      -- $0.08 per sqft above threshold

  -- Multipliers relative to standard base (standard = 10000 = 1.00×)
  '{"standard_cleaning": 10000, "deep_cleaning": 15051, "move_in_move_out": 20101, "short_term_rental_turnover": 15051, "post_construction": 20101}'::jsonb,

  TRUE,
  1500,   -- $15.00 pet base fee

  TRUE,
  'end_in_9',
  900,    -- end in $X.99

  NOW(),
  1,
  'system_seed'
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rules WHERE status = 'active'
);
