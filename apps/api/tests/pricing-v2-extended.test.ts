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
 * Pricing v2 formatVersion 2 — the extended multi-service ruleset.
 *
 * Covers: master-ruleset fixture import/round-trip, per-service-type engine
 * paths (matrix lookups, guardrails, condition multipliers, dirtiness
 * adjustments), deep-clean trigger matrix, short-notice tier boundaries,
 * location-tier zip clamping, laundry/tidying decoupling, suppression rules,
 * requiredTeamSize matrix + turnover-window logic, and the backward-compat
 * guarantee that a LEGACY config (no extendedRules) prices byte-identically
 * (the docs' worked example pins the exact total; the shadow test
 * pricing-v2-shadow.test.ts must also pass unchanged).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildColdStartConfig,
  buildDefaultExtendedRules,
  computeQuoteV2,
  getAirbnbStaffing,
  getAirbnbStaffingMatrix,
  normalizeQuoteInput,
  resolveEffectiveExtras,
  resolveTeamProductivityPermille,
  unwrapPricingRuleset,
  validatePricingConfig,
  validatePricingRuleset,
  QuoteInputError,
  MANUAL_REVIEW_REASONS,
  type PricingConfigV2,
  type QuoteInputV2,
} from "../src/lib/quoteEngine";

const OPTS = { pricingVersionId: "test-extended" };

const fixtureRaw = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "master-pricing-ruleset.json"), "utf8"),
) as Record<string, unknown>;

/** The master ruleset, flattened to the stored config shape. */
function masterConfig(): PricingConfigV2 {
  return unwrapPricingRuleset(fixtureRaw).config;
}

