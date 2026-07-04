-- Migration 060: Performance indexes.
--
-- Adds indexes on foreign-key / status / lookup columns that the API filters
-- and joins on but that were previously unindexed (verified against the live
-- database: these columns had no index with them as the leading key). All are
-- IF NOT EXISTS so the migration is idempotent and safe to re-run. Plain
-- (non-CONCURRENT) index builds so the migration runs inside a transaction.

-- Ownership / foreign-key lookups (scoped reads in the API filter by these).
CREATE INDEX IF NOT EXISTS idx_addresses_user_id            ON addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_booking_addons_booking_id    ON booking_addons (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id         ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id          ON reviews (customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_tips_customer_id     ON booking_tips (customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_booking_id          ON disputes (booking_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id           ON error_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_damage_claims_customer_id    ON damage_claims (customer_id);
CREATE INDEX IF NOT EXISTS idx_damage_claims_cleaner_id     ON damage_claims (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id          ON consent_log (user_id);
CREATE INDEX IF NOT EXISTS idx_dsr_user_id                  ON data_subject_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_status_log_cleaner ON insurance_status_log (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_service_areas_cleaner ON cleaner_service_areas (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_location_pings_cleaner ON cleaner_location_pings (cleaner_id);
CREATE INDEX IF NOT EXISTS idx_subscription_bookings_booking ON subscription_bookings (booking_id);
CREATE INDEX IF NOT EXISTS idx_slack_user_links_user_id     ON slack_user_links (user_id);

-- Email lookups (invite acceptance / waitlist dedupe).
CREATE INDEX IF NOT EXISTS idx_admin_invites_email          ON admin_invites (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_waitlist_email               ON waitlist (LOWER(email));

-- Status-filtered work queues (cron + admin list pages scan by status).
CREATE INDEX IF NOT EXISTS idx_assignment_queue_status      ON assignment_queue (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status         ON subscriptions (status);
