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
 * ZIP-code-specific pricing multiplier: adjusts the whole booking total (both
 * what the customer pays and, proportionally, what the cleaner earns) — NOT a
 * fee-only adjustment like the founding customer discount.
 */
import { describe, it, expect } from "vitest";
import { loadZipMultiplierPct } from "../src/lib/zipPricing";
import { calculatePayout, type FeeSettings } from "../src/lib/payoutEngine";

interface Recorded { text: string; values: unknown[] }

function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  const calls: Recorded[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as import("../src/lib/db").Sql;
  return { sql, calls };
}

const SETTINGS: FeeSettings = {
  feeType: "percentage",
  feeValue: 30, // production Marketplace Services Fee (owner decision 2026-09)
  minimumPlatformFee: 0,
  maximumPlatformFee: null,
  processingFeeStrategy: "absorb",
  processingFeeSplitPct: 0,
  reservePercentage: 0,
  payoutDelayDays: 2,
};

describe("loadZipMultiplierPct", () => {
  it("returns 0 when no ZIP is provided", async () => {
    const { sql } = makeSql(() => []);
    expect(await loadZipMultiplierPct(sql, null)).toBe(0);
    expect(await loadZipMultiplierPct(sql, undefined)).toBe(0);
  });

  it("returns 0 when no active row exists for the ZIP", async () => {
    const { sql } = makeSql(() => []);
    expect(await loadZipMultiplierPct(sql, "94541")).toBe(0);
  });

  it("returns the configured percentage for an active ZIP", async () => {
    const { sql } = makeSql(() => [{ multiplier_pct: "10" }]);
    expect(await loadZipMultiplierPct(sql, "94104")).toBe(10);
  });

  it("returns a negative percentage unchanged", async () => {
    const { sql } = makeSql(() => [{ multiplier_pct: "-15" }]);
    expect(await loadZipMultiplierPct(sql, "94601")).toBe(-15);
  });

  it("never throws — a DB failure prices as if no adjustment exists", async () => {
    const sql = (() => { throw new Error("boom"); }) as unknown as import("../src/lib/db").Sql;
    await expect(loadZipMultiplierPct(sql, "94541")).resolves.toBe(0);
  });
});

describe("ZIP adjustment flowing through the whole booking total (not fee-only)", () => {
  it("a +10% ZIP raises both the customer total and the cleaner's payout proportionally", () => {
    // Base total (pre-adjustment) is $100; +10% ZIP -> booking.total_price
    // becomes $110 by the time it reaches checkout/payout (this is applied
    // upstream in bookings.ts's computeBookingPricing, not in calculatePayout
    // itself — calculatePayout just sees the already-adjusted gross).
    const adjustedGross = 11000; // $110, i.e. $100 * 1.10
    const breakdown = calculatePayout(adjustedGross, SETTINGS, 1.0);
    expect(breakdown.grossAmount).toBe(11000);
    expect(breakdown.platformFee).toBe(3300); // 30% of $110
    expect(breakdown.cleanerPayout).toBe(7700); // cleaner earns more, proportionally
  });

  it("a -15% ZIP lowers both the customer total and the cleaner's payout proportionally", () => {
    const adjustedGross = 8500; // $100 * 0.85
    const breakdown = calculatePayout(adjustedGross, SETTINGS, 1.0);
    expect(breakdown.grossAmount).toBe(8500);
    expect(breakdown.platformFee).toBe(2550);
    expect(breakdown.cleanerPayout).toBe(5950); // cleaner earns less, unlike the founding-customer discount
  });
});
