/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { CrewConfig } from "./crewConfig";
import type { CrewSizePlan, CrewSizeReasonCode } from "./types";

/**
 * CrewSizingService — decide how many cleaners a booking needs, from the amount
 * of PREDICTED LABOR (person-minutes), NOT square footage. Deterministic and
 * explainable (returns reason codes); no ML.
 *
 * Person labor (how much cleaning work) is distinct from elapsed duration (how
 * long the crew is on-site). Multiple cleaners do NOT scale linearly — the team
 * efficiency curve comes from the active pricing version's
 * scheduling.teamProductivityPermille, so sizing and pricing stay consistent
 * and versioned together.
 */

/** Default effective-worker curve (permille) when a pricing version omits it. */
const DEFAULT_TEAM_PRODUCTIVITY_PERMILLE: Record<string, number> = {
  "1": 1000,
  "2": 1850,
  "3": 2550,
  "4": 3150,
};

/** Effective concurrent-worker capacity for a crew of `size` (e.g. 2 → ~1.85). */
export function effectiveCapacity(
  size: number,
  productivityPermille: Record<string, number> | undefined,
): number {
  const table = productivityPermille ?? DEFAULT_TEAM_PRODUCTIVITY_PERMILLE;
  const permille = table[String(size)];
  if (typeof permille === "number" && permille > 0) return permille / 1000;
  // Extrapolate for sizes beyond the table: assume each added cleaner past the
  // largest known point contributes the marginal gain of the last known step.
  const known = Object.keys(table)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
  if (known.length === 0) return size; // no data → linear
  const maxKnown = known[known.length - 1];
  if (size <= maxKnown) return (table[String(size)] ?? maxKnown * 1000) / 1000;
  const capMax = table[String(maxKnown)] / 1000;
  const marginal =
    known.length >= 2
      ? capMax - table[String(known[known.length - 2])] / 1000
      : 1;
  return capMax + marginal * (size - maxKnown);
}

/** Elapsed on-site minutes for `personMinutes` of labor done by a crew of `size`. */
export function elapsedMinutes(
  personMinutes: number,
  size: number,
  productivityPermille: Record<string, number> | undefined,
): number {
  const cap = effectiveCapacity(size, productivityPermille);
  return Math.ceil(personMinutes / Math.max(cap, 0.0001));
}

export interface CrewSizingInput {
  /** Predicted labor from the v2 quote (expectedLaborMinutes). NULL if v2 was
   *  not active for this booking — sizing then defers to solo. */
  personMinutes: number | null;
  /** teamProductivityPermille from the active pricing version's config. */
  productivityPermille?: Record<string, number>;
  /** The customer explicitly bought one extra cleaner (speed upsell). */
  extraCleanerRequested?: boolean;
  config: CrewConfig;
}

/** Labor-threshold floor: the crew size implied purely by person-minute volume. */
function thresholdFloor(personMinutes: number, cfg: CrewConfig): number {
  // Thresholds keyed by size = the MAX person-minutes for which that size still
  // suffices by labor volume. { "1":540, "2":900, "3":1320 } → ≤540 ⇒ 1,
  // ≤900 ⇒ 2, ≤1320 ⇒ 3, above the top band ⇒ largest key + 1 (dynamic).
  const entries = Object.entries(cfg.crewSizeThresholdsPersonMinutes)
    .map(([size, max]) => ({ size: Number(size), max: Number(max) }))
    .filter((e) => Number.isInteger(e.size) && Number.isFinite(e.max))
    .sort((a, b) => a.size - b.size);
  if (entries.length === 0) return 1;
  for (const e of entries) {
    if (personMinutes <= e.max) return e.size;
  }
  return entries[entries.length - 1].size + 1;
}

/**
 * Compute the crew plan for a booking. Optimizes rather than blindly
 * thresholding: it respects the labor-volume floor, the max-solo-shift ceiling,
 * the target elapsed window, and the minimum-useful-work-per-cleaner cap.
 */
