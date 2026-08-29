/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

-- 100_mcp_simulator.sql
-- MCP pricing sandbox: quarantined storage for LLM-drafted Pricing v2
-- proposals plus an append-only audit trail of every MCP tool call.
--
-- Quarantine model: the MCP server (apps/mcp) can ONLY read/write these two
-- tables — it has NO path to pricing_versions or any live pricing. The only
-- way a sandbox proposal reaches customers is a HUMAN admin exporting the
-- payload and uploading it in the admin console (Pricing → Import Payload),
-- which creates a DRAFT pricing version that still must be reviewed and
-- published in Pricing Studio. Deliberately NO foreign key from
-- based_on_version_id to pricing_versions: the reference is informational
-- provenance only, and the sandbox must not couple to (or constrain) the
-- live pricing tables.

CREATE TABLE IF NOT EXISTS mcp_simulator_configs (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Admin identity from the MCP OAuth session (verified email).
  admin_email          TEXT        NOT NULL,
  name                 TEXT        NOT NULL DEFAULT 'default',
  -- Full PricingConfigV2 proposal (shape: apps/api/src/lib/quoteEngine/types.ts).
  config               JSONB       NOT NULL,
  -- Informational provenance only — see quarantine note above (no FK).
  based_on_version_id  UUID,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admin_email, name)
);
CREATE INDEX IF NOT EXISTS idx_mcp_simulator_configs_admin
  ON mcp_simulator_configs (admin_email);

COMMENT ON TABLE mcp_simulator_configs IS
  'Quarantined MCP pricing sandbox: LLM-drafted PricingConfigV2 proposals, keyed by the admin''s MCP OAuth email. No FK to pricing_versions and no write path to live pricing — going live requires a human uploading the payload in the admin console (draft) and publishing in Pricing Studio.';

-- Append-only audit trail of every MCP tool call (who, which tool, args).
CREATE TABLE IF NOT EXISTS mcp_action_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email  TEXT        NOT NULL,
  tool         TEXT        NOT NULL,
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_action_log_admin_created
  ON mcp_action_log (admin_email, created_at);

COMMENT ON TABLE mcp_action_log IS
  'Audit trail of every MCP tool call against the quarantined pricing sandbox. Sandbox activity never touches live pricing; this log exists so admins can review exactly what the MCP session did.';

-- ── RLS parity ────────────────────────────────────────────────────────────────
ALTER TABLE mcp_simulator_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_action_log        ENABLE ROW LEVEL SECURITY;
