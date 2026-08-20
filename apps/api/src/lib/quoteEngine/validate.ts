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
import { ROOM_TYPES_V2, type PricingConfigV2, type QuoteInputV2 } from "./types";

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
  for (const [label, v] of [
    ["Fixed service amount", r.fixedServiceCents],
    ["Minimum booking total", r.minimumBookingCents],
    ["Automatic quote limit", r.maxAutoQuoteCents],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errors.push(`${label} must be a whole number of cents ≥ 0.`);
  }
  if (r.minimumBookingCents > r.maxAutoQuoteCents) {
    errors.push("Minimum booking total cannot exceed the automatic quote limit.");
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
