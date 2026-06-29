-- ─────────────────────────────────────────────────────────────────────────
-- 045_status_autodetect.sql
-- Auto-detection fields on status_incidents, moderate severity tier,
-- maintenance_windows table, faster error pattern detection index.
-- ─────────────────────────────────────────────────────────────────────────

-- Add moderate severity: drop + re-add CHECK constraint
ALTER TABLE status_incidents DROP CONSTRAINT IF EXISTS status_incidents_severity_check;
ALTER TABLE status_incidents ADD CONSTRAINT status_incidents_severity_check
  CHECK (severity IN ('minor','moderate','major','critical'));

-- Auto-detection metadata columns
ALTER TABLE status_incidents
  ADD COLUMN IF NOT EXISTS auto_detected       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_fingerprint   TEXT,
  ADD COLUMN IF NOT EXISTS affected_user_count INT,
  ADD COLUMN IF NOT EXISTS total_occurrences   INT;

-- Partial index so we can quickly find open auto-incidents by fingerprint
CREATE INDEX IF NOT EXISTS idx_status_incidents_fingerprint
  ON status_incidents (error_fingerprint)
  WHERE error_fingerprint IS NOT NULL AND status != 'resolved';

-- Scheduled maintenance windows
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  scheduled_start   TIMESTAMPTZ NOT NULL,
  scheduled_end     TIMESTAMPTZ NOT NULL,
  affected_services TEXT[]      NOT NULL DEFAULT '{}',
  status            TEXT        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_by        TEXT        NOT NULL DEFAULT 'system',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_upcoming
  ON maintenance_windows (scheduled_start)
  WHERE status IN ('scheduled','in_progress');

-- Fast error pattern detection index (level filter + time + user)
CREATE INDEX IF NOT EXISTS idx_error_logs_pattern
  ON error_logs (app, occurred_at DESC)
  WHERE level IN ('error','fatal') AND resolved = false;
