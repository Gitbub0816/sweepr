/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 075_admin_permission_overrides.sql
-- Per-user, per-permission overrides on top of a user's admin_role default set.
-- allow = TRUE grants a permission the role wouldn't have; allow = FALSE revokes
-- one the role would have. Lets access be edited down to a single screen or a
-- single piece of content for each individual admin.
CREATE TABLE IF NOT EXISTS admin_permission_overrides (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT        NOT NULL,
  allow          BOOLEAN     NOT NULL,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_permission_overrides_user
  ON admin_permission_overrides (user_id);

ALTER TABLE admin_permission_overrides ENABLE ROW LEVEL SECURITY;