export function computeCrewPlan(input: CrewSizingInput): CrewSizePlan {
  const { config: cfg } = input;
  const reasonCodes: CrewSizeReasonCode[] = [];

  // No labor estimate (v2 was dark for this booking): stay solo, low confidence.
  if (input.personMinutes == null || input.personMinutes <= 0) {
    reasonCodes.push("NO_LABOR_ESTIMATE");
    return {
      estimatedPersonMinutes: input.personMinutes ?? null,
      recommendedCrewSize: 1,
      minCrewSize: 1,
      maxUsefulCrewSize: 1,
      estimatedElapsedMinutes: null,
      elapsedBySize: {},
      reasonCodes,
      confidence: 0.2,
    };
  }

  const pm = input.personMinutes;

  // Cap by minimum-useful-work-per-cleaner: never add a cleaner who would have
  // less than the configured meaningful workload.
  const byUseful = Math.max(1, Math.floor(pm / Math.max(1, cfg.minUsefulMinutesPerCleaner)));
  const maxUsefulCrewSize = Math.max(1, Math.min(cfg.maxCrewSize, byUseful));

  // Elapsed time for every candidate size (for admin comparison + selection).
  const elapsedBySize: Record<number, number> = {};
  for (let s = 1; s <= maxUsefulCrewSize; s++) {
    elapsedBySize[s] = elapsedMinutes(pm, s, input.productivityPermille);
  }

  // Floor 1: labor volume (the spec's person-minute bands are the primary driver).
  const floorFromLabor = Math.min(maxUsefulCrewSize, thresholdFloor(pm, cfg));
  if (floorFromLabor >= 2) reasonCodes.push("HIGH_TOTAL_LABOR");

  // Floor 2: a SOLO shift longer than the hard max pushes to ≥2 (a 6h+ solo job
  // is exactly what we avoid). No tolerance on the solo ceiling.
  let floorFromDuration = 1;
  if (elapsedBySize[1] > cfg.maxSoloElapsedMinutes && maxUsefulCrewSize >= 2) {
    floorFromDuration = 2;
    reasonCodes.push("LONG_SOLO_DURATION");
  }

  const minCrewSize = Math.max(1, floorFromDuration);

  // Start from the higher of the two floors.
  let recommended = Math.max(floorFromLabor, floorFromDuration);

  // Force UP only when the appointment would be intolerably long — the target is
  // soft, with tolerance, so a 2-person clean slightly over target is preferred
  // to adding a third cleaner (spec §9: ~378 min for 2 is acceptable).
  const tolerance = Math.round(cfg.targetMaxElapsedMinutes * 0.3);
  const tolerated = cfg.targetMaxElapsedMinutes + tolerance;
  while (recommended < maxUsefulCrewSize && elapsedBySize[recommended] > tolerated) {
    recommended += 1;
    if (!reasonCodes.includes("CUSTOMER_COMPLETION_WINDOW")) {
      reasonCodes.push("CUSTOMER_COMPLETION_WINDOW");
    }
  }

  recommended = Math.max(minCrewSize, Math.min(recommended, maxUsefulCrewSize));

  if (recommended === 1) reasonCodes.push("LOW_TOTAL_LABOR");
  if (byUseful < cfg.maxCrewSize && maxUsefulCrewSize < floorFromLabor) {
    reasonCodes.push("MIN_USEFUL_WORK_LIMIT");
  }

  // Customer-elected extra cleaner: one more seat than the recommendation, still
  // capped by max crew size (never below what capacity requires).
  if (input.extraCleanerRequested) {
    const bumped = Math.min(cfg.maxCrewSize, recommended + 1);
    if (bumped > recommended) {
      recommended = bumped;
      reasonCodes.push("CUSTOMER_EXTRA_CLEANER");
      if (elapsedBySize[recommended] == null) {
        elapsedBySize[recommended] = elapsedMinutes(pm, recommended, input.productivityPermille);
      }
    }
  }

  recommended = Math.max(minCrewSize, Math.min(recommended, Math.max(maxUsefulCrewSize, recommended)));

  // Confidence: high with a real labor estimate, reduced near a threshold band
  // boundary (where a small labor change would flip the size).
  let confidence = 0.85;
  const bandEdges = Object.values(cfg.crewSizeThresholdsPersonMinutes).map(Number);
  if (bandEdges.some((edge) => Math.abs(pm - edge) <= 30)) confidence = 0.6;

  return {
    estimatedPersonMinutes: pm,
    recommendedCrewSize: recommended,
    minCrewSize,
    maxUsefulCrewSize: Math.max(maxUsefulCrewSize, recommended),
    estimatedElapsedMinutes: elapsedBySize[recommended] ?? elapsedMinutes(pm, recommended, input.productivityPermille),
    elapsedBySize,
    reasonCodes: Array.from(new Set(reasonCodes)),
    confidence,
  };
}
