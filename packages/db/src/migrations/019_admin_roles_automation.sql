-- Admin sub-roles: granular permissions within the admin interface.
-- 'admin_role' is only set for users whose 'role' is 'admin' or 'super_admin'.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_role TEXT
    CHECK (admin_role IN ('super_admin','admin','ops','finance','trainer','support'));

-- Carry the role on invites so the right access is granted on accept.
ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS admin_role TEXT NOT NULL DEFAULT 'admin'
    CHECK (admin_role IN ('super_admin','admin','ops','finance','trainer','support'));

-- Automation execution log — one row per run, cron or admin-triggered.
CREATE TABLE IF NOT EXISTS automation_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      TEXT        NOT NULL,
  triggered_by  TEXT        NOT NULL DEFAULT 'cron',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed')),
  result        JSONB       NOT NULL DEFAULT '{}',
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_auto_runs_type    ON automation_runs(job_type);
CREATE INDEX IF NOT EXISTS idx_auto_runs_started ON automation_runs(started_at DESC);

-- Payment capture queue — tracks which completed bookings need PI capture.
CREATE TABLE IF NOT EXISTS payment_capture_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_intent_id TEXT    NOT NULL,
  amount_cents  BIGINT      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','captured','failed','skipped')),
  attempts      INT         NOT NULL DEFAULT 0,
  last_error    TEXT,
  queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ,
  UNIQUE(booking_id)
);
CREATE INDEX IF NOT EXISTS idx_cap_queue_status  ON payment_capture_queue(status);
CREATE INDEX IF NOT EXISTS idx_cap_queue_queued  ON payment_capture_queue(queued_at DESC);

-- Reminder log — prevents double-sending.
CREATE TABLE IF NOT EXISTS booking_reminders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type TEXT      NOT NULL,  -- '24h_customer','24h_cleaner','1h_customer'
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, reminder_type)
);
