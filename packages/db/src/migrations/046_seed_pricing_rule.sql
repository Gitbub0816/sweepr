-- Migration 046: Seed initial active SWEEPR_PRICING rule.
--
-- Adds config_json column (if absent) and inserts the canonical SWEEPR_PRICING
-- spec as the single active rule. All money values are integer cents.
-- Skipped if an active rule already exists.

ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS config_json JSONB;

INSERT INTO pricing_rules (
  name,
  description,
  status,
  config_json,

  -- Legacy column values kept in sync so old engine paths still work
  base_fee_cents,
  minimum_booking_price_cents,
  bedrooms_included_in_base,
  price_per_extra_bedroom_cents,
  bathrooms_included_in_base,
  price_per_extra_bathroom_cents,
  half_bathroom_price_cents,
  sqft_pricing_enabled,
  sqft_included_in_base,
  sqft_overage_rate_cents_per_sqft,
  service_type_multiplier_json,
  pet_pricing_enabled,
  pet_base_fee_cents,
  rounding_enabled,
  rounding_strategy,
  rounding_ending_cents,

  active_from,
  version,
  created_by
)
SELECT
  'SWEEPR Pricing v1',
  'Canonical SWEEPR_PRICING spec. config_json is the source of truth; legacy columns mirror standard-service values for backwards compat.',
  'active',

  '{
    "platform": {
      "stripePercent": 0.029,
      "stripeFixed": 30,
      "roundToCharmPrice": true
    },
    "baseByServiceType": {
      "light":              7900,
      "standard":          10900,
      "deep":              16900,
      "move_in_out":       21900,
      "post_construction": 28900,
      "recurring":         10900,
      "vacation_rental":   10900
    },
    "sqftPricing": {
      "includedSqft": {
        "light": 700, "standard": 900, "deep": 900,
        "move_in_out": 1000, "post_construction": 1000,
        "recurring": 900, "vacation_rental": 900
      },
      "pricePerExtraSqft": {
        "light": 4.5, "standard": 6.0, "deep": 9.0,
        "move_in_out": 11.0, "post_construction": 14.0,
        "recurring": 6.0, "vacation_rental": 6.0
      }
    },
    "roomPricing": {
      "includedBedrooms": 1,
      "includedBathrooms": 1,
      "bedroom": {
        "light": 1200, "standard": 1800, "deep": 2800,
        "move_in_out": 3400, "post_construction": 4200,
        "recurring": 1800, "vacation_rental": 1800
      },
      "bathroom": {
        "light": 1800, "standard": 2800, "deep": 4200,
        "move_in_out": 5200, "post_construction": 6500,
        "recurring": 2800, "vacation_rental": 2800
      }
    },
    "propertyTypeMultiplier": {
      "studio": 0.90,
      "apartment": 0.95,
      "condo": 1.0,
      "townhouse": 1.05,
      "house": 1.1,
      "large_house": 1.2
    },
    "conditionMultipliers": {
      "pets": 1.08,
      "heavySoil": 1.20,
      "lotsOfClutter": 1.15,
      "smokerHome": 1.18
    },
    "minimums": {
      "light":              7900,
      "standard":          10900,
      "deep":              16900,
      "move_in_out":       21900,
      "post_construction": 28900,
      "recurring":         10900,
      "vacation_rental":   10900
    },
    "cleanerPayout": {
      "defaultPercent": 0.65,
      "byServiceType": {
        "light": 0.62,
        "standard": 0.65,
        "deep": 0.68,
        "move_in_out": 0.70,
        "post_construction": 0.72,
        "recurring": 0.65,
        "vacation_rental": 0.65
      }
    }
  }'::jsonb,

  -- Legacy columns (standard service values)
  10900,  -- $109 standard base
  10900,  -- $109 minimum
  1,      -- 1 bedroom included
  1800,   -- $18 per extra bedroom
  1,      -- 1 bathroom included
  2800,   -- $28 per extra bathroom
  1400,   -- $14 half bath
  TRUE,
  900,    -- 900 sqft included
  6,      -- $0.06/sqft
  '{"standard": 100, "deep": 155, "move_in_out": 201, "post_construction": 265, "recurring": 100, "vacation_rental": 100}'::jsonb,
  TRUE,
  0,      -- pet fee handled via condition multiplier in config_json
  TRUE,
  'end_in_9',
  900,

  NOW(),
  1,
  'system_seed'
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rules WHERE status = 'active'
);

-- Seed add-ons tied to the newly inserted rule
INSERT INTO pricing_addons (pricing_rule_id, addon_key, addon_name, price_cents, is_active)
SELECT
  pr.id,
  a.addon_key,
  a.addon_name,
  a.price_cents,
  TRUE
FROM pricing_rules pr
CROSS JOIN (VALUES
  ('inside_fridge',         'Inside Fridge',          2900),
  ('inside_oven',           'Inside Oven',             3400),
  ('interior_windows',      'Interior Windows',        3900),
  ('inside_cabinets',       'Inside Cabinets',         4900),
  ('laundry',               'Laundry',                 2400),
  ('dishes',                'Dishes',                  2400),
  ('garage_sweep',          'Garage Sweep',            2900),
  ('patio_sweep',           'Patio Sweep',             2400),
  ('baseboards',            'Baseboards',              3900),
  ('walls_spot_cleaning',   'Wall Spot Cleaning',      3400),
  ('pet_hair_detail',       'Pet Hair Detail',         3900),
  ('extra_bathroom_detail', 'Extra Bathroom Detail',   2400),
  ('organization_light',    'Light Organization',      4900)
) AS a(addon_key, addon_name, price_cents)
WHERE pr.created_by = 'system_seed'
  AND pr.version = 1
  AND NOT EXISTS (
    SELECT 1 FROM pricing_addons pa WHERE pa.pricing_rule_id = pr.id AND pa.addon_key = a.addon_key
  );
