/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 081_yardstik.sql
-- Background check provider migration: Checkr → Yardstik.
--
-- Adds a parallel set of yardstik_* columns rather than renaming the
-- checkr_* ones, so existing Checkr history on already-screened cleaners is
-- never touched or lost. New checks are written to the yardstik_* columns;
-- application code now reads only those. yardstik_status stores our
-- normalized status vocabulary (same values Checkr used: not_started,
-- invited, pending, consider, clear, dispute, pre_adverse_action,
-- adverse_action, suspended) — Yardstik's own report-status strings are
-- mapped onto this set in lib/yardstik.ts so no downstream comparison code
-- had to change.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS yardstik_candidate_id  TEXT,
  ADD COLUMN IF NOT EXISTS yardstik_report_id      TEXT,
  ADD COLUMN IF NOT EXISTS yardstik_status         TEXT NOT NULL DEFAULT 'not_started'
    CHECK (yardstik_status IN (
      'not_started', 'invited', 'pending', 'consider', 'clear',
      'suspended', 'dispute', 'pre_adverse_action', 'adverse_action'
    )),
  ADD COLUMN IF NOT EXISTS yardstik_invited_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS yardstik_completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS yardstik_pre_adverse_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cleaners_yardstik_candidate
  ON cleaners (yardstik_candidate_id)
  WHERE yardstik_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cleaners_yardstik_report
  ON cleaners (yardstik_report_id)
  WHERE yardstik_report_id IS NOT NULL;

COMMENT ON COLUMN cleaners.yardstik_candidate_id IS
  'Yardstik candidate resource ID.';
COMMENT ON COLUMN cleaners.yardstik_report_id IS
  'Yardstik report resource ID (also passed back as resource_id on report.* webhooks).';
COMMENT ON COLUMN cleaners.yardstik_status IS
  'Normalized status (see lib/yardstik.ts mapReportStatus) — not a raw Yardstik status string.';
COMMENT ON COLUMN cleaners.yardstik_pre_adverse_at IS
  'When the FCRA pre-adverse-action notice was sent; final adverse action follows Yardstik''s own waiting-period timer.';
