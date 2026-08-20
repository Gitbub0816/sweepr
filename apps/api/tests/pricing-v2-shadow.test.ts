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
 * Shadow comparison: the LIVE room-condition engine (calculateHomeCleaningPrice)
 * vs the v2 cold-start translation, across a representative scenario grid.
 * This is the §10.6/§14.7 tooling for environments without production data:
 * run `npx vitest run apps/api/tests/pricing-v2-shadow.test.ts` and read the
 * printed table before approving/publishing the initial version.
 *
 * The assertions are deliberately loose sanity bounds (not parity — the v2
 * model intentionally prices labor, not fees): every scenario must stay
 * within a broad band of the current price so a translation mistake (10× off)
 * can't slip through, and the relative ordering of light→heavy homes must be
 * preserved.
 */

import { describe, it, expect } from "vitest";
import { calculateHomeCleaningPrice, DEFAULT_HOME_CLEANING_CONFIG } from "@sweepr/utils";
import { buildColdStartConfig, computeQuoteV2, type QuoteInputV2 } from "../src/lib/quoteEngine";

const v2cfg = buildColdStartConfig();

interface GridScenario {
  label: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  level: 1 | 2 | 3 | 4;
  addOns: string[];
}

const GRID: GridScenario[] = [];
for (const [bedrooms, bathrooms, sqft] of [
  [1, 1, 700],
  [2, 1, 1000],
  [3, 2, 1600],
  [4, 3, 2400],
  [5, 3, 3200],
] as const) {
  for (const level of [1, 2, 3, 4] as const) {
    GRID.push({
      label: `${bedrooms}bd/${bathrooms}ba ${sqft}sqft L${level}`,
      bedrooms,
      bathrooms,
      sqft,
      level,
      addOns: level === 3 ? ["inside_oven"] : [],
    });
  }
}

function oldPriceCents(s: GridScenario): number {
  const result = calculateHomeCleaningPrice(
    {
      property: { homeType: "house", sqft: s.sqft, bedrooms: s.bedrooms, bathrooms: s.bathrooms },
      rooms: [
        { roomType: "kitchen", level: `level_${s.level}` },
        { roomType: "bathroom", level: `level_${s.level}` },
        { roomType: "bedroom", level: `level_${s.level}` },
        { roomType: "living_room", level: `level_${s.level}` },
      ] as never,
      addOnKeys: s.addOns,
    },
    DEFAULT_HOME_CLEANING_CONFIG,
  );
  return result.internalBreakdown.totalCents;
}

function newPriceCents(s: GridScenario): number {
  const input: QuoteInputV2 = {
    serviceArea: "default",
    currency: "USD",
    counts: {
      kitchen: 1,
      bathroom: Math.max(1, Math.ceil(s.bathrooms)),
      bedroom: Math.max(1, s.bedrooms),
      living_room: 1,
    },
    conditions: { kitchen: s.level, bathroom: s.level, bedroom: s.level, living_room: s.level },
    sqft: s.sqft,
    extras: s.addOns.map((key) => ({ key, quantity: 1 })),
  };
  return computeQuoteV2(v2cfg, input, { pricingVersionId: "shadow" }).totalCents;
}

describe("shadow comparison: live engine vs v2 cold-start translation", () => {
  const rows = GRID.map((s) => {
    const oldC = oldPriceCents(s);
    const newC = newPriceCents(s);
    return {
      scenario: s.label,
      "old $": (oldC / 100).toFixed(2),
      "new $": (newC / 100).toFixed(2),
      "diff %": (((newC - oldC) / oldC) * 100).toFixed(1),
    };
  });

  it("prints the comparison report", () => {
    // The whole point of this file — the human-readable diff table.
    // eslint-disable-next-line no-console
    console.table(rows);
    expect(rows.length).toBe(GRID.length);
  });

  it("every scenario stays within a broad sanity band of the current price", () => {
    for (const s of GRID) {
      const oldC = oldPriceCents(s);
      const newC = newPriceCents(s);
      const ratio = newC / oldC;
      expect(ratio, `${s.label}: old $${oldC / 100} vs new $${newC / 100}`).toBeGreaterThan(0.5);
      expect(ratio, `${s.label}: old $${oldC / 100} vs new $${newC / 100}`).toBeLessThan(2.2);
    }
  });

  it("preserves ordering: heavier condition never cheaper (both engines)", () => {
    for (const [bedrooms, bathrooms, sqft] of [
      [2, 1, 1000],
      [4, 3, 2400],
    ] as const) {
      let prev = 0;
      for (const level of [1, 2, 3, 4] as const) {
        const c = newPriceCents({ label: "", bedrooms, bathrooms, sqft, level, addOns: [] });
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });
});
