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
 * Founding customer platform-fee discount: the cleaner's payout must be
 * unaffected by the discount — Sweepr absorbs it entirely out of its own fee.
 */
import { describe, it, expect } from "vitest";
import { calculatePayout, type FeeSettings } from "../src/lib/payoutEngine";

const SETTINGS: FeeSettings = {
  feeType: "percentage",
  feeValue: 20,
  minimumPlatformFee: 0,
  maximumPlatformFee: null,
  processingFeeStrategy: "absorb",
  processingFeeSplitPct: 0,
  reservePercentage: 0,
  payoutDelayDays: 2,
};

describe("calculatePayout with a founding customer discount", () => {
  it("matches the $100 job worked example exactly", () => {
    // $100 job, 20% fee, 5% founding-customer discount: customer is charged
    // $95 (the amount actually captured); the cleaner still earns $80, same
    // as a non-discounted booking; the platform absorbs the $5 difference.
    const capturedAmountCents = 9500; // what was actually charged/captured
    const discountCents = 500; // 5% of $100
    const breakdown = calculatePayout(capturedAmountCents, SETTINGS, 1.0, discountCents);

    expect(breakdown.grossAmount).toBe(9500);
    expect(breakdown.cleanerPayout).toBe(8000); // unaffected — same as a full-price $100 job
    expect(breakdown.platformFee).toBe(1500); // $20 list fee minus the $5 discount absorbed
    expect(breakdown.reserveHold).toBe(0);
  });

  it("cleaner payout is identical with and without the discount, for the same job", () => {
    const withoutDiscount = calculatePayout(10000, SETTINGS, 1.0, 0);
    const withDiscount = calculatePayout(9500, SETTINGS, 1.0, 500);
    expect(withDiscount.cleanerPayout).toBe(withoutDiscount.cleanerPayout);
  });

  it("compounds correctly with a founding cleaner's payout bonus on the same booking", () => {
    // A founding customer books a founding cleaner: customer still pays 5%
    // less; cleaner still earns their normal bonus-inclusive payout as if
    // the customer paid full price.
    const foundingCleanerMultiplier = 1.05;
    const withoutDiscount = calculatePayout(10000, SETTINGS, foundingCleanerMultiplier, 0);
    const withDiscount = calculatePayout(9500, SETTINGS, foundingCleanerMultiplier, 500);
    expect(withDiscount.cleanerPayout).toBe(withoutDiscount.cleanerPayout);
    expect(withDiscount.cleanerPayout).toBe(8400); // $80 * 1.05
  });

  it("never returns a negative platform fee even if the discount exceeded the fee", () => {
    const tinyFeeSettings: FeeSettings = { ...SETTINGS, feeValue: 2 }; // 2% fee
    const breakdown = calculatePayout(9500, tinyFeeSettings, 1.0, 500);
    expect(breakdown.platformFee).toBeGreaterThanOrEqual(0);
  });

  it("defaults to no discount when the parameter is omitted (existing call sites unaffected)", () => {
    const breakdown = calculatePayout(10000, SETTINGS, 1.0);
    expect(breakdown.grossAmount).toBe(10000);
    expect(breakdown.platformFee).toBe(2000);
    expect(breakdown.cleanerPayout).toBe(8000);
  });

  it("respects min/max fee clamps against the undiscounted gross", () => {
    const clamped: FeeSettings = { ...SETTINGS, minimumPlatformFee: 2500 };
    const breakdown = calculatePayout(9500, clamped, 1.0, 500);
    // Undiscounted gross is $100, so the $25 minimum applies before the
    // discount is subtracted back out: $25 - $5 = $20 actual platform fee.
    expect(breakdown.platformFee).toBe(2000);
    expect(breakdown.cleanerPayout).toBe(7500); // ($100 - $25 minimum fee)
  });
});
