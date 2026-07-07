/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- 080_status_health_checks.sql
-- Automated component health checks behind status.getsweepr.com. The cron
-- probes each public component every 15 minutes and records the result here;
-- GET /status/components serves current state + 90-day uptime from this table.

CREATE TABLE IF NOT EXISTS status_checks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component  TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  latency_ms INTEGER,
  detail     TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_checks_component_time
  ON status_checks (component, checked_at DESC);

ALTER TABLE status_checks ENABLE ROW LEVEL SECURITY;