function baseInput(partial: Partial<QuoteInputV2> = {}): QuoteInputV2 {
  return {
    serviceArea: "default",
    currency: "USD",
    counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
    conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
    sqft: 1400,
    extras: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// 1. Master ruleset fixture: imports as-is, round-trips extended fields
// ---------------------------------------------------------------------------

describe("master ruleset fixture (SweeprExtendedPricingRuleset)", () => {
  it("unwraps the wrapper into a flat formatVersion-2 config", () => {
    const { config, meta } = unwrapPricingRuleset(fixtureRaw);
    expect(meta?.format).toBe("SweeprExtendedPricingRuleset");
    expect(config.formatVersion).toBe(2);
    expect(config.laborMatrix.kitchen).toEqual([35, 50, 70, 95]);
    expect(config.extendedRules?.moveInOut?.basePriceMatrixCents["3BR_2BA"]).toBe(41900);
  });

  it("validates as-is (the importer must accept the master ruleset)", () => {
    const result = validatePricingRuleset(fixtureRaw);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("preserves unknown/extended sections verbatim (JSONB round-trip shape)", () => {
    const cfg = masterConfig();
    const ext = cfg.extendedRules as Record<string, unknown>;
    // Sections the engine does not consume still survive untouched.
    expect(ext.accessDelayAndLockout).toBeDefined();
    expect(ext.cleanerOfferUI).toBeDefined();
    expect(Array.isArray(ext.implementationRequirementsForCaleb)).toBe(true);
    // A JSON round-trip (storage is JSONB) loses nothing.
    const roundTripped = JSON.parse(JSON.stringify(cfg)) as PricingConfigV2;
    expect(roundTripped.extendedRules).toEqual(cfg.extendedRules);
    expect(validatePricingConfig(roundTripped).ok).toBe(true);
  });

  it("a flat config with extendedRules passes through unwrap unchanged", () => {
    const flat = masterConfig();
    const again = unwrapPricingRuleset(flat);
    expect(again.config).toEqual(flat);
    expect(again.meta).toBeNull();
  });

  it("the built-in default extended rules validate on the cold-start config", () => {
    const cfg = buildColdStartConfig();
    cfg.formatVersion = 2;
    cfg.extendedRules = buildDefaultExtendedRules();
    expect(validatePricingConfig(cfg).errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Backward compatibility: legacy configs price byte-identically
// ---------------------------------------------------------------------------

describe("legacy config backward compatibility", () => {
  it("prices the documented worked example at exactly $329.00", () => {
    // docs/PRICING_V2.md: 3 bed / 2 bath / kitchen / living all level 2,
    // 1600 sqft, cold-start config → 249 min → $329.00. Any drift here means
    // the legacy path is no longer byte-identical.
    const q = computeQuoteV2(
      buildColdStartConfig(),
      baseInput({
        conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
        sqft: 1600,
      }),
      OPTS,
    );
    expect(q.expectedLaborMinutes).toBe(249);
    expect(q.totalCents).toBe(32900);
    expect(q.serviceType).toBe("standard");
    expect(q.deepCleanApplied).toBe(false);
  });

  it("legacy normalized input carries no formatVersion-2 keys (stable fingerprints)", () => {
    const normalized = normalizeQuoteInput(baseInput());
    const json = JSON.stringify(normalized);
    for (const key of [
      "serviceType",
      "conditionLevel",
      "hoursUntilService",
      "turnoverWindowHours",
      "severeMess",
      "unsafeConditions",
      "petHair",
      "airbnbDiscount",
    ]) {
      expect(json).not.toContain(`"${key}"`);
    }
  });

  it("a legacy config emits no extended components and keeps the legacy emergency surcharge", () => {
    const q = computeQuoteV2(
      buildColdStartConfig(),
      baseInput({ emergency: true, hoursUntilService: 30 }),
      OPTS,
    );
    const codes = q.components.map((c) => c.code);
    expect(codes).toContain("adjustment.emergency");
    expect(codes).not.toContain("adjustment.short_notice");
    expect(codes).not.toContain("deep_clean.allowance");
  });

  it("matrix service types fall back to the standard path on a legacy config", () => {
    const q = computeQuoteV2(
      buildColdStartConfig(),
      baseInput({ serviceType: "moveInOut", conditionLevel: 2 }),
      OPTS,
    );
    expect(q.serviceType).toBe("standard");
    expect(q.components.some((c) => c.code === "labor.subtotal")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Move-In/Out path
// ---------------------------------------------------------------------------

describe("moveInOut path", () => {
  const cfg = masterConfig();

  it("prices from the BR/BA matrix (3BR/2BA level 1 = $419.00, no scaling)", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({ serviceType: "moveInOut", conditionLevel: 1, sqft: 1400 }),
      OPTS,
    );
    expect(q.serviceType).toBe("moveInOut");
    expect(q.totalCents).toBe(41900); // tax 0, rounding off in the master config
    expect(q.components.find((c) => c.code === "service.base")?.amountCents).toBe(41900);
    // NO standard size scaling component.
    expect(q.components.some((c) => c.code === "size.adjustment")).toBe(false);
  });

  it("applies condition multipliers L1-L4 (0/10/20/30%)", () => {
    const totals = ([1, 2, 3, 4] as const).map(
      (lvl) =>
        computeQuoteV2(
          cfg,
          baseInput({ serviceType: "moveInOut", conditionLevel: lvl, sqft: 1400 }),
          OPTS,
        ).totalCents,
    );
    expect(totals).toEqual([41900, 46090, 50280, 54470]);
  });

  it("charges the oversized-home guardrail at $15 per extra 250 sqft", () => {
    // 3BR included sqft (shared per-bedroom table) = 1500; 2000 sqft → 2
    // increments × $15 = $30.
    const q = computeQuoteV2(
      cfg,
      baseInput({ serviceType: "moveInOut", conditionLevel: 1, sqft: 2000 }),
      OPTS,
    );
    const guardrail = q.components.find((c) => c.code === "service.size_guardrail");
    expect(guardrail?.amountCents).toBe(3000);
    expect(q.totalCents).toBe(44900);
  });

  it("resolves a missing BR/BA combo to the nearest entry with a warning", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        serviceType: "moveInOut",
        counts: { kitchen: 1, bathroom: 1, bedroom: 3, living_room: 1 },
        conditionLevel: 1,
        sqft: 1200,
      }),
      OPTS,
    );
    // 3BR_1BA is not in the price matrix → nearest at 3BR is 3BR_2BA.
    expect(q.components.find((c) => c.code === "service.base")?.amountCents).toBe(41900);
    expect(q.warnings.some((w) => w.includes("closest home size"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Airbnb/STR path
// ---------------------------------------------------------------------------

describe("airbnb path", () => {
  const cfg = masterConfig();
  const turnover = (partial: Partial<QuoteInputV2> = {}): QuoteInputV2 =>
    baseInput({
      serviceType: "airbnb",
      counts: { kitchen: 1, bathroom: 2, bedroom: 2, living_room: 1 },
      conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
      conditionLevel: 1,
      sqft: 1100,
      ...partial,
    });

  it("prices from the turnover matrix (2BR/2BA level 1 = $199.00)", () => {
    const q = computeQuoteV2(cfg, turnover(), OPTS);
    expect(q.serviceType).toBe("airbnb");
    expect(q.totalCents).toBe(19900);
  });

  it("dirtiness adjustments: L1/L2 0%, L3 +20%, L4 +35%", () => {
    const totals = ([1, 2, 3, 4] as const).map(
      (lvl) => computeQuoteV2(cfg, turnover({ conditionLevel: lvl }), OPTS).totalCents,
    );
    expect(totals).toEqual([19900, 19900, 23880, 26865]);
  });

  it("size guardrail: $12 per extra 250 sqft above the per-bedroom allowance", () => {
    // 2BR includes 1250 sqft; 1600 sqft → 2 increments × $12 = $24.
    const q = computeQuoteV2(cfg, turnover({ sqft: 1600 }), OPTS);
    expect(q.components.find((c) => c.code === "service.size_guardrail")?.amountCents).toBe(2400);
    expect(q.totalCents).toBe(22300);
  });

  it("dirtiness applies to base + guardrail", () => {
    const q = computeQuoteV2(cfg, turnover({ sqft: 1600, conditionLevel: 3 }), OPTS);
    // (19900 + 2400) × 20% = 4460.
    expect(q.components.find((c) => c.code === "service.dirtiness")?.amountCents).toBe(4460);
  });

  it("severe mess flags manual review with formal customer copy", () => {
    const q = computeQuoteV2(cfg, turnover({ severeMess: true }), OPTS);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.SEVERE_MESS);
    expect(q.warnings.some((w) => w.includes("review by our team"))).toBe(true);
  });

  it("suppresses turnover-included add-ons and keeps paid ones payable", () => {
    const base = computeQuoteV2(cfg, turnover(), OPTS);
    const withSuppressed = computeQuoteV2(
      cfg,
      turnover({
        extras: [
          { key: "patio_sweep", quantity: 1 },
          { key: "load_dishwasher", quantity: 1 },
          { key: "change_bed_linens", quantity: 2 },
        ],
      }),
      OPTS,
    );
    // Included in the turnover base: no charge, labeled as included.
    expect(withSuppressed.totalCents).toBe(base.totalCents);
    expect(withSuppressed.components.some((c) => c.code === "included.patio_sweep")).toBe(true);
    expect(withSuppressed.components.some((c) => c.code === "included.load_dishwasher")).toBe(true);

    const withPaid = computeQuoteV2(
      cfg,
      turnover({ extras: [{ key: "garage_sweep", quantity: 1 }] }),
      OPTS,
    );
    expect(withPaid.totalCents).toBeGreaterThan(base.totalCents);
  });

  it("repeat/volume discount applies only to base + guardrail, before everything else", () => {
    const q = computeQuoteV2(
      cfg,
      turnover({
        sqft: 1600,
        conditionLevel: 3,
        airbnbDiscount: { kind: "host_volume", percent: 10 },
      }),
      OPTS,
    );
    // Base 19900 + guardrail 2400 = 22300 → 10% = 2230 (dirtiness excluded).
    expect(q.appliedDiscount).toEqual({
      kind: "host_volume",
      percent: 10,
      amountCents: 2230,
    });
    const line = q.components.find((c) => c.code === "discount.airbnb_volume");
    expect(line?.amountCents).toBe(-2230);
    // Labeled breakdown line present for the ledger.
    expect(line?.label).toContain("Host volume discount");
  });
});

// ---------------------------------------------------------------------------
// 5. Deep-clean auto-classification (standard path)
// ---------------------------------------------------------------------------

describe("deep-clean auto-classification", () => {
  const cfg = masterConfig();

  it("triggers on one level-4 room", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({ conditions: { kitchen: 4, bathroom: 1, bedroom: 1, living_room: 1 } }),
      OPTS,
    );
    expect(q.deepCleanApplied).toBe(true);
  });

  it("triggers on two level-3 rooms (across types)", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({ conditions: { kitchen: 3, bathroom: 3, bedroom: 1, living_room: 1 } }),
      OPTS,
    );
    expect(q.deepCleanApplied).toBe(true);
  });

  it("triggers when 40%+ of counted rooms are level 3/4 (direct counts)", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        counts: { kitchen: 1, bathroom: 1, bedroom: 2, living_room: 1 },
        conditions: { kitchen: 1, bathroom: 1, bedroom: 3, living_room: 1 },
        countsByLevel: { bedroom: [0, 0, 2, 0] },
      }),
      OPTS,
    );
    // 2 level-3 bedrooms of 5 counted rooms = 40%.
    expect(q.deepCleanApplied).toBe(true);
  });

  it("a consensus all-level-3 home is a deep clean", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({ conditions: { kitchen: 3, bathroom: 3, bedroom: 3, living_room: 3 } }),
      OPTS,
    );
    expect(q.deepCleanApplied).toBe(true);
  });

  it("does not trigger on a single level-3 worst room in a larger home", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({ conditions: { kitchen: 1, bathroom: 3, bedroom: 1, living_room: 1 } }),
      OPTS,
    );
    expect(q.deepCleanApplied).toBe(false);
  });

  it("add-ons never trigger it", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        extras: [
          { key: "inside_oven", quantity: 1 },
          { key: "detailed_grout_scrub", quantity: 2 },
        ],
      }),
      OPTS,
    );
    expect(q.deepCleanApplied).toBe(false);
  });

  it("adds +10% of the BASE workload only — add-ons excluded, no surcharge line", () => {
    const without = computeQuoteV2(
      cfg,
      baseInput({ conditions: { kitchen: 4, bathroom: 1, bedroom: 1, living_room: 1 }, extras: [] }),
      OPTS,
    );
    const allowance = without.components.find((c) => c.code === "deep_clean.allowance");
    expect(allowance).toBeDefined();
    // The allowance is labor minutes, never a customer-facing dollar line.
    expect(allowance!.amountCents).toBe(0);
    expect(allowance!.laborMinutes).toBeGreaterThan(0);

    // Adding a purchased add-on does not grow the allowance.
    const withAddon = computeQuoteV2(
      cfg,
      baseInput({
        conditions: { kitchen: 4, bathroom: 1, bedroom: 1, living_room: 1 },
        extras: [{ key: "detailed_grout_scrub", quantity: 2 }],
      }),
      OPTS,
    );
    const allowance2 = withAddon.components.find((c) => c.code === "deep_clean.allowance");
    expect(allowance2!.laborMinutes).toBe(allowance!.laborMinutes);
  });
});

