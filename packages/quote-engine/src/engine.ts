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
 * Pricing v2 — the ONE authoritative quote calculation (spec §5–§6).
 * Pure and deterministic: (config, input) → result. All currency math is
 * integer; expected minutes cross from probability space to integer minutes
 * at exactly one rounding boundary (`roundHalfUp` on the summed labor).
 */

import {
  inferConditionCounts,
  type TypeObservation,
} from "./inference";
import {
  ROOM_TYPES_V2,
  type ClutterLevel,
  type ConditionLevel,
  type PricingConfigV2,
  type QuoteComponentV2,
  type QuoteInputV2,
  type QuoteResultV2,
  type RoomInferenceResultV2,
  type RoomTypeV2,
} from "./types";

/** Raised for input the service layer should surface as a 400. */
export class QuoteInputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Integer round-half-up division — no binary-float division in charge math. */
function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** Basis-point application: cents × bps, integer round-half-up. */
function applyBps(cents: number, bps: number): number {
  return roundDiv(cents * bps, 10_000);
}

/** Round a cents total UP so the dollars part ends in `digit` and cents are
 *  .00-free charm pricing (mirrors the live engine's ending-9 policy). */
export function roundUpToEndingDigit(cents: number, digit: number): number {
  const dollars = Math.ceil(cents / 100);
  const last = dollars % 10;
  const add = last <= digit ? digit - last : 10 - last + digit;
  return (dollars + add) * 100;
}

/** FNV-1a 64-bit over the canonical (sorted-keys) JSON — the deterministic
 *  calculation fingerprint stamped on every quote. */
