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
 * Room-condition pricing engine: correctness of charm rounding, worst-room vs
 * per-room application, and the customer-visible/internal split.
 */

import { describe, it, expect } from "vitest";
import {
  calculateHomeCleaningPrice,
  roundUpToEndingDigit,
  DEFAULT_HOME_CLEANING_CONFIG,
  type HomeCleaningPricingConfig,
} from "@sweepr/utils";

describe("roundUpToEndingDigit", () => {
  it("rounds up to the next price ending in 9", () => {
    expect(roundUpToEndingDigit(10000, 9)).toBe(10900); // $100 -> $109
    expect(roundUpToEndingDigit(10900, 9)).toBe(10900); // already ends in 9
    expect(roundUpToEndingDigit(11001, 9)).toBe(11900); // $110.01 -> $119
    expect(roundUpToEndingDigit(9, 9)).toBe(900); // $0.09 -> $9
  });
});

describe("calculateHomeCleaningPrice", () => {
  const base = {
    property: { homeType: "house" as const, sqft: 800, bedrooms: 1, bathrooms: 1 },
    addOnKeys: [] as string[],
  };

  it("exposes only a total owed ending in 9 to the customer", () => {
    const r = calculateHomeCleaningPrice({ ...base, rooms: [] });
    expect(r.customerVisible.currency).toBe("USD");
    // whole-dollar customer total ends in 9
    expect(Math.round(r.customerVisible.totalOwed) % 10).toBe(9);
    expect(r.internalBreakdown.totalCents).toBeGreaterThan(0);
  });

  it("charges more for worse room conditions", () => {
    const clean = calculateHomeCleaningPrice({
      ...base,
      rooms: [{ roomType: "kitchen", level: "level_1" }],
    });
    const dirty = calculateHomeCleaningPrice({
      ...base,
      rooms: [{ roomType: "kitchen", level: "level_4" }],
    });
    expect(dirty.customerVisible.totalOwed).toBeGreaterThan(clean.customerVisible.totalOwed);
    expect(dirty.internalBreakdown.roomConditionCents).toBeGreaterThan(0);
    expect(clean.internalBreakdown.roomConditionCents).toBe(0);
  });

  it("deduplicates room type (worst selection wins) by default", () => {
    const r = calculateHomeCleaningPrice({
      ...base,
      rooms: [
        { roomType: "kitchen", level: "level_2" },
        { roomType: "kitchen", level: "level_4" },
      ],
    });
    // only one kitchen charge (last wins), not summed
    expect(r.internalBreakdown.roomConditionCents).toBe(
      DEFAULT_HOME_CLEANING_CONFIG.roomCondition.rules.kitchen.levelCents.level_4,
    );
  });

  it("multiplies bathroom condition by count when applyPerRoom is on", () => {
    const cfg: HomeCleaningPricingConfig = {
      ...DEFAULT_HOME_CLEANING_CONFIG,
      roomCondition: { ...DEFAULT_HOME_CLEANING_CONFIG.roomCondition, applyPerRoom: true },
    };
    const per = cfg.roomCondition.rules.bathroom.levelCents.level_3;
    const r = calculateHomeCleaningPrice(
      { property: { homeType: "house", sqft: 800, bedrooms: 2, bathrooms: 3 }, addOnKeys: [], rooms: [{ roomType: "bathroom", level: "level_3" }] },
      cfg,
    );
    expect(r.internalBreakdown.roomConditionCents).toBe(per * 3);
  });

  it("adds configured add-ons", () => {
    const r = calculateHomeCleaningPrice({ ...base, rooms: [], addOnKeys: ["inside_fridge"] });
    expect(r.internalBreakdown.addOnsCents).toBe(
      DEFAULT_HOME_CLEANING_CONFIG.addOnCents.inside_fridge,
    );
  });
});
