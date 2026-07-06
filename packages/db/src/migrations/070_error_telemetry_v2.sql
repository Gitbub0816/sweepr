-- 070_error_telemetry_v2.sql
-- Rich error telemetry: grouping fingerprint, customer-visible reference code,
-- structured error identity, and request duration.
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS fingerprint  TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_name   TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS error_code   TEXT;
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS duration_ms  INT;

CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs (fingerprint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_reference   ON error_logs (reference_id);
