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
 * Pricing v2 configuration guardrails (spec §8.9). Hard errors block
 * publication; warnings surface in change review but allow it. Thresholds
 * live here centrally — never hard-coded into UI components.
 */

import { computeQuoteV2 } from "./engine";
import { unwrapPricingRuleset } from "./extended";
import {
  ROOM_TYPES_V2,
  type ExtendedRulesV2,
  type PricingConfigV2,
  type QuoteInputV2,
} from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export const VALIDATION_BOUNDS = {
  minLaborRateCents: 2000, // $20/labor-hour
  maxLaborRateCents: 25_000, // $250/labor-hour
  maxRoomMinutes: 600,
  maxCellChangeWarnPct: 40,
  maxTaxBps: 2000,
  maxEmergencyBps: 5000,
  maxBufferPermille: 500,
  // Flat customer-elected extra-cleaner fee: at most $50 per 100 sqft.
  maxExtraCleanerFeeCentsPer100Sqft: 5000,
} as const;

/** Reference scenarios used for margin/impact checks and admin previews. */
export const REFERENCE_SCENARIOS: Array<{ key: string; label: string; input: QuoteInputV2 }> = [
  {
    key: "small_light",
    label: "Small, light condition (1 bed / 1 bath)",
    input: {
      serviceArea: "default",
      currency: "USD",
      counts: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
      conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
      sqft: 750,
      extras: [],
    },
  },
  {
    key: "typical",
    label: "Typical recurring home (3 bed / 2 bath)",
    input: {
      serviceArea: "default",
      currency: "USD",
      counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
      conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
      sqft: 1600,
      extras: [],
    },
  },
  {
    key: "large_heavy",
    label: "Larger, heavy condition (4 bed / 3 bath)",
    input: {
      serviceArea: "default",
      currency: "USD",
      counts: { kitchen: 1, bathroom: 3, bedroom: 4, living_room: 1 },
      conditions: { kitchen: 4, bathroom: 4, bedroom: 4, living_room: 4 },
      sqft: 2600,
      extras: [{ key: "inside_oven", quantity: 1 }],
    },
  },
];

const COMBO_KEY_RE = /^(Studio_or_1BR|\d+BR)_\d+BA$/;
const BEDROOM_KEY_RE = /^(Studio_or_1BR|\d+BR)$/;

/**
 * Guardrails for the extended (formatVersion 2) ruleset. Only the sections
 * the engine consumes are validated; unknown sections and unknown keys are
 * PRESERVED verbatim (they round-trip through storage, Studio, and MCP
 * untouched) — the master ruleset must validate as-is.
 */
