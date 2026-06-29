-- Migration 042: Email deliverability infrastructure.
-- Adds email_delivery_log (audit trail for every outbound send) and
-- email_suppressions (hard bounces, spam complaints, manual blocks).

BEGIN;

-- ── email_delivery_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name    TEXT,
  template_id      TEXT,
  email_category   TEXT NOT NULL DEFAULT 'transactional', -- 'transactional' | 'marketing'
  recipient        TEXT NOT NULL,
  "from"           TEXT NOT NULL,
  reply_to         TEXT,
  subject          TEXT,
  provider_message_id TEXT,
  status           TEXT NOT NULL DEFAULT 'sent',          -- 'sent' | 'failed' | 'suppressed'
  related_type     TEXT,                                  -- 'security_ticket' | 'it_ticket' | 'booking' | ...
  related_id       TEXT,
  error_message    TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_delivery_log_recipient_idx ON email_delivery_log (recipient);
CREATE INDEX IF NOT EXISTS email_delivery_log_related_idx   ON email_delivery_log (related_type, related_id);
CREATE INDEX IF NOT EXISTS email_delivery_log_sent_at_idx   ON email_delivery_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS email_delivery_log_status_idx    ON email_delivery_log (status);

-- ── email_suppressions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_suppressions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  reason           TEXT NOT NULL, -- 'hard_bounce' | 'spam_complaint' | 'manual_suppression' | 'invalid_address' | 'unsubscribed_marketing'
  source           TEXT,          -- 'mailersend_webhook' | 'admin' | 'user'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_suppressions_email_idx ON email_suppressions (LOWER(email));

COMMIT;