// ---------------------------------------------------------------------------
// 6. Short-notice tiers (never stacking)
// ---------------------------------------------------------------------------

describe("short-notice tiers", () => {
  const cfg = masterConfig();
  const at = (hours: number | undefined, emergency = false) =>
    computeQuoteV2(cfg, baseInput({ hoursUntilService: hours, emergency }), OPTS);

  function shortNoticeCents(q: ReturnType<typeof computeQuoteV2>): number {
    return q.components.find((c) => c.code === "adjustment.short_notice")?.amountCents ?? 0;
  }

  it("under 24h charges 15%", () => {
    const q = at(2);
    expect(shortNoticeCents(q)).toBeGreaterThan(0);
    expect(q.components.find((c) => c.code === "adjustment.short_notice")?.label).toContain("15%");
  });

  it("boundary: 23.99h is 15%, 24h is 5%, 48h is 5%, 48.5h is 0%", () => {
    expect(at(23.99).components.find((c) => c.code === "adjustment.short_notice")?.label).toContain(
      "15%",
    );
    expect(at(24).components.find((c) => c.code === "adjustment.short_notice")?.label).toContain(
      "5%",
    );
    expect(at(48).components.find((c) => c.code === "adjustment.short_notice")?.label).toContain(
      "5%",
    );
    expect(shortNoticeCents(at(48.5))).toBe(0);
    expect(shortNoticeCents(at(72))).toBe(0);
  });

  it("never stacks: exactly one short-notice component, and no legacy emergency line", () => {
    const q = at(2, true);
    const lines = q.components.filter(
      (c) => c.code === "adjustment.short_notice" || c.code === "adjustment.emergency",
    );
    expect(lines.length).toBe(1);
    expect(lines[0].code).toBe("adjustment.short_notice");
  });

  it("a legacy emergency boolean without hours maps to the strictest tier", () => {
    const q = at(undefined, true);
    expect(q.components.find((c) => c.code === "adjustment.short_notice")?.label).toContain("15%");
  });
});

