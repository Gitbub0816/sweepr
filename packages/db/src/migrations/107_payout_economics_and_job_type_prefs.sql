/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 107_payout_economics_and_job_type_prefs.sql
--
-- Owner-decided payout economics (2026-09) + cleaner job-type preferences:
--   1. Marketplace Services Fee 20% → 30% (standard bookings split 70%
--      cleaner pool / 30% Sweepr; tips stay 100% to cleaner, outside the split).
--   2. Crew pool splits: two-cleaner 54/46 Lead/Support (was 60/40),
--      three-cleaner 36/32/32 (was 40/30/30). Patches any stored crew_config.
--   3. Team Cleans enabled NOW: every team_* flag row seeded to 'true'
--      (the code default is also ON for absent rows; admin can still turn off).
--   4. booking_price_ledger admits 'access_delay_fee' (non-cumulative
--      access-delay/lockout fee, allocated 80% cleaner team / 20% Sweepr at
--      payout — lib/accessDelayFee.ts).
--   5. cleaners.accepted_job_types — canonical job-type preferences over
--      {standard, move_in_out, vacation_rental}. Default = ALL types accepted,
--      so existing cleaners are unaffected (and become eligible for
--      move-in/out + turnover jobs the legacy preferred_service_types default
--      silently excluded them from). Deep Clean is auto-classified within
--      Standard and counts as 'standard' for preference purposes.

-- ─── 1. Marketplace Services Fee → 30% ───────────────────────────────────────
-- Insert a fresh ACTIVE row at 30%, carrying forward every other knob from the
-- most recent active row, then deactivate the superseded rows (history kept).
INSERT INTO platform_fee_settings (
  fee_type, fee_value, minimum_platform_fee, maximum_platform_fee,
  processing_fee_strategy, processing_fee_split_pct, reserve_percentage,
  payout_delay_days, notes
)
SELECT
  'percentage', 30.0000, minimum_platform_fee, maximum_platform_fee,
  processing_fee_strategy, processing_fee_split_pct, reserve_percentage,
  payout_delay_days,
  'Marketplace Services Fee 30% (owner decision 2026-09; standard bookings split 70% cleaner / 30% Sweepr)'
FROM platform_fee_settings
WHERE NOT EXISTS (
  SELECT 1 FROM platform_fee_settings
  WHERE active = TRUE AND fee_type = 'percentage' AND fee_value = 30.0000
)
ORDER BY active DESC, effective_from DESC
LIMIT 1;

UPDATE platform_fee_settings
SET active = FALSE, updated_at = NOW()
WHERE active = TRUE
  AND NOT (fee_type = 'percentage' AND fee_value = 30.0000);

-- ─── 2. Crew pool splits 54/46 and 36/32/32 ──────────────────────────────────
-- The code default (DEFAULT_CREW_CONFIG) already carries the new splits; this
-- patches a stored crew_config row (written by the admin Crew Config page)
-- that would otherwise override with the old 60/40 / 40/30/30 values.
UPDATE site_settings
SET value = jsonb_set(
      jsonb_set(value::jsonb, '{payoutSplitByCrewSize,2}', '[54,46]'::jsonb),
      '{payoutSplitByCrewSize,3}', '[36,32,32]'::jsonb
    )::text,
    updated_at = NOW()
WHERE key = 'crew_config'
  AND value::jsonb ? 'payoutSplitByCrewSize';

-- ─── 3. Team Cleans flags ON ─────────────────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('team_cleans_enabled', 'true'),
  ('team_auto_crew_sizing_enabled', 'true'),
  ('team_auto_crew_matching_enabled', 'true'),
  ('team_task_allocation_enabled', 'true'),
  ('team_preferred_teammates_enabled', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();

-- ─── 4. Ledger event type for access-delay/lockout fees ──────────────────────
ALTER TABLE booking_price_ledger DROP CONSTRAINT IF EXISTS booking_price_ledger_event_type_check;
ALTER TABLE booking_price_ledger ADD CONSTRAINT booking_price_ledger_event_type_check
  CHECK (event_type IN (
    'initial_quote', 'addon_purchase', 'level_surcharge', 'additional_attention_fee',
    'refusal_fee', 'admin_adjustment', 'tax_adjustment', 'coupon_discount',
    'smart_entry_fee', 'membership_discount', 'quote_refresh', 'access_delay_fee'
  ));

-- ─── 5. Cleaner job-type preferences ─────────────────────────────────────────
-- Canonical job types match how the quote engine maps wire service types:
-- move_in_out → move_in_out, vacation_rental → vacation_rental, everything
-- else (standard, deep, recurring, …) → standard. Matching (solo + crew)
-- hard-filters on this column; at least one accepted type is required
-- (enforced by the CHECK and by zod at the API).
ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS accepted_job_types TEXT[] NOT NULL
    DEFAULT ARRAY['standard','move_in_out','vacation_rental']::TEXT[];

ALTER TABLE cleaners DROP CONSTRAINT IF EXISTS cleaners_accepted_job_types_check;
ALTER TABLE cleaners ADD CONSTRAINT cleaners_accepted_job_types_check
  CHECK (
    cardinality(accepted_job_types) >= 1
    AND accepted_job_types <@ ARRAY['standard','move_in_out','vacation_rental']::TEXT[]
  );
