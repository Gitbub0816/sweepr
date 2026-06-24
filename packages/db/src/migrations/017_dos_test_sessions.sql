-- Demo sessions table for day-of-service flow testing.
-- Controlled by SEED_BOOL API env var — never used in production.
CREATE TABLE IF NOT EXISTS dos_test_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  day_status  TEXT        NOT NULL DEFAULT 'confirmed',
  photo_count INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
