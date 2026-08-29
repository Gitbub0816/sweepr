/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 098_yardstik_sor_monitoring.sql
-- Continuous Sex Offender Registry (SOR) monitoring for approved cleaners.
--
-- Once a cleaner's background check is APPROVED (yardstik_status = 'clear'),
-- we automatically enroll them in Yardstik's ongoing SOR monitoring package
-- (a second report ordered against the SAME existing candidate — Yardstik
-- reuses the PII the candidate already gave for the initial report). These
-- columns track that enrollment so it happens exactly once per cleaner.
--
-- yardstik_sor_monitor_enrolled_at doubles as the claim-then-act lock:
-- enrollment claims the row by stamping this column before ordering the
-- monitor, so concurrent approval webhooks can't double-order.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS yardstik_sor_monitor_report_id  TEXT,
  ADD COLUMN IF NOT EXISTS yardstik_sor_monitor_enrolled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cleaners_yardstik_sor_monitor_report
  ON cleaners (yardstik_sor_monitor_report_id)
  WHERE yardstik_sor_monitor_report_id IS NOT NULL;

COMMENT ON COLUMN cleaners.yardstik_sor_monitor_report_id IS
  'Yardstik report ID of the ongoing SOR monitoring enrollment (distinct from yardstik_report_id, the initial screening report). NULL until the cleaner is approved and enrolled.';
COMMENT ON COLUMN cleaners.yardstik_sor_monitor_enrolled_at IS
  'When SOR continuous monitoring was enrolled after approval; also the claim-then-act lock preventing double enrollment.';
