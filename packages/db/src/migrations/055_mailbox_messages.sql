-- Generic inbound mailboxes (caleb@, kristin@, news@, updates@, help@, alerts@).
-- IT@ and security@ keep their dedicated ticket pipelines.
CREATE TABLE IF NOT EXISTS mailbox_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox       TEXT NOT NULL,                -- 'caleb' | 'kristin' | 'news' | 'updates' | 'help' | 'alerts'
  sender_email  TEXT NOT NULL,
  sender_name   TEXT,
  subject       TEXT NOT NULL DEFAULT '(no subject)',
  body_text     TEXT NOT NULL DEFAULT '',
  message_id    TEXT,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_box ON mailbox_messages (mailbox, created_at DESC);
ALTER TABLE mailbox_messages ENABLE ROW LEVEL SECURITY;
