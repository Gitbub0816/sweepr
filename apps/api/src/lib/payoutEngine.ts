/**
 * Configurable payout engine.
 * Replaces the hardcoded PLATFORM_FEE_RATE = 0.2 constant used in payments.ts.
 * All fee parameters are loaded from platform_fee_settings (latest active row).
 */

import type { Sql } from "./db";

export interface FeeSettings {
  feeType: "percentage" | "flat" | "hybrid";
  feeValue: number;         // percent (0-100) or cents
  minimumPlatformFee: number; // cents
  maximumPlatformFee: number | null; // cents; null = uncapped
  processingFeeStrategy: "absorb" | "pass_through" | "split";
  processingFeeSplitPct: number; // 0-100
  reservePercentage: number; // 0-100
  payoutDelayDays: number;
}

interface FeeSettingsRow {
  fee_type: string;
  fee_value: string | number;
  minimum_platform_fee: number;
  maximum_platform_fee: number | null;
  processing_fee_strategy: string;
  processing_fee_split_pct: string | number;
  reserve_percentage: string | number;
  payout_delay_days: number;
}

const DEFAULT_SETTINGS: FeeSettings = {
  feeType: "percentage",
  feeValue: 20,
  minimumPlatformFee: 200,
  maximumPlatformFee: null,
  processingFeeStrategy: "absorb",
  processingFeeSplitPct: 0,
  reservePercentage: 0,
  payoutDelayDays: 2,
};

export async function loadFeeSettings(sql: Sql): Promise<FeeSettings> {
  try {
    const rows = (await sql`
      SELECT fee_type, fee_value, minimum_platform_fee, maximum_platform_fee,
             processing_fee_strategy, processing_fee_split_pct, reserve_percentage,
             payout_delay_days
      FROM platform_fee_settings
      WHERE active = TRUE
      ORDER BY effective_from DESC
      LIMIT 1
    `) as FeeSettingsRow[];
    if (!rows[0]) return DEFAULT_SETTINGS;
    const r = rows[0];
    return {
      feeType: r.fee_type as FeeSettings["feeType"],
      feeValue: Number(r.fee_value),
      minimumPlatformFee: r.minimum_platform_fee,
      maximumPlatformFee: r.maximum_platform_fee,
      processingFeeStrategy: r.processing_fee_strategy as FeeSettings["processingFeeStrategy"],
      processingFeeSplitPct: Number(r.processing_fee_split_pct),
      reservePercentage: Number(r.reserve_percentage),
      payoutDelayDays: r.payout_delay_days,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface PayoutBreakdown {
  grossAmount: number;   // cents — total charged to customer
  platformFee: number;   // cents — kept by Sweepr
  reserveHold: number;   // cents — withheld in reserve
  cleanerPayout: number; // cents — transferred to cleaner
  feeRate: number;       // 0-1 effective rate applied
  scheduledFor: Date;    // when to release
}

export function calculatePayout(
  grossAmountCents: number,
  settings: FeeSettings,
  tierMultiplier = 1.0
): PayoutBreakdown {
  let platformFee: number;

  if (settings.feeType === "percentage") {
    platformFee = Math.round(grossAmountCents * (settings.feeValue / 100));
  } else if (settings.feeType === "flat") {
    platformFee = settings.feeValue; // already in cents
  } else {
    // hybrid: percentage + flat
    platformFee = Math.round(grossAmountCents * (settings.feeValue / 100)) + (settings.minimumPlatformFee ?? 0);
  }

  // Clamp to configured min/max
  platformFee = Math.max(platformFee, settings.minimumPlatformFee);
  if (settings.maximumPlatformFee !== null) {
    platformFee = Math.min(platformFee, settings.maximumPlatformFee);
  }

  const afterFee = grossAmountCents - platformFee;
  const reserveHold = Math.round(afterFee * (settings.reservePercentage / 100));
  const baseCleanerPayout = afterFee - reserveHold;
  const cleanerPayout = Math.round(baseCleanerPayout * tierMultiplier);

  const scheduledFor = new Date();
  scheduledFor.setDate(scheduledFor.getDate() + settings.payoutDelayDays);

  return {
    grossAmount: grossAmountCents,
    platformFee,
    reserveHold,
    cleanerPayout,
    feeRate: platformFee / grossAmountCents,
    scheduledFor,
  };
}

interface TierMultiplierRow {
  tier: string;
  multiplier: string | number;
}

export async function getTierMultiplier(sql: Sql, tier: string): Promise<number> {
  try {
    const rows = (await sql`
      SELECT multiplier FROM cleaner_tier_multipliers WHERE tier = ${tier} LIMIT 1
    `) as TierMultiplierRow[];
    return rows[0] ? Number(rows[0].multiplier) : 1.0;
  } catch {
    return 1.0;
  }
}
