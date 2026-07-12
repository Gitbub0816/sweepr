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
 * Admin-configurable Smart Entry + Sweepr+ config, persisted as JSON in
 * `site_settings` under `smart_entry_config`. Every price, limit, and window in
 * the Smart Entry spec (§25 feature flags) is read from here — never hardcode a
 * fee, geofence, or access window at a call site.
 */
import type { Sql } from "./db";

export interface SmartEntryConfig {
  // Feature flags
  smartEntryEnabled: boolean;
  manualCodeEnabled: boolean;
  remoteUnlockEnabled: boolean;
  scheduledPinEnabled: boolean;
  sweeprPlusEnabled: boolean;

  // Pricing (integer cents)
  nonmemberFeeCents: number; // $5.00
  memberIncluded: boolean;

  // Access window offsets (minutes)
  accessStartOffsetMinutes: number; // before scheduled arrival
  accessEndOffsetMinutes: number; // after expected completion

  // Geo / freshness guards
  maxGeofenceRadiusMeters: number;
  maxLocationAgeSeconds: number;
  maxLocationAccuracyMeters: number;

  // Auth guards
  requireBiometric: boolean;
  requireDeviceAttestation: boolean;
  reauthMaxAgeSeconds: number;

  // Rate limits
  maxUnlockAttemptsPer10Min: number;
  maxCodeRevealsPerBooking: number;

  // Sweepr+ pricing (integer cents) + benefits
  plusMonthlyPriceCents: number; // $12.99
  plusAnnualPriceCents: number; // $129.00
  plusDiscountPercent: number; // 3
  plusMonthlyDiscountCapCents: number; // $15.00
  plusPriorityBookingMinutes: number; // 30
  plusRescheduleBenefitEnabled: boolean;
  plusGraceDays: number; // past_due grace period
}

export const DEFAULT_SMART_ENTRY_CONFIG: SmartEntryConfig = {
  smartEntryEnabled: false, // dark until an admin turns it on
  manualCodeEnabled: true,
  remoteUnlockEnabled: false,
  scheduledPinEnabled: false,
  sweeprPlusEnabled: false,

  nonmemberFeeCents: 500,
  memberIncluded: true,

  accessStartOffsetMinutes: 15,
  accessEndOffsetMinutes: 30,

  maxGeofenceRadiusMeters: 150,
  maxLocationAgeSeconds: 60,
  maxLocationAccuracyMeters: 100,

  requireBiometric: true,
  requireDeviceAttestation: false,
  reauthMaxAgeSeconds: 300,

  maxUnlockAttemptsPer10Min: 3,
  maxCodeRevealsPerBooking: 5,

  plusMonthlyPriceCents: 1299,
  plusAnnualPriceCents: 12900,
  plusDiscountPercent: 3,
  plusMonthlyDiscountCapCents: 1500,
  plusPriorityBookingMinutes: 30,
  plusRescheduleBenefitEnabled: true,
  plusGraceDays: 7,
};

const KEY = "smart_entry_config";

export async function loadSmartEntryConfig(sql: Sql): Promise<SmartEntryConfig> {
  const rows = (await sql`SELECT value FROM site_settings WHERE key = ${KEY} LIMIT 1`) as {
    value: string | null;
  }[];
  if (!rows[0]?.value) return DEFAULT_SMART_ENTRY_CONFIG;
  try {
    // Shallow-merge over defaults so newly-added fields are always present.
    return { ...DEFAULT_SMART_ENTRY_CONFIG, ...(JSON.parse(rows[0].value) as Partial<SmartEntryConfig>) };
  } catch {
    return DEFAULT_SMART_ENTRY_CONFIG;
  }
}

export async function saveSmartEntryConfig(sql: Sql, cfg: SmartEntryConfig): Promise<void> {
  await sql`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (${KEY}, ${JSON.stringify(cfg)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}
