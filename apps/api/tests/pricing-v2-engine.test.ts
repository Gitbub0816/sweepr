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
import {
  buildColdStartConfig,
  computeQuoteV2,
  inferConditionCounts,
  isValidDirectCounts,
  normalizeQuoteInput,
  roundUpToEndingDigit,
  validatePricingConfig,
  QuoteInputError,
  ROOM_TYPES_V2,
  type ConditionLevel,
  type QuoteInputV2,
  type RoomTypeV2,
} from "../src/lib/quoteEngine";

const cfg = buildColdStartConfig();
const OPTS = { pricingVersionId: "test-version" };

function input(partial: Partial<QuoteInputV2> = {}): QuoteInputV2 {
  return {
    serviceArea: "default",
    currency: "USD",
    counts: { kitchen: 1, bathroom: 3, bedroom: 4, living_room: 1 },
    conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
    extras: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Inference: consensus rule (spec §5.2.1 + required acceptance scenario)
// ---------------------------------------------------------------------------

describe("consensus rule", () => {
  for (const q of [1, 2, 3, 4] as ConditionLevel[]) {
    it(`all-level-${q} home applies level ${q} to every counted room`, () => {
      const out = inferConditionCounts(cfg.inference, [
        { type: "kitchen", count: 1, reportedMax: q },
        { type: "bathroom", count: 3, reportedMax: q },
        { type: "bedroom", count: 4, reportedMax: q },
        { type: "living_room", count: 1, reportedMax: q },
      ]);
      for (const t of out.perType) {
        expect(t.expectedConditionCounts[q - 1]).toBe(t.count);
        expect(t.expectedConditionCounts.reduce((a, b) => a + b, 0)).toBe(t.count);
      }
    });
  }

  it("prices the 4-bed/3-bath all-level-4 home with EVERY room at level 4", () => {
    const all4 = input({
      conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 },
    });
    const q = computeQuoteV2(cfg, all4, OPTS);
    const bathroom = q.roomInference.find((r) => r.roomType === "bathroom")!;
    const bedroom = q.roomInference.find((r) => r.roomType === "bedroom")!;
    expect(bathroom.expectedConditionCounts[3]).toBe(3);
    expect(bedroom.expectedConditionCounts[3]).toBe(4);
    // Labor equals the full level-4 matrix across all rooms.
    const expected =
      cfg.laborMatrix.kitchen[3] +
      3 * cfg.laborMatrix.bathroom[3] +
      4 * cfg.laborMatrix.bedroom[3] +
      cfg.laborMatrix.living_room[3];
    const conditionMinutes = q.roomInference.reduce((s, r) => s + r.expectedLaborMinutes, 0);
    expect(conditionMinutes).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Inference: mixed signals (required acceptance scenario)
// ---------------------------------------------------------------------------

describe("mixed-signal inference", () => {
  const mixed = inferConditionCounts(cfg.inference, [
    { type: "kitchen", count: 1, reportedMax: 1 },
    { type: "bathroom", count: 3, reportedMax: 4 },
    { type: "bedroom", count: 4, reportedMax: 1 },
    { type: "living_room", count: 1, reportedMax: 1 },
  ]);
  const bathroom = mixed.perType.find((t) => t.type === "bathroom")!;

  it("guarantees at least one bathroom at the reported maximum", () => {
    expect(bathroom.expectedConditionCounts[3]).toBeGreaterThanOrEqual(1);
  });

  it("does not blindly price all three bathrooms at level 4", () => {
    expect(bathroom.expectedConditionCounts[3]).toBeLessThan(3);
  });

  it("expected counts total the room count and never exceed the maximum", () => {
    expect(bathroom.expectedConditionCounts.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 6);
    // nothing above level 4 possible; single-room types stay at their max
    for (const t of mixed.perType) {
      const sum = t.expectedConditionCounts.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(t.count, 6);
      for (let k = t.reportedMax + 1; k <= 4; k++) {
        expect(t.expectedConditionCounts[k - 1]).toBe(0);
      }
    }
  });

  it("a mostly-level-1 home pulls unobserved bathrooms below the maximum", () => {
    // The remaining ~2 bathrooms should mostly sit at low levels.
    const low = bathroom.expectedConditionCounts[0] + bathroom.expectedConditionCounts[1];
    expect(low).toBeGreaterThan(0.5);
  });

  it("whole-home evidence shifts the inference (dirtier home ⇒ dirtier unobserved rooms)", () => {
    const dirty = inferConditionCounts(cfg.inference, [
      { type: "kitchen", count: 1, reportedMax: 3 },
      { type: "bathroom", count: 3, reportedMax: 4 },
      { type: "bedroom", count: 4, reportedMax: 3 },
      { type: "living_room", count: 1, reportedMax: 3 },
    ]);
    const dirtyBath = dirty.perType.find((t) => t.type === "bathroom")!;
    expect(dirtyBath.expectedConditionCounts[3]).toBeGreaterThan(bathroom.expectedConditionCounts[3]);
  });

  it("room count matters: max of 4 among three bathrooms ≠ a single level-4 bathroom", () => {
    const three = inferConditionCounts(cfg.inference, [
      { type: "kitchen", count: 1, reportedMax: 1 },
      { type: "bathroom", count: 3, reportedMax: 4 },
      { type: "bedroom", count: 4, reportedMax: 1 },
      { type: "living_room", count: 1, reportedMax: 1 },
    ]);
    const one = inferConditionCounts(cfg.inference, [
      { type: "kitchen", count: 1, reportedMax: 1 },
      { type: "bathroom", count: 1, reportedMax: 4 },
      { type: "bedroom", count: 4, reportedMax: 1 },
      { type: "living_room", count: 1, reportedMax: 1 },
    ]);
    const b3 = three.perType.find((t) => t.type === "bathroom")!;
    const b1 = one.perType.find((t) => t.type === "bathroom")!;
    expect(b1.expectedConditionCounts[3]).toBe(1);
    // With three bathrooms the average per-bathroom level-4 mass is diluted.
    expect(b3.expectedConditionCounts[3] / 3).toBeLessThan(1);
  });

  it("single-room types use the selected level directly", () => {
    const kitchen = mixed.perType.find((t) => t.type === "kitchen")!;
    expect(kitchen.method).toBe("single_room");
    expect(kitchen.expectedConditionCounts).toEqual([1, 0, 0, 0]);
  });
});

describe("direct counts-by-level override", () => {
  it("validates counts (sum, max ceiling, at least one at max)", () => {
    expect(isValidDirectCounts([1, 1, 0, 1], 3, 4)).toBe(true);
    expect(isValidDirectCounts([1, 1, 1, 0], 3, 4)).toBe(false); // none at max
    expect(isValidDirectCounts([0, 0, 0, 4], 3, 4)).toBe(false); // wrong sum
    expect(isValidDirectCounts([0, 0, 4, 0], 4, 3)).toBe(true);
    expect(isValidDirectCounts([0, 0, 0, 4], 4, 3)).toBe(false); // above max
  });

  it("supersedes inference for that room type", () => {
    const out = inferConditionCounts(cfg.inference, [
      { type: "kitchen", count: 1, reportedMax: 1 },
      { type: "bathroom", count: 3, reportedMax: 4, directCounts: [2, 0, 0, 1] },
      { type: "bedroom", count: 4, reportedMax: 1 },
      { type: "living_room", count: 1, reportedMax: 1 },
    ]);
    const bath = out.perType.find((t) => t.type === "bathroom")!;
    expect(bath.method).toBe("direct_counts");
    expect(bath.expectedConditionCounts).toEqual([2, 0, 0, 1]);
  });
});

// ---------------------------------------------------------------------------
// Labor matrix + money assembly
// ---------------------------------------------------------------------------

describe("quote assembly", () => {
  it("interpolates in minutes, not level numbers", () => {
    // Kitchen matrix is deliberately nonlinear (25/40/60/85): the delta from
    // 3→4 (25) exceeds 1→2 (15). A mean level between 2 and 3 must be priced
    // via the matrix, which the consensus/exact cases pin down.
    const l2 = computeQuoteV2(cfg, input({ conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 } }), OPTS);
    const l3 = computeQuoteV2(cfg, input({ conditions: { kitchen: 3, bathroom: 3, bedroom: 3, living_room: 3 } }), OPTS);
    const l4 = computeQuoteV2(cfg, input({ conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 } }), OPTS);
    const d23 = l3.expectedLaborMinutes - l2.expectedLaborMinutes;
    const d34 = l4.expectedLaborMinutes - l3.expectedLaborMinutes;
    expect(d34).toBeGreaterThan(d23); // nonlinear spacing survives
  });

  it("money math is integer and reconciles: subtotal + tax + rounding = total", () => {
    const q = computeQuoteV2(cfg, input({ sqft: 1800, extras: [{ key: "inside_oven", quantity: 1 }] }), OPTS);
    for (const v of [q.subtotalCents, q.taxCents, q.totalCents, q.cleanerPayoutCents]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    const rounding = q.components.find((c) => c.code === "policy.rounding")?.amountCents ?? 0;
    expect(q.subtotalCents - q.discountCents + q.taxCents + rounding).toBe(q.totalCents);
  });

  it("ends the total in the configured charm digit", () => {
    const q = computeQuoteV2(cfg, input({ sqft: 2000 }), OPTS);
    expect((Math.round(q.totalCents / 100) % 10)).toBe(9);
    expect(q.totalCents % 100).toBe(0);
  });

  it("roundUpToEndingDigit boundary behavior", () => {
    expect(roundUpToEndingDigit(10000, 9)).toBe(10900);
    expect(roundUpToEndingDigit(10900, 9)).toBe(10900);
    expect(roundUpToEndingDigit(10901, 9)).toBe(11900);
  });

  it("applies the minimum booking floor as an explained component", () => {
    const tiny = { ...cfg, rates: { ...cfg.rates, minimumBookingCents: 50_000 } };
    const q = computeQuoteV2(tiny, input(), OPTS);
    expect(q.subtotalCents).toBe(50_000);
    expect(q.components.some((c) => c.code === "policy.minimum")).toBe(true);
  });

  it("flags quotes above the automatic limit for manual review", () => {
    const capped = { ...cfg, rates: { ...cfg.rates, maxAutoQuoteCents: 5_000 } };
    const q = computeQuoteV2(capped, input(), OPTS);
    expect(q.manualReviewRequired).toBe(true);
  });

  it("clutter and size add labor with explained components", () => {
    const base = computeQuoteV2(cfg, input(), OPTS);
    const q = computeQuoteV2(
      cfg,
      input({ clutter: { bathroom: 1 }, sqft: 1500 }),
      OPTS,
    );
    expect(q.expectedLaborMinutes).toBeGreaterThan(base.expectedLaborMinutes);
    expect(q.components.some((c) => c.code.startsWith("clutter.bathroom"))).toBe(true);
    expect(q.components.some((c) => c.code === "size.adjustment")).toBe(true);
  });

  it("substantially obstructed clutter requires review", () => {
    const q = computeQuoteV2(cfg, input({ clutter: { living_room: 2 } }), OPTS);
    expect(q.manualReviewRequired).toBe(true);
  });

  it("rejects unknown extras, bad quantities, and overlap-group conflicts", () => {
    expect(() => computeQuoteV2(cfg, input({ extras: [{ key: "nope", quantity: 1 }] }), OPTS)).toThrow(QuoteInputError);
    expect(() =>
      computeQuoteV2(cfg, input({ extras: [{ key: "inside_oven", quantity: 3 }] }), OPTS),
    ).toThrow(QuoteInputError);
    const overlapping = {
      ...cfg,
      extras: cfg.extras.map((e) =>
        e.key === "inside_oven" || e.key === "inside_fridge" ? { ...e, overlapGroup: "appliances" } : e,
      ),
    };
    expect(() =>
      computeQuoteV2(
        overlapping,
        input({ extras: [{ key: "inside_oven", quantity: 1 }, { key: "inside_fridge", quantity: 1 }] }),
        OPTS,
      ),
    ).toThrow(QuoteInputError);
  });

  it("cleaner payout is independent of the customer rate", () => {
    const pricier = { ...cfg, rates: { ...cfg.rates, customerLaborRateCentsPerHour: 9000 } };
    const a = computeQuoteV2(cfg, input(), OPTS);
    const b = computeQuoteV2(pricier, input(), OPTS);
    expect(b.totalCents).toBeGreaterThan(a.totalCents);
    expect(b.cleanerPayoutCents).toBe(a.cleanerPayoutCents);
  });

  it("scheduled minutes are >= expected, rounded to the increment; team/elapsed follow config", () => {
    const q = computeQuoteV2(cfg, input({ conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 } }), OPTS);
    expect(q.scheduledLaborMinutes).toBeGreaterThanOrEqual(q.expectedLaborMinutes);
    expect(q.scheduledLaborMinutes % cfg.scheduling.roundUpToIncrementMinutes).toBe(0);
    expect(q.recommendedTeamSize).toBe(2);
    expect(q.estimatedElapsedMinutes).toBe(Math.ceil((q.scheduledLaborMinutes * 1000) / 1800));
  });
});

// ---------------------------------------------------------------------------
// Minimum job total ("hourly rate PLUS a minimum") — docs/PRICING_V2.md
// ---------------------------------------------------------------------------

describe("minimum job total", () => {
  // A small light home whose natural subtotal sits well below the test minimums.
  const small = (partial: Partial<QuoteInputV2> = {}): QuoteInputV2 =>
    input({
      counts: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
      ...partial,
    });
  const withMinimum = (minimumBookingCents: number | undefined) => ({
    ...cfg,
    rates: { ...cfg.rates, minimumBookingCents, roundTotalUpToEndingDigit: null },
  });
  const taxOn = (cents: number) => Math.floor((2 * cents * cfg.rates.taxRateBps + 10_000) / 20_000);

  it("below the minimum: tops up pre-tax, flags minimumApplied, explains the component", () => {
    const q = computeQuoteV2(withMinimum(40_000), small(), OPTS);
    expect(q.minimumApplied).toBe(true);
    expect(q.subtotalCents).toBe(40_000);
    const topUp = q.components.find((c) => c.code === "policy.minimum");
    expect(topUp).toBeDefined();
    expect(topUp!.amountCents).toBeGreaterThan(0);
    // The top-up is exactly the gap between the natural subtotal and the minimum.
    const baseline = computeQuoteV2(withMinimum(0), small(), OPTS);
    expect(topUp!.amountCents).toBe(40_000 - baseline.subtotalCents);
    // Total = minimum + tax on the floored subtotal (charm rounding disabled).
    expect(q.totalCents).toBe(40_000 + taxOn(40_000));
    expect(q.totalCents).toBeGreaterThanOrEqual(40_000);
  });

  it("exactly at the minimum: no top-up, no flag, price unchanged", () => {
    const baseline = computeQuoteV2(withMinimum(0), small(), OPTS);
    const q = computeQuoteV2(withMinimum(baseline.subtotalCents), small(), OPTS);
    expect(q.minimumApplied).toBe(false);
    expect(q.components.some((c) => c.code === "policy.minimum")).toBe(false);
    expect(q.subtotalCents).toBe(baseline.subtotalCents);
    expect(q.totalCents).toBe(baseline.totalCents);
    // One cent above the subtotal and it bites.
    const above = computeQuoteV2(withMinimum(baseline.subtotalCents + 1), small(), OPTS);
    expect(above.minimumApplied).toBe(true);
    expect(above.subtotalCents).toBe(baseline.subtotalCents + 1);
  });

  it("above the minimum: untouched", () => {
    const baseline = computeQuoteV2(withMinimum(0), small(), OPTS);
    const q = computeQuoteV2(withMinimum(baseline.subtotalCents - 5_000), small(), OPTS);
    expect(q.minimumApplied).toBe(false);
    expect(q.subtotalCents).toBe(baseline.subtotalCents);
    expect(q.totalCents).toBe(baseline.totalCents);
  });

  it("interacts with condition levels: a heavy home outgrows the same minimum", () => {
    const light = computeQuoteV2(withMinimum(0), small(), OPTS);
    const heavyInput = small({ conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 } });
    const heavy = computeQuoteV2(withMinimum(0), heavyInput, OPTS);
    const minimum = Math.floor((light.subtotalCents + heavy.subtotalCents) / 2);
    const lightClamped = computeQuoteV2(withMinimum(minimum), small(), OPTS);
    const heavyClamped = computeQuoteV2(withMinimum(minimum), heavyInput, OPTS);
    expect(lightClamped.minimumApplied).toBe(true);
    expect(lightClamped.subtotalCents).toBe(minimum);
    expect(heavyClamped.minimumApplied).toBe(false);
    expect(heavyClamped.subtotalCents).toBe(heavy.subtotalCents);
  });

  it("applies AFTER the zip multiplier: a discounted area still floors at the minimum", () => {
    const noMin = computeQuoteV2(withMinimum(0), small({ zipMultiplierPct: -30 }), OPTS);
    const minimum = noMin.subtotalCents + 2_000; // discounted price sits below it
    const q = computeQuoteV2(withMinimum(minimum), small({ zipMultiplierPct: -30 }), OPTS);
    expect(q.minimumApplied).toBe(true);
    expect(q.subtotalCents).toBe(minimum);
    // The zip adjustment component is still explained; the floor comes after it.
    expect(q.components.some((c) => c.code === "adjustment.zip")).toBe(true);
  });

  it("applies AFTER the short-notice surcharge: a rush job floors exactly at the minimum", () => {
    const q = computeQuoteV2(withMinimum(60_000), small({ emergency: true }), OPTS);
    expect(q.minimumApplied).toBe(true);
    // The surcharge lands inside the floored amount, never on top of it.
    expect(q.subtotalCents).toBe(60_000);
  });

  it("backward compatible: a config WITHOUT the field prices exactly like minimum = 0", () => {
    const legacy = withMinimum(0) as { rates: Record<string, unknown> };
    delete legacy.rates.minimumBookingCents;
    const withoutField = computeQuoteV2(legacy as typeof cfg, small(), OPTS);
    const zeroMin = computeQuoteV2(withMinimum(0), small(), OPTS);
    expect(withoutField.minimumApplied).toBe(false);
    expect(withoutField.totalCents).toBe(zeroMin.totalCents);
    expect(withoutField.calculationFingerprint).toBe(zeroMin.calculationFingerprint);
    // …and the validator accepts it (absent = no minimum).
    expect(validatePricingConfig(legacy as typeof cfg).ok).toBe(true);
  });

  it("validator rejects a minimum above the automatic quote limit", () => {
    const bad = { ...cfg, rates: { ...cfg.rates, minimumBookingCents: cfg.rates.maxAutoQuoteCents + 1 } };
    const res = validatePricingConfig(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/Minimum booking total/);
  });
});

// ---------------------------------------------------------------------------
// Invariants / property tests (spec §12.2)
// ---------------------------------------------------------------------------

describe("invariants", () => {
  const levels: ConditionLevel[] = [1, 2, 3, 4];

  it("increasing any room-type condition never reduces expected labor", () => {
    for (const t of ROOM_TYPES_V2) {
      let previous = -1;
      for (const lvl of levels) {
        const conditions = { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2, [t]: lvl } as QuoteInputV2["conditions"];
        const q = computeQuoteV2(cfg, input({ conditions }), OPTS);
        expect(q.expectedLaborMinutes).toBeGreaterThanOrEqual(previous);
        previous = q.expectedLaborMinutes;
      }
    }
  });

  it("adding a room never reduces expected labor or subtotal", () => {
    for (const t of ["bathroom", "bedroom"] as RoomTypeV2[]) {
      let prevLabor = -1;
      let prevSubtotal = -1;
      for (let n = 1; n <= 6; n++) {
        const counts = { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1, [t]: n } as QuoteInputV2["counts"];
        const q = computeQuoteV2(
          cfg,
          input({ counts, conditions: { kitchen: 2, bathroom: 3, bedroom: 2, living_room: 1 } }),
          OPTS,
        );
        expect(q.expectedLaborMinutes).toBeGreaterThanOrEqual(prevLabor);
        expect(q.subtotalCents).toBeGreaterThanOrEqual(prevSubtotal);
        prevLabor = q.expectedLaborMinutes;
        prevSubtotal = q.subtotalCents;
      }
    }
  });

  it("adding a positive-time extra never reduces expected labor", () => {
    const without = computeQuoteV2(cfg, input(), OPTS);
    const withExtra = computeQuoteV2(cfg, input({ extras: [{ key: "baseboards", quantity: 1 }] }), OPTS);
    expect(withExtra.expectedLaborMinutes).toBeGreaterThan(without.expectedLaborMinutes);
  });

  it("identical inputs produce identical results and fingerprints (determinism)", () => {
    const a = computeQuoteV2(cfg, input({ conditions: { kitchen: 1, bathroom: 4, bedroom: 1, living_room: 2 }, sqft: 1400 }), OPTS);
    const b = computeQuoteV2(cfg, input({ conditions: { kitchen: 1, bathroom: 4, bedroom: 1, living_room: 2 }, sqft: 1400 }), OPTS);
    expect(a.calculationFingerprint).toBe(b.calculationFingerprint);
    expect(a.totalCents).toBe(b.totalCents);
    expect(a.roomInference).toEqual(b.roomInference);
  });

  it("fingerprint changes when input or version changes", () => {
    const a = computeQuoteV2(cfg, input(), OPTS);
    const b = computeQuoteV2(cfg, input({ sqft: 1000 }), OPTS);
    const c = computeQuoteV2(cfg, input(), { pricingVersionId: "other-version" });
    expect(a.calculationFingerprint).not.toBe(b.calculationFingerprint);
    expect(a.calculationFingerprint).not.toBe(c.calculationFingerprint);
  });

  it("normalizeQuoteInput rejects garbage", () => {
    expect(() => normalizeQuoteInput(input({ counts: { kitchen: -1, bathroom: 1, bedroom: 1, living_room: 1 } }))).toThrow(
      QuoteInputError,
    );
    expect(() =>
      normalizeQuoteInput(input({ conditions: { kitchen: 7 as ConditionLevel, bathroom: 1, bedroom: 1, living_room: 1 } })),
    ).toThrow(QuoteInputError);
  });
});

// ---------------------------------------------------------------------------
// Config validation guardrails
// ---------------------------------------------------------------------------

describe("validatePricingConfig", () => {
  it("accepts the cold-start config", () => {
    const res = validatePricingConfig(cfg);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("rejects non-monotone level minutes", () => {
    const bad = { ...cfg, laborMatrix: { ...cfg.laborMatrix, kitchen: [40, 30, 60, 85] as [number, number, number, number] } };
    const res = validatePricingConfig(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/must not decrease/);
  });

  it("rejects negative money and out-of-bound rates", () => {
    const bad = { ...cfg, rates: { ...cfg.rates, customerLaborRateCentsPerHour: 100 } };
    expect(validatePricingConfig(bad).ok).toBe(false);
  });

  it("rejects unordered inference thresholds", () => {
    const bad = {
      ...cfg,
      inference: { ...cfg.inference, thresholds: { ...cfg.inference.thresholds, bedroom: [2, 1, 3] as [number, number, number] } },
    };
    expect(validatePricingConfig(bad).ok).toBe(false);
  });

  it("blocks configs that produce negative margin on reference scenarios", () => {
    const bad = { ...cfg, payout: { ...cfg.payout, centsPerLaborHour: 50_000 } };
    const res = validatePricingConfig(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/negative margin/);
  });
});
