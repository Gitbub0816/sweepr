-- Admin invite tokens — one-time signed URLs for granting admin access.
-- The first admin is created by running:
--   UPDATE users SET role = 'admin' WHERE email = '<your-email>';
-- in the Neon SQL editor. Subsequent admins are invited from the console.

CREATE TABLE IF NOT EXISTS admin_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  email       TEXT        NOT NULL,
  created_by  TEXT        NOT NULL,       -- clerk_id of inviting admin
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_invites_token_idx ON admin_invites(token);

-- FCM device tokens for push notifications (mobile app).
-- One user can have multiple devices; each device has one token.
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  platform    TEXT        NOT NULL DEFAULT 'fcm',   -- 'fcm' | 'apns'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id);