export function calculationFingerprint(value: unknown): string {
  const canonical = canonicalJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= BigInt(canonical.charCodeAt(i) & 0xff);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${body.join(",")}}`;
}

/** Normalize input into the canonical shape that both the fingerprint and
 *  the persisted snapshot use. Throws QuoteInputError on invalid values. */
export function normalizeQuoteInput(raw: QuoteInputV2): QuoteInputV2 {
  const counts: Record<RoomTypeV2, number> = {} as Record<RoomTypeV2, number>;
  const conditions: Record<RoomTypeV2, ConditionLevel> = {} as Record<RoomTypeV2, ConditionLevel>;
  for (const t of ROOM_TYPES_V2) {
    const c = raw.counts[t];
    if (!Number.isInteger(c) || c < 0 || c > 30) {
      throw new QuoteInputError("invalid_room_count", `Invalid ${t} count`);
    }
    counts[t] = c;
    const lvl = raw.conditions[t];
    if (![1, 2, 3, 4].includes(lvl)) {
      throw new QuoteInputError("invalid_condition", `Invalid ${t} condition`);
    }
    conditions[t] = lvl;
  }
  const clutter: Partial<Record<RoomTypeV2, ClutterLevel>> = {};
  for (const t of ROOM_TYPES_V2) {
    const v = raw.clutter?.[t] ?? 0;
    if (![0, 1, 2].includes(v)) throw new QuoteInputError("invalid_clutter", `Invalid ${t} clutter`);
    if (v !== 0) clutter[t] = v as ClutterLevel;
  }
  const sqft =
    raw.sqft === undefined
      ? undefined
      : Number.isFinite(raw.sqft) && raw.sqft >= 0 && raw.sqft <= 50_000
        ? Math.round(raw.sqft)
        : (() => {
            throw new QuoteInputError("invalid_sqft", "Invalid square footage");
          })();
  const extras = [...raw.extras]
    .map((e) => ({ key: String(e.key), quantity: Math.round(e.quantity) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    serviceArea: raw.serviceArea || "default",
    currency: raw.currency || "USD",
    counts,
    conditions,
    countsByLevel: raw.countsByLevel,
    clutter,
    sqft,
    extras,
    emergency: Boolean(raw.emergency),
    zipMultiplierPct: raw.zipMultiplierPct ?? 0,
    extraCleanerRequested: Boolean(raw.extraCleanerRequested),
  };
}

const LEVEL_LABELS: Record<ConditionLevel, string> = {
  1: "lightly used",
  2: "everyday mess",
  3: "needs attention",
  4: "heavy condition",
};
const TYPE_LABELS: Record<RoomTypeV2, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living_room: "Living/common area",
};

export interface ComputeQuoteOptions {
  pricingVersionId: string;
}

export function computeQuoteV2(
  config: PricingConfigV2,
  rawInput: QuoteInputV2,
  opts: ComputeQuoteOptions,
): QuoteResultV2 {
  const input = normalizeQuoteInput(rawInput);
  const warnings: string[] = [];
  let manualReviewRequired = false;
  const components: QuoteComponentV2[] = [];

  // ---- 1. Condition inference --------------------------------------------
  const observations: TypeObservation[] = ROOM_TYPES_V2.filter(
    (t) => input.counts[t] >= 1,
  ).map((t) => ({
    type: t,
    count: input.counts[t],
    reportedMax: input.conditions[t],
    directCounts: input.countsByLevel?.[t],
  }));
  if (observations.length === 0) {
    throw new QuoteInputError("no_rooms", "At least one room is required");
  }
  const inference = inferConditionCounts(config.inference, observations);

  const roomInference: RoomInferenceResultV2[] = [];
  let conditionMinutesFloat = 0;
  for (const t of inference.perType) {
    const matrix = config.laborMatrix[t.type];
    let minutes = 0;
    for (let k = 0; k < 4; k++) minutes += t.expectedConditionCounts[k] * matrix[k];
    conditionMinutesFloat += minutes;
    const roomMinutes = Math.round(minutes);
    roomInference.push({
      roomType: t.type,
      count: t.count,
      reportedMaximumLevel: t.reportedMax,
      guaranteedAtMaximum: Math.min(t.count, Math.max(1, Math.floor(t.expectedConditionCounts[t.reportedMax - 1]))),
      expectedConditionCounts: t.expectedConditionCounts.map((c) => Math.round(c * 1000) / 1000) as [
        number,
        number,
        number,
        number,
      ],
      expectedLaborMinutes: roomMinutes,
      method: t.method,
      confidence:
        t.method === "inferred" ? (t.count > 3 ? "low" : "medium") : "high",
    });
    components.push({
      code: `room.${t.type}.level_${t.reportedMax}`,
      label: `${TYPE_LABELS[t.type]} ×${t.count} (worst: ${LEVEL_LABELS[t.reportedMax]})`,
      quantity: t.count,
      laborMinutes: roomMinutes,
      amountCents: 0, // labor is monetized once, below
      source: "labor",
    });
  }

  // ---- 2. Clutter/access -------------------------------------------------
  let clutterMinutes = 0;
  for (const t of ROOM_TYPES_V2) {
    const state = input.clutter?.[t];
    if (!state || input.counts[t] < 1) continue;
    const perRoom = config.clutter.minutesByType[t][state];
    if (perRoom <= 0) continue;
    const n = input.counts[t];
    // Reported state is the worst room; the other rooms are charged the
    // configured fraction of it.
    const minutes = Math.round(
      perRoom + ((n - 1) * perRoom * config.clutter.unobservedFactorPermille) / 1000,
    );
    clutterMinutes += minutes;
    components.push({
      code: `clutter.${t}.state_${state}`,
      label: `${TYPE_LABELS[t]} — ${state === 2 ? "substantially obstructed" : "items to work around"}`,
      quantity: n,
      laborMinutes: minutes,
      amountCents: 0,
      source: "labor",
    });
    if (state === 2 && config.clutter.obstructedRequiresReview) {
      manualReviewRequired = true;
      warnings.push(`${TYPE_LABELS[t]} is substantially obstructed — pre-service review required.`);
    }
  }

  // ---- 3. Size adjustment (neutral band, outside the room inventory) -----
  let sizeMinutes = 0;
  if (input.sqft && input.sqft > config.size.includedSqft && config.size.incrementSqft > 0) {
    const excess = input.sqft - config.size.includedSqft;
    const increments = Math.ceil(excess / config.size.incrementSqft);
    sizeMinutes = Math.min(
      increments * config.size.minutesPerIncrement,
      config.size.maxAdjustmentMinutes,
    );
    if (sizeMinutes > 0) {
      components.push({
        code: "size.adjustment",
        label: `Home size adjustment (${input.sqft} sq ft, ${config.size.includedSqft} included)`,
        quantity: increments,
        laborMinutes: sizeMinutes,
        amountCents: 0,
        source: "labor",
      });
    }
  }

  // ---- 4. Extras ---------------------------------------------------------
  let extrasMinutes = 0;
  let extrasFixedCents = 0;
  const chosen: Array<{ def: (typeof config.extras)[number]; quantity: number }> = [];
  for (const e of input.extras) {
    const def = config.extras.find((d) => d.key === e.key && d.active);
    if (!def) throw new QuoteInputError("unknown_extra", `Unknown extra: ${e.key}`);
    if (e.quantity < def.minQuantity || e.quantity > def.maxQuantity) {
      throw new QuoteInputError("invalid_extra_quantity", `Invalid quantity for ${e.key}`);
    }
    chosen.push({ def, quantity: e.quantity });
  }
  for (const { def } of chosen) {
    for (const other of chosen) {
      if (other.def.key === def.key) continue;
      if (def.overlapGroup && def.overlapGroup === other.def.overlapGroup) {
        throw new QuoteInputError(
          "extras_overlap",
          `${def.label} and ${other.def.label} cover the same work — choose one`,
        );
      }
      if (def.incompatibleWith?.includes(other.def.key)) {
        throw new QuoteInputError(
          "extras_incompatible",
          `${def.label} can't be combined with ${other.def.label}`,
        );
      }
    }
  }
  for (const { def, quantity } of chosen) {
    const minutes = def.mode === "fixed" ? 0 : def.minutesPerUnit * quantity;
    const fixed = def.mode === "minutes" ? 0 : def.fixedCentsPerUnit * quantity;
    extrasMinutes += minutes;
    extrasFixedCents += fixed;
    components.push({
      code: `extra.${def.key}`,
      label: `${def.label}${quantity > 1 ? ` ×${quantity}` : ""}`,
      quantity,
      laborMinutes: minutes,
      amountCents: fixed,
      source: minutes > 0 && fixed > 0 ? "labor" : fixed > 0 ? "fixed" : "labor",
    });
  }

  // ---- 5. Operational minutes -------------------------------------------
  const totalRooms = ROOM_TYPES_V2.reduce((s, t) => s + input.counts[t], 0);
  const operationalMinutes =
    config.operational.setupMinutes +
    config.operational.packdownMinutes +
    Math.max(0, totalRooms - 1) * config.operational.perExtraRoomTransitionMinutes;
  components.push({
    code: "operational.setup_packdown",
    label: "Setup, pack-down and in-home transitions",
    quantity: 1,
    laborMinutes: operationalMinutes,
    amountCents: 0,
    source: "labor",
  });

  // ---- 6. Expected labor → THE integer-minutes boundary ------------------
  const expectedLaborMinutes = Math.round(
    conditionMinutesFloat + clutterMinutes + sizeMinutes + extrasMinutes + operationalMinutes,
  );

  // ---- 7. Scheduling reserve (capacity, never billed) ---------------------
  // The posterior over H yields a distribution of condition minutes; take the
  // configured upper percentile, add the deterministic components, then the
  // optional cold-start buffer, then round up to the scheduling increment.
  const deterministicMinutes = clutterMinutes + sizeMinutes + extrasMinutes + operationalMinutes;
  const nodes = inference.posterior
    .map((node) => {
      let minutes = 0;
      for (const t of inference.perType) {
        const counts =
          t.method === "inferred" ? (node.countsByType[t.type] ?? t.expectedConditionCounts) : t.expectedConditionCounts;
        const matrix = config.laborMatrix[t.type];
        for (let k = 0; k < 4; k++) minutes += counts[k] * matrix[k];
      }
      return { minutes, weight: node.weight };
    })
    .sort((a, b) => a.minutes - b.minutes);
  const target = Math.min(99, Math.max(50, config.scheduling.reservePercentile)) / 100;
  let cumulative = 0;
  let percentileMinutes = nodes.length > 0 ? nodes[nodes.length - 1].minutes : conditionMinutesFloat;
  for (const node of nodes) {
    cumulative += node.weight;
    if (cumulative >= target) {
      percentileMinutes = node.minutes;
      break;
    }
  }
  const reservedRaw = Math.max(
    expectedLaborMinutes,
    Math.round(percentileMinutes + deterministicMinutes),
  );
  const buffered = roundDiv(reservedRaw * (1000 + config.scheduling.bufferRatePermille), 1000);
  const inc = Math.max(1, config.scheduling.roundUpToIncrementMinutes);
  const scheduledLaborMinutes = Math.ceil(buffered / inc) * inc;

  // ---- 8. Team + elapsed --------------------------------------------------
  const recommendedTeamSize =
    scheduledLaborMinutes > config.scheduling.twoPersonThresholdMinutes ? 2 : 1;
  const productivity =
    config.scheduling.teamProductivityPermille[String(recommendedTeamSize)] ?? 1000;
  const estimatedElapsedMinutes = Math.ceil((scheduledLaborMinutes * 1000) / productivity);

  // ---- 9. Money (all integer) ---------------------------------------------
  const laborSubtotalCents = roundDiv(
    expectedLaborMinutes * config.rates.customerLaborRateCentsPerHour,
    60,
  );
  components.push({
    code: "labor.subtotal",
    label: `Cleaning labor (${expectedLaborMinutes} min at $${(config.rates.customerLaborRateCentsPerHour / 100).toFixed(2)}/labor-hour)`,
    quantity: expectedLaborMinutes,
    laborMinutes: 0,
    amountCents: laborSubtotalCents,
    source: "labor",
  });
  if (config.rates.fixedServiceCents > 0) {
    components.push({
      code: "service.fixed",
      label: "Service visit",
      quantity: 1,
      laborMinutes: 0,
      amountCents: config.rates.fixedServiceCents,
      source: "fixed",
    });
  }

  // Customer-elected extra cleaner (flat, crew-count-independent). The customer
  // may opt to add ONE extra cleaner for speed and pay a flat fee of
  // rates.extraCleanerFeeCentsPer100Sqft per 100 sqft. This is a customer
  // choice, NOT a multiplier on the whole price by crew size, and it never
  // touches labor minutes, scheduled capacity, or cleaner payout. Integer-cents
  // discipline: round-half-up of sqft × fee ÷ 100, no binary float.
  let extraCleanerCents = 0;
  if (
    input.extraCleanerRequested &&
    input.sqft &&
    config.rates.extraCleanerFeeCentsPer100Sqft > 0
  ) {
    extraCleanerCents = roundDiv(input.sqft * config.rates.extraCleanerFeeCentsPer100Sqft, 100);
    if (extraCleanerCents > 0) {
      components.push({
        code: "extra_cleaner",
        label: "Extra cleaner (finish faster)",
        quantity: 1,
        laborMinutes: 0,
        amountCents: extraCleanerCents,
        source: "fixed",
      });
    }
  }

  let subtotalCents =
    laborSubtotalCents + config.rates.fixedServiceCents + extrasFixedCents + extraCleanerCents;

  const zipBps = Math.round((input.zipMultiplierPct ?? 0) * 100);
  if (zipBps !== 0) {
    const adj = applyBps(subtotalCents, zipBps);
    subtotalCents += adj;
    components.push({
      code: "adjustment.zip",
      label: `Area adjustment (${(zipBps / 100).toFixed(2)}%)`,
      quantity: 1,
      laborMinutes: 0,
      amountCents: adj,
      source: "adjustment",
    });
  }
  if (input.emergency && config.rates.emergencySurchargeBps > 0) {
    const adj = applyBps(subtotalCents, config.rates.emergencySurchargeBps);
    subtotalCents += adj;
    components.push({
      code: "adjustment.emergency",
      label: `Short-notice booking (${(config.rates.emergencySurchargeBps / 100).toFixed(0)}%)`,
      quantity: 1,
      laborMinutes: 0,
      amountCents: adj,
      source: "adjustment",
    });
  }
  if (subtotalCents < config.rates.minimumBookingCents) {
    const floor = config.rates.minimumBookingCents - subtotalCents;
    subtotalCents = config.rates.minimumBookingCents;
    components.push({
      code: "policy.minimum",
      label: "Minimum booking total",
      quantity: 1,
      laborMinutes: 0,
      amountCents: floor,
      source: "policy",
    });
  }

  const discountCents = 0; // promotions/coupons apply through the booking ledger
  const taxableCents = subtotalCents - discountCents;
  const taxCents = applyBps(taxableCents, config.rates.taxRateBps);
  let totalCents = taxableCents + taxCents;
  if (config.rates.roundTotalUpToEndingDigit !== null) {
    const rounded = roundUpToEndingDigit(totalCents, config.rates.roundTotalUpToEndingDigit);
    if (rounded !== totalCents) {
      components.push({
        code: "policy.rounding",
        label: "Rounding",
        quantity: 1,
        laborMinutes: 0,
        amountCents: rounded - totalCents,
        source: "policy",
      });
      totalCents = rounded;
    }
  }

  if (totalCents > config.rates.maxAutoQuoteCents) {
    manualReviewRequired = true;
    warnings.push(
      "This quote exceeds the automatic booking limit and needs a quick review by our team.",
    );
  }

  // ---- 10. Cleaner payout (independent of the customer price) -------------
  const cleanerPayoutCents =
    config.payout.mode === "per_labor_hour"
      ? roundDiv(expectedLaborMinutes * config.payout.centsPerLaborHour, 60)
      : applyBps(laborSubtotalCents, config.payout.percentBps);

  const fingerprint = calculationFingerprint({
    v: 2,
    pricingVersionId: opts.pricingVersionId,
    modelVersion: config.inference.modelVersion,
    input,
  });

  return {
    pricingVersionId: opts.pricingVersionId,
    modelVersion: config.inference.modelVersion,
    currency: input.currency,
    expectedLaborMinutes,
    scheduledLaborMinutes,
    estimatedElapsedMinutes,
    recommendedTeamSize,
    roomInference,
    components,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    cleanerPayoutCents,
    warnings,
    manualReviewRequired,
    calculationFingerprint: fingerprint,
  };
}
