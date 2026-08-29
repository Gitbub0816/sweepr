/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import { computeCrewPlan, effectiveCapacity, elapsedMinutes } from "../src/lib/crew/crewSizing";
import { DEFAULT_CREW_CONFIG, payoutSplitFractions } from "../src/lib/crew/crewConfig";

const CFG = DEFAULT_CREW_CONFIG;

describe("effective capacity + elapsed", () => {
  it("is non-linear per the team productivity curve", () => {
    expect(effectiveCapacity(1, undefined)).toBe(1);
    expect(effectiveCapacity(2, undefined)).toBeCloseTo(1.85, 5);
    expect(effectiveCapacity(3, undefined)).toBeCloseTo(2.55, 5);
  });

  it("elapsed is NOT personMinutes/crewSize (coordination loss)", () => {
    // 480 person-min over 2 cleaners ≈ 260, not 240.
    expect(elapsedMinutes(480, 2, undefined)).toBe(260);
    expect(elapsedMinutes(480, 1, undefined)).toBe(480);
  });
});

describe("computeCrewPlan — labor drives size, not sqft", () => {
  it("small job → solo", () => {
    const p = computeCrewPlan({ personMinutes: 200, config: CFG });
    expect(p.recommendedCrewSize).toBe(1);
    expect(p.reasonCodes).toContain("LOW_TOTAL_LABOR");
  });

  it("no labor estimate (v2 dark) → solo, low confidence", () => {
    const p = computeCrewPlan({ personMinutes: null, config: CFG });
    expect(p.recommendedCrewSize).toBe(1);
    expect(p.reasonCodes).toContain("NO_LABOR_ESTIMATE");
    expect(p.confidence).toBeLessThan(0.5);
  });

  it("high labor → 2 cleaners", () => {
    const p = computeCrewPlan({ personMinutes: 700, config: CFG });
    expect(p.recommendedCrewSize).toBe(2);
    expect(p.reasonCodes).toContain("HIGH_TOTAL_LABOR");
  });

  it("very high labor → 3 cleaners, capped at maxCrewSize", () => {
    const p = computeCrewPlan({ personMinutes: 1400, config: CFG });
    expect(p.recommendedCrewSize).toBe(3);
    expect(p.maxUsefulCrewSize).toBeLessThanOrEqual(CFG.maxCrewSize);
  });

  it("a solo shift beyond the max flips to a crew", () => {
    // 380 person-min: labor floor is 2 (>300); elapsed solo 380 > 360 max.
    const p = computeCrewPlan({ personMinutes: 380, config: CFG });
    expect(p.recommendedCrewSize).toBeGreaterThanOrEqual(2);
  });

  it("boundary values behave (solo ceiling 360, labor bands 540/900)", () => {
    // Below the solo elapsed ceiling (360) and labor band 1 (540) → solo.
    expect(computeCrewPlan({ personMinutes: 299, config: CFG }).recommendedCrewSize).toBe(1);
    expect(computeCrewPlan({ personMinutes: 360, config: CFG }).recommendedCrewSize).toBe(1);
    // A solo shift just over 360 min flips to a crew on duration grounds.
    expect(computeCrewPlan({ personMinutes: 361, config: CFG }).recommendedCrewSize).toBe(2);
    // Labor band 2 (>540) and band 3 (>900).
    expect(computeCrewPlan({ personMinutes: 541, config: CFG }).recommendedCrewSize).toBe(2);
    expect(computeCrewPlan({ personMinutes: 901, config: CFG }).recommendedCrewSize).toBe(3);
  });

  it("min-useful-work cap prevents over-crewing tiny jobs", () => {
    // 120 person-min can't usefully employ 2 (min useful 90 each ⇒ max 1).
    const p = computeCrewPlan({ personMinutes: 120, config: CFG });
    expect(p.maxUsefulCrewSize).toBe(1);
    expect(p.recommendedCrewSize).toBe(1);
  });

  it("customer-elected extra cleaner adds one seat above the recommendation", () => {
    const base = computeCrewPlan({ personMinutes: 700, config: CFG });
    const extra = computeCrewPlan({ personMinutes: 700, config: CFG, extraCleanerRequested: true });
    expect(extra.recommendedCrewSize).toBe(base.recommendedCrewSize + 1);
    expect(extra.reasonCodes).toContain("CUSTOMER_EXTRA_CLEANER");
  });

  it("extra cleaner still capped at maxCrewSize", () => {
    const p = computeCrewPlan({ personMinutes: 1400, config: CFG, extraCleanerRequested: true });
    expect(p.recommendedCrewSize).toBeLessThanOrEqual(CFG.maxCrewSize);
  });

  it("exposes elapsed for every candidate size", () => {
    const p = computeCrewPlan({ personMinutes: 700, config: CFG });
    expect(p.elapsedBySize[1]).toBeGreaterThan(p.elapsedBySize[2]);
  });
});

describe("payout split fractions", () => {
  it("solo = 100%", () => {
    expect(payoutSplitFractions(CFG, 1)).toEqual([1]);
  });
  it("two-person = 60/40", () => {
    const s = payoutSplitFractions(CFG, 2);
    expect(s[0]).toBeCloseTo(0.6, 5);
    expect(s[1]).toBeCloseTo(0.4, 5);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
  it("three-person = 40/30/30", () => {
    const s = payoutSplitFractions(CFG, 3);
    expect(s).toEqual([0.4, 0.3, 0.3]);
  });
  it("falls back to an even split for an unconfigured size", () => {
    const s = payoutSplitFractions(CFG, 4);
    expect(s).toHaveLength(4);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});
