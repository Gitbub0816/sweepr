-- 071_mail_security_rework.sql
-- Security event telemetry + problem-centric ticket telemetry + mail center folders.

CREATE TABLE IF NOT EXISTS security_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type   TEXT        NOT NULL CHECK (event_type IN (
    'auth_failure','rate_limit_exceeded','webhook_signature_failure',
    'brute_force_suspected','forbidden_access','other'
  )),
  severity     TEXT        NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  ip           TEXT,
  path         TEXT,
  method       TEXT,
  clerk_id     TEXT,
  user_agent   TEXT,
  country      TEXT,
  region       TEXT,
  city         TEXT,
  colo         TEXT,
  asn          TEXT,
  details      JSONB       NOT NULL DEFAULT '{}',
  resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip   ON security_events (ip, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type, occurred_at DESC);
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Reporter telemetry on tickets (populated only with tracking consent).
ALTER TABLE it_tickets       ADD COLUMN IF NOT EXISTS reporter_ip TEXT;
ALTER TABLE it_tickets       ADD COLUMN IF NOT EXISTS reporter_user_agent TEXT;
ALTER TABLE it_tickets       ADD COLUMN IF NOT EXISTS reporter_geo JSONB;
ALTER TABLE it_tickets       ADD COLUMN IF NOT EXISTS reporter_device JSONB;
ALTER TABLE it_tickets       ADD COLUMN IF NOT EXISTS telemetry_consent BOOLEAN;
ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS reporter_ip TEXT;
ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS reporter_user_agent TEXT;
ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS reporter_geo JSONB;
ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS reporter_device JSONB;
ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS telemetry_consent BOOLEAN;

-- Mail center: archive + cc support.
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS cc_email TEXT;
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_dir ON mailbox_messages (mailbox, direction, created_at DESC);