// ---------------------------------------------------------------------------
// 7. Location tiers (ZIP) — supersede legacy discounts, cap at +10%
// ---------------------------------------------------------------------------

describe("location tiers", () => {
  const cfg = masterConfig();

  it("ignores legacy negative zip adjustments (94541 -5% is superseded)", () => {
    const neutral = computeQuoteV2(cfg, baseInput({ zipMultiplierPct: 0 }), OPTS);
    const negative = computeQuoteV2(cfg, baseInput({ zipMultiplierPct: -5 }), OPTS);
    expect(negative.totalCents).toBe(neutral.totalCents);
    expect(negative.components.some((c) => c.code === "adjustment.zip")).toBe(false);
  });

  it("applies positive tiers and caps at +10%", () => {
    const five = computeQuoteV2(cfg, baseInput({ zipMultiplierPct: 5 }), OPTS);
    expect(five.components.find((c) => c.code === "adjustment.zip")?.label).toContain("5.00%");
    const fifteen = computeQuoteV2(cfg, baseInput({ zipMultiplierPct: 15 }), OPTS);
    expect(fifteen.components.find((c) => c.code === "adjustment.zip")?.label).toContain("10.00%");
  });

  it("a legacy config still honors negative zip adjustments", () => {
    const legacy = buildColdStartConfig();
    const q = computeQuoteV2(legacy, baseInput({ zipMultiplierPct: -5 }), OPTS);
    expect(q.components.find((c) => c.code === "adjustment.zip")?.amountCents).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Labor/scheduling decoupling (laundry, light tidying, oven, pet hair)
// ---------------------------------------------------------------------------

describe("labor/scheduling decoupling", () => {
  const cfg = masterConfig();

  it("laundry: $25/load fixed (max 2), active labor schedules, machine time never bills", () => {
    const without = computeQuoteV2(cfg, baseInput(), OPTS);
    const withLaundry = computeQuoteV2(
      cfg,
      baseInput({ extras: [{ key: "laundry", quantity: 2 }] }),
      OPTS,
    );
    // Exactly $50 — the 50 active minutes are NOT billed at the labor rate.
    expect(withLaundry.totalCents - without.totalCents).toBe(5000);
    expect(withLaundry.expectedLaborMinutes).toBe(without.expectedLaborMinutes);
    // Machine cycles: 35 wash + 60/load dry, pipelined → 155 for two loads.
    expect(withLaundry.laborScheduling.machineElapsedMinutes).toBe(155);
    // The cleaner's active time grows; on-site covers the cycle completion.
    expect(withLaundry.laborScheduling.activeLaborMinutes).toBe(
      without.laborScheduling.activeLaborMinutes + 50,
    );
    expect(withLaundry.laborScheduling.onSiteMinutes).toBeGreaterThanOrEqual(
      withLaundry.laborScheduling.machineElapsedMinutes,
    );
    // Three loads exceed the max.
    expect(() =>
      computeQuoteV2(cfg, baseInput({ extras: [{ key: "laundry", quantity: 3 }] }), OPTS),
    ).toThrow(QuoteInputError);
  });

  it("light tidying: activated, $25 per 30-minute block, decoupled from the labor rate", () => {
    const effective = resolveEffectiveExtras(cfg);
    const tidying = effective.find((e) => e.key === "organization_light");
    expect(tidying?.active).toBe(true);
    expect(tidying?.mode).toBe("fixed");
    expect(tidying?.fixedCentsPerUnit).toBe(2500);
    expect(tidying?.activeLaborMinutesPerUnit).toBe(30);

    const without = computeQuoteV2(cfg, baseInput(), OPTS);
    const withTidying = computeQuoteV2(
      cfg,
      baseInput({ extras: [{ key: "organization_light", quantity: 2 }] }),
      OPTS,
    );
    expect(withTidying.totalCents - without.totalCents).toBe(5000);
    expect(withTidying.laborScheduling.activeLaborMinutes).toBe(
      without.laborScheduling.activeLaborMinutes + 60,
    );
  });

  it("inside oven: $40 customer price with 35 minutes of active labor", () => {
    const without = computeQuoteV2(cfg, baseInput(), OPTS);
    const withOven = computeQuoteV2(
      cfg,
      baseInput({ extras: [{ key: "inside_oven", quantity: 1 }] }),
      OPTS,
    );
    expect(withOven.totalCents - without.totalCents).toBe(4000);
    expect(withOven.laborScheduling.activeLaborMinutes).toBe(
      without.laborScheduling.activeLaborMinutes + 35,
    );
  });

  it("pet hair prices as 5/15/25% of the base workload (customer-picked tier)", () => {
    const none = computeQuoteV2(cfg, baseInput(), OPTS);
    const light = computeQuoteV2(cfg, baseInput({ petHair: "light" }), OPTS);
    const moderate = computeQuoteV2(cfg, baseInput({ petHair: "moderate" }), OPTS);
    const heavy = computeQuoteV2(cfg, baseInput({ petHair: "heavy" }), OPTS);
    expect(light.totalCents).toBeGreaterThan(none.totalCents);
    expect(moderate.totalCents).toBeGreaterThan(light.totalCents);
    expect(heavy.totalCents).toBeGreaterThan(moderate.totalCents);
    expect(moderate.components.find((c) => c.code === "extra.pet_hair")?.label).toContain("15%");
    // The flat $39 placeholder is retired when tiers are configured.
    expect(() =>
      computeQuoteV2(cfg, baseInput({ extras: [{ key: "pet_hair_detail", quantity: 1 }] }), OPTS),
    ).toThrow(QuoteInputError);
  });
});

// ---------------------------------------------------------------------------
// 9. Suppression / mutual-exclusion rules
// ---------------------------------------------------------------------------

describe("extras suppression and mutual exclusion", () => {
  const cfg = masterConfig();

  it("basic patio sweep and patio + cobweb detail are mutually exclusive", () => {
    expect(() =>
      computeQuoteV2(
        cfg,
        baseInput({
          extras: [
            { key: "patio_sweep", quantity: 1 },
            { key: "patio_sweep_cobwebs", quantity: 1 },
          ],
        }),
        OPTS,
      ),
    ).toThrow(QuoteInputError);
  });

  it("bed linens and laundry cannot double-charge for overlapping work", () => {
    expect(() =>
      computeQuoteV2(
        cfg,
        baseInput({
          extras: [
            { key: "change_bed_linens", quantity: 2 },
            { key: "laundry", quantity: 1 },
          ],
        }),
        OPTS,
      ),
    ).toThrow(QuoteInputError);
  });

  it("sliding glass door detail includes its track — duplicate track charge suppressed", () => {
    const doorOnly = computeQuoteV2(
      cfg,
      baseInput({ extras: [{ key: "sliding_glass_door_cleaning", quantity: 1 }] }),
      OPTS,
    );
    const doorPlusOneTrack = computeQuoteV2(
      cfg,
      baseInput({
        extras: [
          { key: "sliding_glass_door_cleaning", quantity: 1 },
          { key: "window_track_cleaning", quantity: 1 },
        ],
      }),
      OPTS,
    );
    // The one track is the door's own track: no extra charge, labeled included.
    expect(doorPlusOneTrack.totalCents).toBe(doorOnly.totalCents);
    expect(
      doorPlusOneTrack.components.some((c) => c.code === "included.window_track_cleaning"),
    ).toBe(true);
    // Additional tracks beyond the door still bill.
    const doorPlusThree = computeQuoteV2(
      cfg,
      baseInput({
        extras: [
          { key: "sliding_glass_door_cleaning", quantity: 1 },
          { key: "window_track_cleaning", quantity: 3 },
        ],
      }),
      OPTS,
    );
    expect(doorPlusThree.totalCents).toBeGreaterThan(doorOnly.totalCents);
  });
});

// ---------------------------------------------------------------------------
// 10. Staffing: requiredTeamSize matrix + turnover-window rules
// ---------------------------------------------------------------------------

describe("staffing contract", () => {
  const cfg = masterConfig();

  it("resolved productivity map includes the three-cleaner entry", () => {
    const map = resolveTeamProductivityPermille(cfg);
    expect(map["1"]).toBe(1000);
    expect(map["2"]).toBe(1800);
    expect(map["3"]).toBe(2500);
  });

  it("typed staffing accessors read the matrix", () => {
    expect(getAirbnbStaffingMatrix(cfg)).toBeTruthy();
    expect(getAirbnbStaffing(cfg, 1, 1, 1)).toBe(1);
    expect(getAirbnbStaffing(cfg, 3, 2, 3)).toBe(3);
    expect(getAirbnbStaffing(cfg, 4, 3, 1)).toBe(3);
    expect(getAirbnbStaffing(cfg, 5, 3, 4)).toBe(3);
  });

  const turnover = (partial: Partial<QuoteInputV2> = {}): QuoteInputV2 => ({
    serviceArea: "default",
    currency: "USD",
    counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
    conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
    sqft: 1400,
    extras: [],
    serviceType: "airbnb",
    conditionLevel: 1,
    ...partial,
  });

  it("uses the staffing matrix for the default 5-hour window", () => {
    const q = computeQuoteV2(cfg, turnover({ turnoverWindowHours: 5 }), OPTS);
    expect(q.requiredTeamSize).toBe(2); // 3BR_2BA L1 = 2
  });

  it("a window under 4 hours staffs up AND flags manual review", () => {
    const q = computeQuoteV2(cfg, turnover({ turnoverWindowHours: 3 }), OPTS);
    expect(q.requiredTeamSize).toBe(3);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.TURNOVER_WINDOW);
  });

  it("a 6h+ window may reduce one cleaner for light condition, never for L3/L4", () => {
    const light = computeQuoteV2(cfg, turnover({ turnoverWindowHours: 8 }), OPTS);
    expect(light.requiredTeamSize).toBe(1); // reduced from 2 (L1, fits the window)
    const heavy = computeQuoteV2(
      cfg,
      turnover({
        conditionLevel: 4,
        conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 },
        turnoverWindowHours: 12,
      }),
      OPTS,
    );
    expect(heavy.requiredTeamSize).toBe(3); // 3BR_2BA L4 = 3, never reduced
  });
});

// ---------------------------------------------------------------------------
// 11. Manual-review triggers
// ---------------------------------------------------------------------------

describe("manual-review triggers", () => {
  const cfg = masterConfig();

  it("4000+ sqft requires review with formal copy", () => {
    const q = computeQuoteV2(cfg, baseInput({ sqft: 4200 }), OPTS);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.SQFT);
    expect(q.warnings.some((w) => w.includes("review"))).toBe(true);
  });

  it("a $1,000+ computed price requires review", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        counts: { kitchen: 1, bathroom: 4, bedroom: 6, living_room: 2 },
        conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 },
        sqft: 3800,
      }),
      OPTS,
    );
    expect(q.totalCents).toBeGreaterThan(100000);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.PRICE);
  });

  it("recognized unsafe conditions require review", () => {
    const q = computeQuoteV2(cfg, baseInput({ unsafeConditions: ["significant_mold"] }), OPTS);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.UNSAFE);
  });

  it("obstructed clutter carries its machine-readable reason", () => {
    const q = computeQuoteV2(cfg, baseInput({ clutter: { kitchen: 2 } }), OPTS);
    expect(q.manualReviewRequired).toBe(true);
    expect(q.manualReviewReasons).toContain(MANUAL_REVIEW_REASONS.OBSTRUCTED);
  });

  it("the arrival-mismatch reason exists as a shared constant (day-of-service sets it)", () => {
    expect(MANUAL_REVIEW_REASONS.ARRIVAL_MISMATCH).toBe("arrival_condition_mismatch");
  });
});

// ---------------------------------------------------------------------------
// 12. Minimum booking total on the extended config
// ---------------------------------------------------------------------------

describe("minimum booking total (master config: $139)", () => {
  const cfg = masterConfig();

  it("floors a tiny standard job at $139 with the policy.minimum line", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        counts: { kitchen: 1, bathroom: 1, bedroom: 0, living_room: 0 },
        conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
        sqft: 500,
      }),
      OPTS,
    );
    expect(q.minimumApplied).toBe(true);
    expect(q.subtotalCents).toBe(13900);
    expect(q.components.some((c) => c.code === "policy.minimum")).toBe(true);
  });

  it("a studio turnover ($149) clears the minimum untouched", () => {
    const q = computeQuoteV2(
      cfg,
      baseInput({
        serviceType: "airbnb",
        counts: { kitchen: 1, bathroom: 1, bedroom: 0, living_room: 1 },
        conditionLevel: 1,
        sqft: 600,
      }),
      OPTS,
    );
    expect(q.totalCents).toBe(14900);
    expect(q.minimumApplied).toBe(false);
  });
});
