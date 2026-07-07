/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 078: IP blocklist + security ticket triage workflow.
--
-- ip_blocklist backs the edge middleware (apps/api/src/middleware/blocklist.ts):
-- requests whose CF-Connecting-IP matches an unexpired row are rejected with
-- 403 before reaching any route. Rows are managed from the admin Security
-- console (GET/POST/DELETE /security/blocklist).
--
-- security_tickets.triage_state adds the SOC incident workflow
-- (open → investigating → contained → resolved), independent of the
-- reporter-facing status field.

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip          TEXT UNIQUE NOT NULL,
  reason      TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

ALTER TABLE ip_blocklist ENABLE ROW LEVEL SECURITY;

ALTER TABLE security_tickets ADD COLUMN IF NOT EXISTS triage_state TEXT NOT NULL DEFAULT 'open';
