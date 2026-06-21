-- Migration 003: Checkr native invitation flow columns
-- Replaces any ad-hoc "submitted" stub with proper invitation tracking.
-- PII (SSN, DOB, address) is never stored here — Checkr owns it.

ALTER TABLE cleaners
  ADD COLUMN IF NOT EXISTS checkr_invitation_id   TEXT,
  ADD COLUMN IF NOT EXISTS checkr_status          TEXT NOT NULL DEFAULT 'not_started'
    CHECK (checkr_status IN (
      'not_started','invited','pending','consider','clear',
      'suspended','dispute','pre_adverse_action','adverse_action'
    )),
  ADD COLUMN IF NOT EXISTS checkr_invited_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkr_completed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkr_pre_adverse_at  TIMESTAMPTZ;

-- Index for webhook lookups by Checkr candidate id
CREATE INDEX IF NOT EXISTS idx_cleaners_checkr_candidate
  ON cleaners (checkr_candidate_id)
  WHERE checkr_candidate_id IS NOT NULL;

COMMENT ON COLUMN cleaners.checkr_candidate_id IS
  'Checkr-issued candidate ID. No PII stored — Checkr owns it.';
COMMENT ON COLUMN cleaners.checkr_invitation_id IS
  'Checkr invitation ID. Candidate completes PII on Checkr hosted form.';
COMMENT ON COLUMN cleaners.checkr_status IS
  'Lifecycle: not_started → invited → pending → clear|consider → [pre_]adverse_action';
COMMENT ON COLUMN cleaners.checkr_pre_adverse_at IS
  'Timestamp Checkr fired pre_adverse_action. Adverse action must wait 7+ calendar days (FCRA).';
