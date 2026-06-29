-- Migration 037: Security inbox (inbound email → tickets) + replies.
--
-- security@getsweepr.com inbound mail (via MailerSend inbound route) creates a
-- ticket with a unique SEC-YYYY-NNNNNN number; an auto-reply is sent and logged.
-- Admins reply from the Security console; replies thread back to the reporter.

CREATE TABLE IF NOT EXISTS security_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             BIGSERIAL,                       -- numbering source
  ticket_number   TEXT UNIQUE,                     -- SEC-YYYY-NNNNNN
  sender_email    TEXT NOT NULL,
  sender_name     TEXT,
  sender_ip       TEXT,
  subject         TEXT,
  classification  TEXT NOT NULL DEFAULT 'General Inquiry',
  status          TEXT NOT NULL DEFAULT 'Active'
    CHECK (status IN ('Active','Pending Review','Awaiting Response','Investigating',
      'Information Requested','Resolved','Closed','Rejected','Duplicate','Unable to Reproduce')),
  case_owner      TEXT,
  assigned_to     TEXT,
  inbound_message_id  TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_reply_sent_at  TIMESTAMPTZ,
  last_reply_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_tickets_status ON security_tickets (status);
CREATE INDEX IF NOT EXISTS idx_security_tickets_received ON security_tickets (received_at DESC);

CREATE TABLE IF NOT EXISTS security_ticket_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES security_tickets(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL CHECK (direction IN ('inbound','outbound','auto_reply')),
  from_email   TEXT,
  to_email     TEXT,
  subject      TEXT,
  body         TEXT,
  message_id   TEXT,
  delivery_status TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_messages_ticket ON security_ticket_messages (ticket_id);
