-- Observability tables (Phase 1)

CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT        NOT NULL,
  session_id    TEXT,
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  user_role     TEXT,
  path          TEXT,
  referrer      TEXT,
  device_type   TEXT,
  country_code  TEXT,
  properties    JSONB       NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name       ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred   ON analytics_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user       ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session    ON analytics_events(session_id);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  method          TEXT        NOT NULL,
  path            TEXT        NOT NULL,
  status_code     INT         NOT NULL,
  duration_ms     INT,
  request_id      TEXT,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  user_role       TEXT,
  error_message   TEXT,
  cf_ray          TEXT,
  country_code    TEXT,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_logs_path       ON api_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_api_logs_status     ON api_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_logs_logged     ON api_request_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_user       ON api_request_logs(user_id);

CREATE TABLE IF NOT EXISTS payment_observability_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT        NOT NULL,
  booking_id        UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  amount_cents      BIGINT,
  currency          TEXT        NOT NULL DEFAULT 'usd',
  provider          TEXT        NOT NULL DEFAULT 'stripe',
  provider_event_id TEXT,
  success           BOOLEAN     NOT NULL,
  error_code        TEXT,
  error_message     TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pay_obs_type      ON payment_observability_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pay_obs_success   ON payment_observability_events(success);
CREATE INDEX IF NOT EXISTS idx_pay_obs_occurred  ON payment_observability_events(occurred_at DESC);

CREATE TABLE IF NOT EXISTS session_replay_refs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT        NOT NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  user_role       TEXT,
  provider        TEXT        NOT NULL DEFAULT 'posthog',
  provider_ref    TEXT        NOT NULL,
  duration_secs   INT,
  rage_clicks     INT         NOT NULL DEFAULT 0,
  errors          INT         NOT NULL DEFAULT 0,
  path_start      TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_replay_user      ON session_replay_refs(user_id);
CREATE INDEX IF NOT EXISTS idx_replay_started   ON session_replay_refs(started_at DESC);

CREATE TABLE IF NOT EXISTS integration_health_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration   TEXT        NOT NULL,
  status        TEXT        NOT NULL,
  latency_ms    INT,
  error_message TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_health_integration ON integration_health_events(integration);
CREATE INDEX IF NOT EXISTS idx_integration_health_checked     ON integration_health_events(checked_at DESC);
