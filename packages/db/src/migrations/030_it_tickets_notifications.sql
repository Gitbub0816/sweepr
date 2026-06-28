-- Migration 030: IT ticketing system + notification settings.

-- ── IT tickets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS it_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number  BIGSERIAL UNIQUE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('bug','billing','account','technical','feature_request','safety','other')),
  priority       TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status         TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  source         TEXT NOT NULL DEFAULT 'user_report'
    CHECK (source IN ('user_report','error','admin')),
  app            TEXT,                         -- customer | cleaner | admin | api | service
  reporter_clerk_id TEXT,
  reporter_email TEXT,
  assigned_to    TEXT,                          -- admin clerk id
  related_error_id UUID REFERENCES error_logs(id) ON DELETE SET NULL,
  context        JSONB NOT NULL DEFAULT '{}',
  due_at         TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_it_tickets_status   ON it_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_it_tickets_due      ON it_tickets (due_at) WHERE status IN ('open','in_progress');
CREATE INDEX IF NOT EXISTS idx_it_tickets_reporter ON it_tickets (reporter_clerk_id);

CREATE TABLE IF NOT EXISTS it_ticket_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES it_tickets(id) ON DELETE CASCADE,
  author_clerk_id TEXT,
  author_email TEXT,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_it_ticket_comments_ticket ON it_ticket_comments (ticket_id, created_at);

-- ── Notification settings ────────────────────────────────────────────────────
-- One row per notification event key. The full catalog of available events lives
-- in code; this table stores the admin on/off override per event.
CREATE TABLE IF NOT EXISTS notification_settings (
  event_key   TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- ── Add the "it" admin role to the existing CHECK constraints ─────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_role_check;
ALTER TABLE users ADD CONSTRAINT users_admin_role_check
  CHECK (admin_role IN ('super_admin','admin','ops','finance','trainer','support','it'));

ALTER TABLE admin_invites DROP CONSTRAINT IF EXISTS admin_invites_admin_role_check;
ALTER TABLE admin_invites ADD CONSTRAINT admin_invites_admin_role_check
  CHECK (admin_role IN ('super_admin','admin','ops','finance','trainer','support','it'));
