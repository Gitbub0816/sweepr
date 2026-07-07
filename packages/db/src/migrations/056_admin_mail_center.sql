/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Admin mail center: outbound support on mailbox_messages + per-admin mailbox permissions.

-- Outbound columns (replies/composes sent from box@getsweepr.com via MailerSend).
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS direction   TEXT NOT NULL DEFAULT 'inbound';
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS to_email    TEXT;
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS in_reply_to UUID REFERENCES mailbox_messages(id) ON DELETE SET NULL;
ALTER TABLE mailbox_messages ADD COLUMN IF NOT EXISTS sent_by     UUID REFERENCES users(id) ON DELETE SET NULL;

-- Per-admin mailbox grants. super_admin (and owners) implicitly have all
-- mailboxes; rows here grant scoped admins access to specific boxes.
CREATE TABLE IF NOT EXISTS mailbox_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox    TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mailbox)
);
ALTER TABLE mailbox_permissions ENABLE ROW LEVEL SECURITY;