function validateExtendedRules(ext: ExtendedRulesV2, errors: string[], warnings: string[]): void {
  const isCents = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

  const checkComboMatrix = (label: string, matrix: Record<string, unknown> | undefined): void => {
    if (!matrix) return;
    const keys = Object.keys(matrix);
    if (keys.length === 0) errors.push(`${label} must have at least one BR/BA entry.`);
    for (const key of keys) {
      if (!COMBO_KEY_RE.test(key)) {
        errors.push(`${label}: key "${key}" is not a BR/BA key (e.g. "3BR_2BA" or "Studio_or_1BR_1BA").`);
      }
    }
  };

  const checkLevelPercents = (
    label: string,
    map: { L1?: number; L2?: number; L3?: number; L4?: number } | undefined,
  ): void => {
    if (!map) return;
    for (const lvl of ["L1", "L2", "L3", "L4"] as const) {
      const v = map[lvl];
      if (v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 100)) {
        errors.push(`${label} ${lvl} must be a percent between 0 and 100.`);
      }
    }
  };

  if (ext.deepClean) {
    const pct = ext.deepClean.baseWorkloadMultiplierPercent;
    if (pct !== undefined && !(Number.isFinite(pct) && pct >= 0 && pct <= 100)) {
      errors.push("Deep-clean base workload multiplier must be a percent between 0 and 100.");
    }
  }

  if (ext.moveInOut) {
    checkComboMatrix("Move-in/out price matrix", ext.moveInOut.basePriceMatrixCents);
    for (const [key, v] of Object.entries(ext.moveInOut.basePriceMatrixCents ?? {})) {
      if (!isCents(v) || v <= 0) errors.push(`Move-in/out price for ${key} must be a positive whole number of cents.`);
    }
    checkLevelPercents("Move-in/out condition multiplier", ext.moveInOut.conditionMultipliersPercent);
    const per = ext.moveInOut.oversizedHomeGuardrail?.priceCentsPerAdditional250Sqft;
    if (per !== undefined && !isCents(per)) {
      errors.push("Move-in/out oversized-home guardrail must be a whole number of cents per 250 sqft.");
    }
  }

  if (ext.airbnbSTR) {
    checkComboMatrix("Airbnb turnover price matrix", ext.airbnbSTR.basePriceMatrixCents);
    for (const [key, v] of Object.entries(ext.airbnbSTR.basePriceMatrixCents ?? {})) {
      if (!isCents(v) || v <= 0) errors.push(`Turnover price for ${key} must be a positive whole number of cents.`);
    }
    checkLevelPercents("Airbnb dirtiness adjustment", ext.airbnbSTR.dirtinessAdjustmentPercent);
    const g = ext.airbnbSTR.sizeGuardrail;
    if (g) {
      const per = g.priceCentsPerAdditional250Sqft;
      if (per !== undefined && !isCents(per)) {
        errors.push("Airbnb size guardrail must be a whole number of cents per increment.");
      }
      for (const [key, v] of Object.entries(g.includedSqftByBedroomCount ?? {})) {
        if (!BEDROOM_KEY_RE.test(key)) {
          errors.push(`Airbnb included-sqft table: key "${key}" is not a bedroom key (e.g. "3BR" or "Studio_or_1BR").`);
        }
        if (!Number.isInteger(v) || (v as number) <= 0) {
          errors.push(`Airbnb included sqft for ${key} must be a positive whole number.`);
        }
      }
    }
    for (const [key, row] of Object.entries(ext.airbnbSTR.staffingMatrix ?? {})) {
      if (!COMBO_KEY_RE.test(key)) {
        errors.push(`Airbnb staffing matrix: key "${key}" is not a BR/BA key.`);
      }
      for (const lvl of ["L1", "L2", "L3", "L4"] as const) {
        const v = row?.[lvl];
        if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 5)) {
          errors.push(`Airbnb staffing for ${key} ${lvl} must be a whole number of cleaners (1 to 5).`);
        }
      }
    }
    const d = ext.airbnbSTR.repeatVolumeDiscounts;
    if (d) {
      for (const [label, v] of [
        ["Repeat-property discount", d.secondAndLaterSamePropertyPercent],
        ["Host volume discount", d.hostRolling30DayDiscountPercent],
      ] as const) {
        if (v !== undefined && !(Number.isFinite(v) && v >= 0 && v <= 50)) {
          errors.push(`${label} must be a percent between 0 and 50.`);
        }
      }
      const t = d.hostRolling30DayCompletedTurnoversThreshold;
      if (t !== undefined && !(Number.isInteger(t) && t >= 1)) {
        errors.push("Host volume threshold must be a whole number of turnovers (at least 1).");
      }
    }
  }

  if (ext.shortNotice?.tiers) {
    if (!Array.isArray(ext.shortNotice.tiers)) {
      errors.push("Short-notice tiers must be a list.");
    } else {
      for (const tier of ext.shortNotice.tiers) {
        const pct = tier?.surchargePercent;
        if (!(Number.isFinite(pct) && (pct as number) >= 0 && (pct as number) <= 50)) {
          errors.push("Each short-notice tier needs a surcharge percent between 0 and 50.");
        }
      }
    }
  }

  if (ext.locationPricing) {
    const cap = ext.locationPricing.initialCapPercent;
    if (cap !== undefined && !(Number.isFinite(cap) && cap >= 0 && cap <= 25)) {
      errors.push("Location-tier cap must be a percent between 0 and 25.");
    }
    for (const [name, v] of Object.entries(ext.locationPricing.tiersPercent ?? {})) {
      if (!(Number.isFinite(v) && v >= 0 && v <= (cap ?? 10))) {
        errors.push(`Location tier "${name}" must be between 0% and the cap.`);
      }
    }
  }

  const o = ext.extrasAppSideOverrides;
  if (o) {
    for (const [label, v] of [
      ["Inside-oven price", o.insideOven?.customerPriceCents],
      ["Laundry price per load", o.laundry?.customerPriceCentsPerLoad],
      ["Light Tidying price per block", o.lightTidying?.customerPriceCentsPer30MinuteBlock],
      ["Sliding glass door price", o.slidingGlassDoor?.detailPriceCents],
    ] as const) {
      if (v !== undefined && !isCents(v)) errors.push(`${label} must be a whole number of cents.`);
    }
    const tiers = o.petHair?.percentageTiers;
    if (tiers !== undefined) {
      if (!Array.isArray(tiers) || tiers.length !== 3 || tiers.some((t) => !(Number.isFinite(t) && t >= 0 && t <= 100))) {
        errors.push("Pet-hair tiers must be three percents (light, moderate, heavy) between 0 and 100.");
      } else if (tiers[0] > tiers[1] || tiers[1] > tiers[2]) {
        errors.push("Pet-hair tiers must not decrease from light to heavy.");
      }
    }
  }

  const econ = ext.payoutAndMarketplaceEconomics;
  if (econ) {
    for (const [size, v] of [
      [1, econ.oneCleanerProductivityPermille],
      [2, econ.twoCleanerProductivityPermille],
      [3, econ.threeCleanerProductivityPermille],
    ] as const) {
      if (v !== undefined && !(Number.isFinite(v) && v >= 500 && v <= size * 1000)) {
        errors.push(`Team-of-${size} productivity (marketplace economics) must be between 0.5x and ${size}.0x.`);
      }
    }
  }

  if (ext.locationPricing && warnings.length >= 0) {
    // Informational: with location tiers active, legacy NEGATIVE per-zip
    // multipliers (e.g. the 94541 -5% production row) are superseded by the
    // engine (clamped to 0). Clean the zip table up at deploy.
  }
}

