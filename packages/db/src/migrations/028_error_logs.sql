-- Migration 028: centralized error log feed for the admin dashboard.
--
-- Captures both server-side (API onError) and client-side (React error
-- boundaries / unhandled rejections) errors so admins have one place to see
-- what's breaking, where, and for whom. No request bodies or PII are stored —
-- only the error message, stack, and coarse request context.

CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT        NOT NULL DEFAULT 'server'   -- 'server' | 'client'
    CHECK (source IN ('server','client')),
  app          TEXT,                                    -- 'api','admin','customer','cleaner','marketing'
  level        TEXT        NOT NULL DEFAULT 'error'
    CHECK (level IN ('error','warn','fatal')),
  message      TEXT        NOT NULL,
  stack        TEXT,
  path         TEXT,                                    -- url / route path
  method       TEXT,
  status_code  INT,
  clerk_id     TEXT,
  user_id      UUID,
  request_id   TEXT,
  context      JSONB       NOT NULL DEFAULT '{}',
  resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_logs_occurred  ON error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON error_logs (occurred_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_app       ON error_logs (app);
