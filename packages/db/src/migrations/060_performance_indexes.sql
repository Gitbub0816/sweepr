-- Migration 060: Performance indexes for hot query paths.
--
-- Each index below is backed by an actual WHERE/JOIN/ORDER BY usage found in
-- apps/api/src (cited in comments). Columns from the review list that had no
-- verified query usage were deliberately left out: error_logs.user_id,
-- damage_claims.customer_id / .cleaner_id, insurance_status_log.cleaner_id,
-- data_subject_requests.user_id, admin_invites.email,
-- cleaner_location_pings.cleaner_id, booking_tips.customer_id
-- (booking_tips is only ever filtered by cleaner_id/booking_id/id/status in
-- the API — customer_id appears solely as an INSERT column). See the
-- optimization report for the full explanation.
--
-- CREATE INDEX CONCURRENTLY is intentionally NOT used: migrations run inside
-- a transaction, which does not support it.

-- addresses.user_id — apps/api/src/routes/auth.ts:130, account.ts:53,105
-- (SELECT/DELETE ... WHERE user_id = $1)
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses (user_id);

-- booking_addons.booking_id — apps/api/src/routes/bookings.ts:360,504
-- (SELECT addon_key ... WHERE booking_id = $1)
CREATE INDEX IF NOT EXISTS idx_booking_addons_booking_id ON booking_addons (booking_id);

-- payments.customer_id — apps/api/src/routes/auth.ts:129
-- (JOIN customers cu ON cu.id = p.customer_id)
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);

-- reviews.customer_id — apps/api/src/routes/account.ts:57
-- (WHERE customer_id = $1 OR cleaner_id = $2)
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews (customer_id);

-- disputes.booking_id — apps/api/src/index.ts:311 (EXISTS subquery in the
-- payout-eligibility cron), apps/api/src/routes/cleanerDashboard.ts:210
-- (JOIN bookings b ON b.id = d.booking_id)
CREATE INDEX IF NOT EXISTS idx_disputes_booking_id ON disputes (booking_id);

-- assignment_queue.status — apps/api/src/lib/assignment.ts (processExpiredOffers:
-- WHERE status = 'pending' AND expires_at < NOW()), apps/api/src/routes/adminAutomation.ts
-- (WHERE aq.status IN ('pending','offered'); WHERE status='expired' AND updated_at > ...).
-- (Migration 061 adds a partial index refinement for the pending-offer expiry scan.)
CREATE INDEX IF NOT EXISTS idx_assignment_queue_status ON assignment_queue (status);

-- subscriptions.status — apps/api/src/routes/subscriptions.ts:197-199
-- (WHERE s.customer_id = $1 AND s.status != 'cancelled' ORDER BY s.created_at DESC).
-- (Migration 061 adds a composite (customer_id, status) index matching this shape.)
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

-- subscription_bookings.booking_id — apps/api/src/routes/subscriptions.ts,
-- apps/api/src/routes/stripe-webhook.ts (SELECT/UPDATE ... WHERE booking_id / subquery joins)
CREATE INDEX IF NOT EXISTS idx_subscription_bookings_booking_id ON subscription_bookings (booking_id);

-- consent_log.user_id — apps/api/src/routes/account.ts:61 (SELECT * FROM consent_log WHERE user_id = $1)
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id ON consent_log (user_id);

-- cleaner_service_areas.cleaner_id — apps/api/src/lib/matching.ts:238-241
-- (WHERE cleaner_id = ANY($1)), apps/api/src/routes/schedule.ts:206
-- (LEFT JOIN ... ON sa.cleaner_id = cs.cleaner_id)
CREATE INDEX IF NOT EXISTS idx_cleaner_service_areas_cleaner_id ON cleaner_service_areas (cleaner_id);

-- waitlist.email — apps/api/src/routes/account.ts:138 (DELETE FROM waitlist WHERE email = $1)
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist (email);

-- slack_user_links.user_id — apps/api/src/routes/slack.ts:307
-- (INNER JOIN slack_user_links sul ON sul.user_id = u.id AND sul.slack_user_id = $1)
CREATE INDEX IF NOT EXISTS idx_slack_user_links_user_id ON slack_user_links (user_id);