/** Validate any accepted upload shape: a flat PricingConfigV2, a flat
 *  formatVersion-2 config, or the SweeprExtendedPricingRuleset wrapper.
 *  Returns the flattened config alongside the validation result. */
export function validatePricingRuleset(raw: unknown): ValidationResult & {
  config: PricingConfigV2;
} {
  const { config } = unwrapPricingRuleset(raw);
  const result = validatePricingConfig(config);
  return { ...result, config };
}

export function validatePricingConfig(config: PricingConfigV2): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const B = VALIDATION_BOUNDS;

  // Labor matrix: non-negative integers, monotone nondecreasing across levels.
  for (const t of ROOM_TYPES_V2) {
    const row = config.laborMatrix[t];
    if (!row || row.length !== 4) {
      errors.push(`Labor matrix for ${t} must have exactly four levels.`);
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const v = row[k];
      if (!Number.isInteger(v) || v < 0) errors.push(`${t} level ${k + 1} minutes must be a whole number ≥ 0.`);
      if (v > B.maxRoomMinutes) errors.push(`${t} level ${k + 1} exceeds ${B.maxRoomMinutes} minutes.`);
      if (k > 0 && v < row[k - 1]) errors.push(`${t}: level ${k + 1} minutes are below level ${k} — levels must not decrease.`);
    }
    const clutterRow = config.clutter.minutesByType[t];
    if (!clutterRow || clutterRow.length !== 3 || clutterRow.some((v) => !Number.isInteger(v) || v < 0)) {
      errors.push(`Clutter minutes for ${t} must be three whole numbers ≥ 0.`);
    } else if (clutterRow[0] > clutterRow[1] || clutterRow[1] > clutterRow[2]) {
      errors.push(`Clutter minutes for ${t} must not decrease as obstruction increases.`);
    }
  }

  const r = config.rates;
  if (r.customerLaborRateCentsPerHour < B.minLaborRateCents || r.customerLaborRateCentsPerHour > B.maxLaborRateCents) {
    errors.push(`Customer labor rate must be between $${B.minLaborRateCents / 100} and $${B.maxLaborRateCents / 100} per labor-hour.`);
  }
  // minimumBookingCents is optional (absent = no minimum = 0) for backward
  // compatibility with configs stored before the field became first-class.
  const minimumBookingCents = r.minimumBookingCents ?? 0;
  for (const [label, v] of [
    ["Fixed service amount", r.fixedServiceCents],
    ["Minimum booking total", minimumBookingCents],
    ["Automatic quote limit", r.maxAutoQuoteCents],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${label} must be a whole number of cents ≥ 0.`);
  }
  if (minimumBookingCents > r.maxAutoQuoteCents) {
    errors.push("Minimum booking total cannot exceed the automatic quote limit.");
  }
  // Customer-elected extra-cleaner flat fee: must be present, a whole number of
  // cents ≥ 0, and within bounds. (Completeness: the config must carry it.)
  if (!Number.isInteger(r.extraCleanerFeeCentsPer100Sqft) || r.extraCleanerFeeCentsPer100Sqft < 0) {
    errors.push("Extra-cleaner fee per 100 sqft must be a whole number of cents ≥ 0.");
  } else if (r.extraCleanerFeeCentsPer100Sqft > B.maxExtraCleanerFeeCentsPer100Sqft) {
    errors.push(`Extra-cleaner fee per 100 sqft must not exceed $${B.maxExtraCleanerFeeCentsPer100Sqft / 100}.`);
  }
  if (r.taxRateBps < 0 || r.taxRateBps > B.maxTaxBps) errors.push(`Tax rate must be 0–${B.maxTaxBps / 100}%.`);
  if (r.emergencySurchargeBps < 0 || r.emergencySurchargeBps > B.maxEmergencyBps) {
    errors.push(`Short-notice surcharge must be 0–${B.maxEmergencyBps / 100}%.`);
  }
  if (r.roundTotalUpToEndingDigit !== null && (r.roundTotalUpToEndingDigit < 0 || r.roundTotalUpToEndingDigit > 9)) {
    errors.push("Rounding digit must be 0–9 (or off).");
  }

  if (config.payout.mode === "per_labor_hour" && config.payout.centsPerLaborHour <= 0) {
    errors.push("Cleaner payout per labor-hour must be positive.");
  }
  if (config.payout.mode === "percent_of_subtotal" && (config.payout.percentBps <= 0 || config.payout.percentBps > 10_000)) {
    errors.push("Cleaner payout percentage must be between 0% and 100%.");
  }

  const s = config.scheduling;
  if (s.reservePercentile < 50 || s.reservePercentile > 99) errors.push("Scheduling percentile must be 50–99.");
  if (s.bufferRatePermille < 0 || s.bufferRatePermille > B.maxBufferPermille) {
    errors.push(`Scheduling buffer must be 0–${B.maxBufferPermille / 10}%.`);
  }
  if (!Number.isInteger(s.roundUpToIncrementMinutes) || s.roundUpToIncrementMinutes < 1) {
    errors.push("Scheduling increment must be at least 1 minute.");
  }
  for (const [size, p] of Object.entries(s.teamProductivityPermille)) {
    if (p < 500 || p > Number(size) * 1000) {
      errors.push(`Team-of-${size} productivity must be between 0.5× and ${size}.0×.`);
    }
  }

  // Extras completeness (spec §5.8): every active extra fully specified.
  const seen = new Set<string>();
  for (const e of config.extras) {
    if (!e.active) continue;
    if (!e.key || !e.label || !e.unitLabel) errors.push(`Extra "${e.key || "?"}" is missing its label or unit.`);
    if (seen.has(e.key)) errors.push(`Duplicate extra key "${e.key}".`);
    seen.add(e.key);
    if (e.mode !== "fixed" && (!Number.isInteger(e.minutesPerUnit) || e.minutesPerUnit < 0)) {
      errors.push(`Extra "${e.key}" needs whole minutes per unit.`);
    }
    if (e.mode !== "minutes" && (!Number.isInteger(e.fixedCentsPerUnit) || e.fixedCentsPerUnit < 0)) {
      errors.push(`Extra "${e.key}" needs a whole-cents fixed amount.`);
    }
    if (e.mode === "minutes" && e.minutesPerUnit === 0) warnings.push(`Extra "${e.key}" adds zero minutes — it will be free.`);
    if (e.minQuantity < 0 || e.maxQuantity < e.minQuantity) errors.push(`Extra "${e.key}" has an invalid quantity range.`);
    for (const other of e.incompatibleWith ?? []) {
      if (!config.extras.some((x) => x.key === other)) {
        errors.push(`Extra "${e.key}" lists unknown incompatible extra "${other}".`);
      }
    }
  }

  // Inference parameters: ordered thresholds, sane sensitivities.
  const inf = config.inference;
  if (!inf.modelVersion) errors.push("Inference parameters must carry an immutable model version.");
  for (const t of ROOM_TYPES_V2) {
    const th = inf.thresholds[t];
    if (!th || th.length !== 3 || !(th[0] < th[1] && th[1] < th[2])) {
      errors.push(`Inference thresholds for ${t} must be three strictly increasing values.`);
    }
    const b = inf.betaHome[t];
    if (!(b >= 0 && b <= 5)) errors.push(`Whole-home influence for ${t} must be between 0 and 5.`);
  }
  if (inf.hGridPoints < 5 || inf.hGridPoints > 51) errors.push("H grid must use 5–51 points.");

  // Extended (formatVersion 2) multi-service ruleset guardrails.
  if (config.extendedRules) validateExtendedRules(config.extendedRules, errors, warnings);

  // Deterministic quote checks: the engine must run on every reference
  // scenario, produce positive totals, respect invariants, and never price a
  // protected scenario below the configured cleaner payout (negative margin).
  if (errors.length === 0) {
    for (const scenario of REFERENCE_SCENARIOS) {
      try {
        const q = computeQuoteV2(config, scenario.input, { pricingVersionId: "validation" });
        if (q.totalCents <= 0) errors.push(`Reference scenario "${scenario.label}" prices at ≤ $0.`);
        if (q.expectedLaborMinutes <= 0) errors.push(`Reference scenario "${scenario.label}" has no labor.`);
        if (q.scheduledLaborMinutes < q.expectedLaborMinutes) {
          errors.push(`Scenario "${scenario.label}": scheduled minutes below expected minutes.`);
        }
        if (q.cleanerPayoutCents >= q.subtotalCents) {
          errors.push(
            `Scenario "${scenario.label}": cleaner payout ($${(q.cleanerPayoutCents / 100).toFixed(2)}) meets or exceeds the pre-tax subtotal — negative margin.`,
          );
        }
        for (const ri of q.roomInference) {
          const sum = ri.expectedConditionCounts.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - ri.count) > 0.01) {
            errors.push(`Scenario "${scenario.label}": ${ri.roomType} inferred counts sum to ${sum}, expected ${ri.count}.`);
          }
        }
      } catch (err) {
        errors.push(
          `Reference scenario "${scenario.label}" failed to price: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // The matrix paths must also price when configured.
    const matrixScenarios: Array<{ label: string; input: QuoteInputV2 }> = [];
    if (config.extendedRules?.moveInOut) {
      matrixScenarios.push({
        label: "Move-in/out 3 bed / 2 bath, level 2",
        input: {
          serviceArea: "default",
          currency: "USD",
          counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
          conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
          sqft: 1800,
          extras: [],
          serviceType: "moveInOut",
          conditionLevel: 2,
        },
      });
    }
    if (config.extendedRules?.airbnbSTR) {
      matrixScenarios.push({
        label: "Turnover 2 bed / 2 bath, level 3, 5h window",
        input: {
          serviceArea: "default",
          currency: "USD",
          counts: { kitchen: 1, bathroom: 2, bedroom: 2, living_room: 1 },
          conditions: { kitchen: 3, bathroom: 3, bedroom: 3, living_room: 3 },
          sqft: 1200,
          extras: [],
          serviceType: "airbnb",
          conditionLevel: 3,
          turnoverWindowHours: 5,
        },
      });
    }
    for (const scenario of matrixScenarios) {
      try {
        const q = computeQuoteV2(config, scenario.input, { pricingVersionId: "validation" });
        if (q.totalCents <= 0) errors.push(`Scenario "${scenario.label}" prices at ≤ $0.`);
        if (q.requiredTeamSize < 1) errors.push(`Scenario "${scenario.label}" requires no team.`);
      } catch (err) {
        errors.push(
          `Scenario "${scenario.label}" failed to price: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Warn-level diff checks between a draft and its published source. */
export function diffWarnings(previous: PricingConfigV2, next: PricingConfigV2): string[] {
  const warnings: string[] = [];
  for (const t of ROOM_TYPES_V2) {
    for (let k = 0; k < 4; k++) {
      const a = previous.laborMatrix[t][k];
      const b = next.laborMatrix[t][k];
      if (a > 0 && Math.abs(b - a) / a > VALIDATION_BOUNDS.maxCellChangeWarnPct / 100) {
        warnings.push(
          `${t} level ${k + 1} changes by ${Math.round(((b - a) / a) * 100)}% (${a} → ${b} min).`,
        );
      }
    }
  }
  const ra = previous.rates.customerLaborRateCentsPerHour;
  const rb = next.rates.customerLaborRateCentsPerHour;
  if (ra > 0 && Math.abs(rb - ra) / ra > 0.15) {
    warnings.push(`Customer labor rate changes by ${Math.round(((rb - ra) / ra) * 100)}%.`);
  }
  return warnings;
}
