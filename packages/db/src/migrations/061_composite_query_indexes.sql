-- Migration 061: Composite / partial indexes matching hot query shapes.
--
-- Refines the single-column indexes from migration 060 for two queries whose
-- WHERE clauses always combine columns, so a composite/partial index serves
-- them better. Idempotent (IF NOT EXISTS). No CREATE INDEX CONCURRENTLY —
-- migrations run inside a transaction.

-- assignment_queue: the offer-expiry cron scans
--   WHERE status = 'pending' AND expires_at < NOW()
-- (apps/api/src/lib/assignment.ts processExpiredOffers). A partial index on
-- expires_at limited to pending rows is far smaller than the full status index.
CREATE INDEX IF NOT EXISTS idx_assignment_queue_pending_expires
  ON assignment_queue (expires_at) WHERE status = 'pending';

-- subscriptions: list query always filters customer + status together
--   WHERE customer_id = $1 AND status != 'cancelled' ORDER BY created_at DESC
-- (apps/api/src/routes/subscriptions.ts). Composite matches the access shape.
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_status
  ON subscriptions (customer_id, status);
