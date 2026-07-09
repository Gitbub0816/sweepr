/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 083: FCRA adverse-action support for adjudication cases.
--
-- A denied outcome (engine auto_deny or a manual denial) must NOT finalize
-- immediately. It first enters a 'pre_adverse_action' state: the applicant is
-- sent the FCRA pre-adverse notice (the CRA notice is triggered via Yardstik
-- where a report exists) and a statutory waiting period must elapse before the
-- decision may be finalized to 'denied'. This column records when the
-- pre-adverse notice was issued so the waiting period can be enforced
-- server-side (see adverseActionEarliestDate in apps/api/src/lib/yardstik.ts).

ALTER TABLE adjudication_cases
  ADD COLUMN IF NOT EXISTS pre_adverse_at TIMESTAMPTZ;

COMMENT ON COLUMN adjudication_cases.pre_adverse_at IS
  'When the FCRA pre-adverse notice was issued; final denial is gated until the waiting period elapses.';
