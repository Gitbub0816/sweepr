/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- ============================================================================
-- Retire the "Sweepr Coverage Program".
--
-- Sweepr does not provide insurance. Cleaners carry their own general
-- liability policy (bought wherever they like — the cleaner app links our
-- Coverdash affiliate page) and upload the certificate for admin review.
--
-- 013_insurance.sql defaulted cleaner_insurance.coverage_type to
-- 'sweepr_program', so any row inserted without an explicit type claimed a
-- program that never existed. Default to the only real option instead.
--
-- The enum VALUE is deliberately left in place: Postgres cannot drop one
-- without rewriting the type, and legacy rows may still reference it.
-- apps/api/src/lib/cleanerRequirements.ts treats such a row as NO coverage,
-- so nobody accepts jobs on the strength of a withdrawn program.
-- ============================================================================

ALTER TABLE cleaner_insurance
  ALTER COLUMN coverage_type SET DEFAULT 'personal_policy';

COMMENT ON COLUMN cleaner_insurance.coverage_type IS
  'Always personal_policy going forward. The legacy sweepr_program value is a withdrawn program that never put a policy in force and does not count as coverage.';
