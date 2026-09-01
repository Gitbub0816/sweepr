/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * site_settings READ allowlist for the MCP worker — DEFAULT DENY.
 *
 * The MCP exposes CONFIG only, never PII or money rows. Only these EXACT
 * keys may ever leave this worker; everything else in the site_settings bag
 * (and every other table: users, waitlist, payments, payouts, stripe_*,
 * security_events, audit logs, mailbox_messages, background checks, bookings,
 * quotes, any token or secret column) is off limits by construction —
 * there is no generic "read a setting" or "run SQL" tool.
 *
 * Key sources (keep in sync when those change):
 *  - SETTING_KEYS + SCOPE_REVIEW_KEYS in apps/api/src/routes/adminSettings.ts
 *  - founding.* seeds in packages/db/src/migrations/085_founding_and_promotions.sql
 */
export const SITE_SETTINGS_ALLOWLIST: readonly string[] = [
  // General platform settings (adminSettings.ts SETTING_KEYS)
  "platform_name",
  "support_email",
  "service_fee_pct",
  "tax_rate_pct",
  // Scope-review fee tiers + policy knobs (adminSettings.ts SCOPE_REVIEW_KEYS)
  "scope_review.fee_additional_attention_small_cents",
  "scope_review.fee_additional_attention_medium_cents",
  "scope_review.fee_additional_attention_large_cents",
  "scope_review.refusal_fee_min_cents",
  "scope_review.refusal_fee_max_cents",
  "scope_review.refusal_fee_pct",
  "scope_review.abuse_request_rate_pct",
  "scope_review.abuse_denial_rate_pct",
  "scope_review.abuse_min_jobs",
  "scope_review.privilege_disable_days",
  "scope_review.suspension_days",
  "scope_review.investigating_days",
  "scope_review.auto_cancel_on_high_confidence_refusal",
  "scope_review.level_surcharge_extra_attention_pct",
  "scope_review.level_surcharge_significant_attention_pct",
  // Founding-member program gates (migration 085 seeds)
  "founding.cleaner_enrollment_open",
  "founding.customer_enrollment_open",
  "founding.cleaner_cutoff_at",
  "founding.customer_cutoff_at",
  "founding.cleaner_max_members",
  "founding.customer_max_members",
  "founding.earnings_bonus_pct",
  "founding.since_label",
];

/** Default-deny check for a site_settings key. */
export function isAllowedSettingKey(key: string): boolean {
  return SITE_SETTINGS_ALLOWLIST.includes(key);
}
