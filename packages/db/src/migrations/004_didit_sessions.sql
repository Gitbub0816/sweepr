-- Migration 004: Didit hosted verification + missing Checkr report id
--
-- Didit owns all ID document / biometric data. Sweepr stores only the opaque
-- session id and the resulting decision status — never document images or PII.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS didit_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (didit_status IN (
      'not_started','pending','in_review','approved','declined','expired'
    )),
  -- checkr_report_id is referenced by the Checkr routes but was missing.
  ADD COLUMN IF NOT EXISTS checkr_report_id TEXT;

-- Index for Didit webhook lookups by session id.
CREATE INDEX IF NOT EXISTS idx_cleaners_didit_verification
  ON cleaners (didit_verification_id)
  WHERE didit_verification_id IS NOT NULL;

COMMENT ON COLUMN cleaners.didit_verification_id IS
  'Didit hosted session id. No document/biometric PII stored — Didit owns it.';
COMMENT ON COLUMN cleaners.didit_status IS
  'Lifecycle: not_started → pending → in_review → approved|declined|expired';
COMMENT ON COLUMN cleaners.checkr_report_id IS
  'Checkr report id from report.created webhook. No PII stored.';
