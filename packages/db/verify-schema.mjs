#!/usr/bin/env node
/**
 * Verifies that packages/db/schema.sql contains all required tables and columns.
 * Exits non-zero if anything is missing — used in CI to catch stale schema.
 *
 * Run: node packages/db/verify-schema.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");

// All tables that must exist in schema.sql (using actual migration table names).
const REQUIRED_TABLES = [
  // Core domain
  "users",
  "customers",
  "cleaners",
  "addresses",
  "bookings",
  "booking_addons",
  "job_offers",
  "reviews",
  "payments",
  "payouts",
  "disputes",
  "notifications",
  "subscriptions",
  "subscription_bookings",
  // Cleaner ops
  "cleaner_availability",
  "cleaner_service_areas",
  "cleaner_insurance",
  "cleaner_location_pings",
  "cleaner_training_progress",
  "cleaner_quiz_attempts",
  "cleaner_tier_multipliers",
  // Admin
  "admin_audit_log",
  "admin_invites",
  "device_tokens",
  "automation_runs",
  // Verification
  "consent_log",
  // Pre-launch / status
  "site_settings",
  "status_incidents",
  "status_updates",
  "newsletter_subscribers",
  "status_subscribers",
  "waitlist",
  // Training
  "training_modules",
  "training_lessons",
  "training_quiz_questions",
  // Courses
  "courses",
  "course_slides",
  "course_versions",
  // Service areas
  "service_areas",
  "city_requests",
  "city_subscribers",
  "broadcast_sends",
  // Day-of-service
  "booking_access_codes",
  "booking_photos",
  "job_completion_packages",
  // Observability
  "analytics_events",
  "api_request_logs",
  "payment_observability_events",
  "session_replay_refs",
  "integration_health_events",
  // Stripe / payments
  "stripe_connected_accounts",
  "platform_fee_settings",
  "payout_settings_audit",
  "payout_ledger",
  "stripe_events",
  // Production hardening (migration 025)
  "failed_webhook_events",
  "job_completion_requirements",
  "address_reveal_settings",

  // SMS consent (migration 053)
  "sms_consent_events",
];

// Columns that must appear in schema.sql (checks for string presence).
const REQUIRED_COLUMNS = [
  // bookings — production hardening columns
  "stripe_payment_intent_id",
  "stripe_payment_intent_created_at",
  "platform_fee",
  "cleaner_payout",
  "day_status",
  "cleaner_lat",
  "cleaner_lng",
  "address_revealed_at",
  "access_code_revealed_at",
  "arrival_verified_at",
  "started_at",
  "completed_at",
  // booking_access_codes — encryption columns
  "code_value_encrypted",
  "encryption_version",
  "revealed_at",
  "revealed_to",
  // stripe_events — DLQ tracking
  "retry_count",
  "last_error",
  // payouts — marketplace breakdown
  "gross_amount",
  "net_amount",
  "fee_rate",
  "tier_multiplier",
];

// Migration section headers that must be present.
const REQUIRED_MIGRATIONS = [
  "001_initial.sql",
  "009_admin_invites_device_tokens.sql",
  "012_day_of_service.sql",
  "018_observability.sql",
  "019_admin_roles_automation.sql",
  "020_stripe_marketplace.sql",
  "021_payout_ledger.sql",
  "022_access_code_encryption.sql",
  "023_booking_auth_indexes.sql",
  "024_observability_retention.sql",
  "025_production_hardening.sql",
];

let errors = 0;

// ── Tables ──────────────────────────────────────────────────────────────────
for (const table of REQUIRED_TABLES) {
  const re = new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?${table}\\b`, "i");
  if (!re.test(schema)) {
    console.error(`MISSING TABLE: ${table}`);
    errors++;
  }
}

// ── Columns ─────────────────────────────────────────────────────────────────
for (const col of REQUIRED_COLUMNS) {
  if (!schema.includes(col)) {
    console.error(`MISSING COLUMN: ${col}`);
    errors++;
  }
}

// ── Migration sections ───────────────────────────────────────────────────────
for (const mig of REQUIRED_MIGRATIONS) {
  if (!schema.includes(mig)) {
    console.error(`MISSING MIGRATION SECTION: ${mig}`);
    errors++;
  }
}

if (errors === 0) {
  console.log(
    `✓ schema.sql verified — ${REQUIRED_TABLES.length} tables, ` +
    `${REQUIRED_COLUMNS.length} columns, ${REQUIRED_MIGRATIONS.length} migration sections OK.`
  );
  process.exit(0);
} else {
  console.error(`\n✗ schema.sql verification FAILED — ${errors} issue(s).`);
  process.exit(1);
}
