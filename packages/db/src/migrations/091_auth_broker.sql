-- Copyright © 2026–Present ClearKey Solutions, LLC.
-- Proprietary & Confidential. Internal Use Only.
--
-- Central authentication broker (Rust service) — strict per-app session
-- isolation. Clerk proves identity; the broker owns login transactions,
-- one-time authorization codes, and opaque per-app sessions. Raw tokens and
-- codes are NEVER stored — only sha256 digests. Single-use semantics are
-- enforced by conditional UPDATE … WHERE consumed_at IS NULL (claim-then-act),
-- backed by the constraints below.

-- ── Login transactions (5-minute ceremony state) ─────────────────────────────
CREATE TABLE IF NOT EXISTS auth_login_transactions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Which app this ceremony will sign the user into. 'admin' rows may only be
  -- created by the admin broker deployment (separate secrets).
  app_id             TEXT NOT NULL CHECK (app_id IN ('customer','cleaner','business','admin')),
  auth_instance      TEXT NOT NULL CHECK (auth_instance IN ('standard','admin')),
  -- Opaque browser handle (tx=…) stored as sha256 hex; raw handle never stored.
  handle_digest      TEXT NOT NULL UNIQUE,
  state_digest       TEXT NOT NULL,
  -- Raw state is retained ONLY to build the callback redirect. It is a CSRF
  -- binding value validated against the app's own cookie — it cannot create a
  -- session by itself, so it is not a bearer credential.
  state_value        TEXT NOT NULL,
  nonce_digest       TEXT NOT NULL,
  pkce_challenge     TEXT NOT NULL,           -- S256 challenge (public by design)
  callback_uri       TEXT NOT NULL,           -- resolved from the registry, never the browser
  return_path        TEXT NOT NULL DEFAULT '/',  -- sanitized relative path only
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','authenticated','completed','expired','rejected')),
  clerk_user_id      TEXT,                    -- set after Clerk verification
  principal_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_ip_hash    TEXT,
  created_ua_hash    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL,
  completed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_tx_expiry ON auth_login_transactions (status, expires_at);

-- ── One-time authorization codes (30–60s) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_authorization_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID NOT NULL UNIQUE REFERENCES auth_login_transactions(id) ON DELETE CASCADE,
  code_digest     TEXT NOT NULL UNIQUE,
  app_id          TEXT NOT NULL CHECK (app_id IN ('customer','cleaner','business','admin')),
  auth_instance   TEXT NOT NULL CHECK (auth_instance IN ('standard','admin')),
  principal_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  clerk_user_id   TEXT NOT NULL,
  callback_uri    TEXT NOT NULL,
  pkce_challenge  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ
);

-- ── Per-app opaque sessions (72h absolute, server-side authoritative) ────────
CREATE TABLE IF NOT EXISTS app_sessions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_digest           TEXT NOT NULL UNIQUE,   -- sha256 of the opaque 32-byte token
  app_id                 TEXT NOT NULL CHECK (app_id IN ('customer','cleaner','business','admin')),
  auth_instance          TEXT NOT NULL CHECK (auth_instance IN ('standard','admin')),
  principal_user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  clerk_user_id          TEXT NOT NULL,
  workspace_id           UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  membership_id          UUID REFERENCES workspace_memberships(id) ON DELETE SET NULL,
  role_snapshot          TEXT,
  -- Bumped on suspension/role change/workspace removal; sessions with a stale
  -- version re-resolve authorization on next introspection.
  authorization_version  INTEGER NOT NULL DEFAULT 1,
  rotated_from           UUID REFERENCES app_sessions(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authenticated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,   -- absolute: created_at + TTL, never extended
  revoked_at             TIMESTAMPTZ,
  revocation_reason      TEXT,
  created_ip_hash        TEXT,
  created_ua_hash        TEXT,
  last_ip_hash           TEXT,
  last_ua_hash           TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_principal ON app_sessions (principal_user_id, app_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry ON app_sessions (expires_at) WHERE revoked_at IS NULL;

-- ── Broker audit stream (append-only; admin events carry the admin namespace) ─
CREATE TABLE IF NOT EXISTS auth_audit_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type     TEXT NOT NULL,                 -- auth.* / admin.auth.* catalog
  app_id         TEXT,
  auth_instance  TEXT,
  transaction_id UUID,
  session_id     UUID,
  principal_user_id UUID,
  clerk_user_id  TEXT,
  detail         JSONB,                         -- safe digests/ids only, never secrets
  ip_hash        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_type ON auth_audit_events (event_type, created_at DESC);

ALTER TABLE auth_login_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_events ENABLE ROW LEVEL SECURITY;
