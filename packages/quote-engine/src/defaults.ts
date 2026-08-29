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
 * Cold-start Pricing v2 configuration, TRANSLATED from the live Engine A
 * numbers (packages/utils/src/roomPricing.ts DEFAULT_HOME_CLEANING_CONFIG +
 * the canonical ADD_ONS catalogue) at an assumed customer labor rate of
 * $60 per labor-hour — deliberately chosen so $1 of today's pricing maps to
 * exactly 1 labor minute, which makes the translation auditable by eye.
 *
 * TRANSLATION TABLE (old → new, at $60/labor-hour = $1/minute):
 *  - Condition adders (worst-room cents) → minute DELTAS between levels,
 *    preserved exactly: kitchen +15/+35/+60 min, bathroom +12/+30/+55,
 *    bedroom +8/+20/+38, living +10/+24/+45.
 *  - Level-1 base room minutes are NEW assumptions (old model had no
 *    per-room base; it hid base labor in the $89 base fee): kitchen 25,
 *    bathroom 20, bedroom 12, living 15.
 *  - Per-extra-bedroom $18 / per-extra-bathroom $28 → covered by the base
 *    room minutes above (18 ≈ 12 + transitions; 28 ≈ 20 + transitions).
 *  - Sqft tiers ($15→$150 above 900 sqft) → linear neutral-band adjustment:
 *    4 min per 100 sqft above 900, capped at 150 min ($150).
 *  - $89 base fee → $49 fixed service visit + 20 min setup/pack-down
 *    operational labor ($20) + per-room transitions (~$2/room).
 *  - 10% service fee → absorbed into the labor rate (the old fee applied to
 *    subtotal; here the rate is all-inclusive). 8.25% tax → 825 bps.
 *  - Ending-9 rounding → preserved.
 *  - Add-ons → minutes at $1/min from the canonical 13-key catalogue,
 *    INCLUDING the five keys the live engine silently priced at $0
 *    (garage_sweep, patio_sweep, walls_spot_cleaning, extra_bathroom_detail,
 *    organization_light).
 *
 * NOTHING here reaches customers until an authorized admin reviews the
 * draft, runs the shadow comparison, and publishes it. Every value below is
 * on the assumptions list in docs/PRICING_V2.md requiring business approval.
 */

import type { PricingConfigV2 } from "./types";

export const COLD_START_MODEL_VERSION = "coldstart-2026.08";

export function buildColdStartConfig(): PricingConfigV2 {
  return {
    laborMatrix: {
      kitchen: [25, 40, 60, 85],
      bathroom: [20, 32, 50, 75],
      bedroom: [12, 20, 32, 50],
      living_room: [15, 25, 39, 60],
    },
    clutter: {
      minutesByType: {
        kitchen: [0, 10, 25],
        bathroom: [0, 8, 20],
        bedroom: [0, 8, 20],
        living_room: [0, 10, 25],
      },
      unobservedFactorPermille: 500,
      obstructedRequiresReview: true,
    },
    size: {
      includedSqft: 900,
      incrementSqft: 100,
      minutesPerIncrement: 4,
      maxAdjustmentMinutes: 150,
    },
    operational: {
      setupMinutes: 10,
      packdownMinutes: 10,
      perExtraRoomTransitionMinutes: 2,
    },
    extras: [
      { key: "inside_fridge", label: "Inside Fridge", minutesPerUnit: 29, unitLabel: "fridge" },
      { key: "inside_oven", label: "Inside Oven", minutesPerUnit: 34, unitLabel: "oven" },
      { key: "interior_windows", label: "Interior Windows", minutesPerUnit: 39, unitLabel: "set" },
      { key: "inside_cabinets", label: "Inside Cabinets", minutesPerUnit: 49, unitLabel: "kitchen" },
      { key: "laundry", label: "Laundry", minutesPerUnit: 24, unitLabel: "load" },
      { key: "dishes", label: "Dishes", minutesPerUnit: 24, unitLabel: "sink" },
      { key: "garage_sweep", label: "Garage Sweep", minutesPerUnit: 29, unitLabel: "garage" },
      { key: "patio_sweep", label: "Patio Sweep", minutesPerUnit: 24, unitLabel: "patio" },
      { key: "baseboards", label: "Baseboards", minutesPerUnit: 39, unitLabel: "home" },
      { key: "walls_spot_cleaning", label: "Wall Spot Cleaning", minutesPerUnit: 34, unitLabel: "home" },
      { key: "pet_hair_detail", label: "Pet Hair Detail", minutesPerUnit: 39, unitLabel: "home" },
      { key: "extra_bathroom_detail", label: "Extra Bathroom Detail", minutesPerUnit: 24, unitLabel: "bathroom" },
      { key: "organization_light", label: "Light Organization", minutesPerUnit: 49, unitLabel: "room" },
    ].map((e) => ({
      ...e,
      mode: "minutes" as const,
      fixedCentsPerUnit: 0,
      minQuantity: 1,
      maxQuantity: e.key === "extra_bathroom_detail" || e.key === "organization_light" ? 5 : 1,
      payoutTreatment: "standard" as const,
      active: true,
    })),
    rates: {
      customerLaborRateCentsPerHour: 6000,
      fixedServiceCents: 4900,
      minimumBookingCents: 9900,
      maxAutoQuoteCents: 100_000,
      taxRateBps: 825,
      roundTotalUpToEndingDigit: 9,
      emergencySurchargeBps: 1500,
      // $1 per 100 sqft, charged only when the customer opts into one extra
      // cleaner for speed (integer cents per 100 sqft).
      extraCleanerFeeCentsPer100Sqft: 100,
    },
    payout: {
      mode: "per_labor_hour",
      centsPerLaborHour: 3900,
      percentBps: 6500,
    },
    scheduling: {
      reservePercentile: 75,
      bufferRatePermille: 0,
      roundUpToIncrementMinutes: 15,
      teamProductivityPermille: { "1": 1000, "2": 1800 },
      twoPersonThresholdMinutes: 240,
    },
    inference: {
      modelVersion: COLD_START_MODEL_VERSION,
      provenance: "cold_start",
      // At H = 0 these give roughly P(1/2/3/4) ≈ .50/.33/.12/.05 for most
      // types, with bathrooms shifted slightly dirtier — conservative,
      // monotone, and wide enough that the whole-home evidence (betaHome)
      // does the real work. Editable under Advanced model settings.
      thresholds: {
        kitchen: [0.0, 1.6, 3.0],
        bathroom: [-0.2, 1.3, 2.7],
        bedroom: [0.2, 1.8, 3.2],
        living_room: [0.1, 1.7, 3.1],
      },
      betaHome: {
        kitchen: 1.0,
        bathroom: 1.0,
        bedroom: 0.8,
        living_room: 0.9,
      },
      hGridPoints: 21,
      hGridSpan: 2.5,
    },
  };
}
