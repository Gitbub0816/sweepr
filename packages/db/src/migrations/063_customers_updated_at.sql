/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 */

-- Migration 063: customers.updated_at
-- Six code paths (cron customer-status reset, scope-review refusal flow,
-- bookings completion reset, dayOfService, auth, adminTrust) do
-- `UPDATE customers SET ... updated_at = NOW()`, but the column never existed —
-- every one of those writes threw `column "updated_at" of relation "customers"
-- does not exist` at runtime (invisible until the error feed surfaced it).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
