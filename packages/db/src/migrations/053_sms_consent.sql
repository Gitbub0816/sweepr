-- Migration 053: A2P/TCPA SMS consent tracking.
--
-- Current consent state lives on users; every grant/revoke is ALSO appended
-- to sms_consent_events so historical consent is never overwritten and the
-- full trail is auditable (10DLC / toll-free / short-code / CTIA / TCPA).
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_ip TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_user_agent TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_consent_revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sms_consent_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked')),
  source TEXT NOT NULL,          -- onboarding | customer_settings | cleaner_settings | sms_start | sms_stop | admin
  consent_version TEXT,          -- policy version in force at the time (e.g. 'v1')
  ip_address TEXT,
  user_agent TEXT,
  phone TEXT,                    -- number the consent applies to, when known
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_events_user ON sms_consent_events(user_id, created_at DESC);
