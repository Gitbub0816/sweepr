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
 * Pricing v2 — the ONE authoritative quote calculation (spec §5–§6), now a
 * multi-service-type engine (formatVersion 2). Pure and deterministic:
 * (config, input) → result. All currency math is integer; expected minutes
 * cross from probability space to integer minutes at exactly one rounding
 * boundary (`roundHalfUp` on the summed labor).
 *
 * Service-type routing:
 *  - "standard" (default): the labor-minutes residential path. A config
 *    WITHOUT extendedRules prices BYTE-IDENTICALLY to the pre-extension
 *    engine (proven by apps/api/tests/pricing-v2-shadow.test.ts and the
 *    legacy pins in pricing-v2-extended.test.ts).
 *  - "moveInOut": BR/BA base matrix + condition multipliers (L1–L4) +
 *    oversized-home guardrail; NO standard size scaling.
 *  - "airbnb": turnover matrix + per-bedroom sqft guardrail + dirtiness
 *    adjustments + staffing matrix + turnover-window rules + repeat/volume
 *    discounts (resolved by the service adapter) + scope suppression.
 * A matrix serviceType with a config that lacks the matching extendedRules
 * section falls back to the standard path.
 */

import {
  inferConditionCounts,
  type TypeObservation,
} from "./inference";
import {
  ROOM_TYPES_V2,
  type ClutterLevel,
  type ConditionLevel,
  type PetHairLevel,
  type PricingConfigV2,
  type QuoteComponentV2,
  type QuoteInputV2,
  type QuoteResultV2,
  type RoomInferenceResultV2,
  type RoomTypeV2,
  type ServiceTypeV2,
} from "./types";
import {
  applyBps,
  calculationFingerprint,
  canonicalJson,
  QuoteInputError,
  roundDiv,
  roundUpToEndingDigit,
} from "./shared";
import {
  airbnbSuppressedAddOnKeys,
  classifyDeepClean,
  computeAirbnbTeamSize,
  laundryMachineElapsedMinutes,
  levelPercent,
  MANUAL_REVIEW_REASONS,
  petHairPercent,
  PET_HAIR_LEVELS,
  resolveAirbnbBase,
  resolveBedroomTableEntry,
  resolveEffectiveExtras,
  resolveMoveInOutBase,
  resolveShortNotice,
  resolveTeamProductivityPermille,
  resolveZipPct,
  type EffectiveExtraDefV2,
} from "./extended";

// Re-exported from shared.ts for backward compatibility — every existing
// import site (`from "@sweepr/quote-engine"`) keeps working unchanged.
export { QuoteInputError, roundUpToEndingDigit, canonicalJson, calculationFingerprint };

/** Normalize input into the canonical shape that both the fingerprint and
 *  the persisted snapshot use. Throws QuoteInputError on invalid values.
 *  formatVersion-2 fields are included ONLY when provided, so a legacy input
 *  normalizes (and fingerprints) exactly as it always has. */
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
  const out: QuoteInputV2 = {
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

  // ---- formatVersion-2 inputs: validated, included only when provided ----
  if (raw.serviceType !== undefined) {
    if (!["standard", "moveInOut", "airbnb"].includes(raw.serviceType)) {
      throw new QuoteInputError("invalid_service_type", "Invalid service type");
    }
    out.serviceType = raw.serviceType;
  }
  if (raw.conditionLevel !== undefined) {
    if (![1, 2, 3, 4].includes(raw.conditionLevel)) {
      throw new QuoteInputError("invalid_condition", "Invalid overall condition level");
    }
    out.conditionLevel = raw.conditionLevel;
  }
  if (raw.hoursUntilService !== undefined) {
    if (!Number.isFinite(raw.hoursUntilService) || raw.hoursUntilService < 0) {
      throw new QuoteInputError("invalid_hours", "Invalid hours until service");
    }
    out.hoursUntilService = Math.min(Math.round(raw.hoursUntilService * 100) / 100, 8760);
  }
  if (raw.turnoverWindowHours !== undefined) {
    if (!Number.isFinite(raw.turnoverWindowHours) || raw.turnoverWindowHours < 0) {
      throw new QuoteInputError("invalid_turnover_window", "Invalid turnover window");
    }
    out.turnoverWindowHours = Math.min(Math.round(raw.turnoverWindowHours * 100) / 100, 168);
  }
  if (raw.severeMess !== undefined) out.severeMess = Boolean(raw.severeMess);
  if (raw.unsafeConditions !== undefined) {
    if (!Array.isArray(raw.unsafeConditions)) {
      throw new QuoteInputError("invalid_unsafe_conditions", "Invalid unsafe conditions");
    }
    out.unsafeConditions = raw.unsafeConditions.slice(0, 20).map((s) => String(s).slice(0, 100));
  }
  if (raw.petHair !== undefined) {
    if (!PET_HAIR_LEVELS.includes(raw.petHair as PetHairLevel)) {
      throw new QuoteInputError("invalid_pet_hair", "Invalid pet hair level");
    }
    out.petHair = raw.petHair;
  }
  if (raw.airbnbDiscount !== undefined) {
    const d = raw.airbnbDiscount;
    if (
      !d ||
      !["repeat_property", "host_volume"].includes(d.kind) ||
      !Number.isFinite(d.percent) ||
      d.percent < 0 ||
      d.percent > 50
    ) {
      throw new QuoteInputError("invalid_discount", "Invalid turnover discount");
    }
    out.airbnbDiscount = { kind: d.kind, percent: Math.round(d.percent * 100) / 100 };
  }
  return out;
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

const PET_HAIR_LABELS: Record<PetHairLevel, string> = {
  light: "light",
  moderate: "moderate",
  heavy: "heavy",
};

export interface ComputeQuoteOptions {
  pricingVersionId: string;
}

/** Human label for a BR/BA matrix key ("3BR_2BA" → "3 bed / 2 bath"). */
function comboKeyLabel(key: string): string {
  return key
    .replace("Studio_or_1BR", "studio or 1 bed")
    .replace(/(\d+)BR/, "$1 bed")
    .replace(/_(\d+)BA/, " / $1 bath");
}

// ---------------------------------------------------------------------------
// Shared money tail: zip area → short-notice → minimum → tax → charm rounding
// → auto-quote limit. Byte-identical to the historical standard-path order
// and labels for legacy configs.
// ---------------------------------------------------------------------------

interface MoneyTailOutcome {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  minimumApplied: boolean;
}

function applyMoneyTail(
  config: PricingConfigV2,
  input: QuoteInputV2,
  startingSubtotalCents: number,
  components: QuoteComponentV2[],
  warnings: string[],
  reviewReasons: string[],
  setReview: () => void,
): MoneyTailOutcome {
  let subtotalCents = startingSubtotalCents;

  // ZIP area adjustment. With location tiers configured, the percent is
  // clamped into [0, cap] — legacy negative per-zip discounts are superseded.
  const zipPct = resolveZipPct(config.extendedRules?.locationPricing, input.zipMultiplierPct ?? 0);
  const zipBps = Math.round(zipPct * 100);
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

  // Short notice: tiered when configured (never stacking — exactly one tier),
  // otherwise the legacy single emergency surcharge (<48h boolean).
  const shortNotice = config.extendedRules?.shortNotice
    ? resolveShortNotice(
        config.extendedRules.shortNotice,
        input.hoursUntilService,
        input.emergency === true,
      )
    : null;
  if (config.extendedRules?.shortNotice) {
    if (shortNotice) {
      const adj = applyBps(subtotalCents, shortNotice.surchargeBps);
      subtotalCents += adj;
      components.push({
        code: "adjustment.short_notice",
        label: shortNotice.label,
        quantity: 1,
        laborMinutes: 0,
        amountCents: adj,
        source: "adjustment",
      });
    }
  } else if (input.emergency && config.rates.emergencySurchargeBps > 0) {
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

  // Minimum job total ("hourly rate PLUS a minimum"). DELIBERATE CLAMP SPOT
  // (docs/PRICING_V2.md): it floors the ENTIRE pre-tax subtotal — labor,
  // fixed visit, extras, extra-cleaner fee — AFTER the zip-area and
  // short-notice adjustments, and BEFORE tax/charm rounding. Rationale:
  //  - after the adjustments, so a discounted zip area can never price a job
  //    below the floor;
  //  - inclusive of extras, i.e. standard minimum-order semantics — every
  //    dollar the customer spends on the visit counts toward the minimum;
  //  - pre-tax, so tax is computed on what is actually charged and the
  //    customer-facing total is always ≥ minimum + tax.
  // Optional field: absent (older stored configs) or 0 = no minimum.
  const minimumBookingCents = config.rates.minimumBookingCents ?? 0;
  let minimumApplied = false;
  if (subtotalCents < minimumBookingCents) {
    const floor = minimumBookingCents - subtotalCents;
    subtotalCents = minimumBookingCents;
    minimumApplied = true;
    components.push({
      code: "policy.minimum",
      label: "Minimum booking total",
      quantity: 1,
      laborMinutes: 0,
      amountCents: floor,
      source: "policy",
    });
  }

  const taxCents = applyBps(subtotalCents, config.rates.taxRateBps);
  let totalCents = subtotalCents + taxCents;
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
    setReview();
    reviewReasons.push(MANUAL_REVIEW_REASONS.PRICE);
    warnings.push(
      "This quote exceeds the automatic booking limit and needs a quick review by our team.",
    );
  }

  return { subtotalCents, taxCents, totalCents, minimumApplied };
}

/** Extended manual-review triggers shared by every path: square footage and
 *  reported unsafe/special conditions. Formal customer copy only. */
function applyExtendedReviewTriggers(
  config: PricingConfigV2,
  input: QuoteInputV2,
  warnings: string[],
  reviewReasons: string[],
  setReview: () => void,
): void {
  const ext = config.extendedRules;
  if (!ext) return;

  let sqftThreshold: number | null = null;
  for (const trigger of ext.manualReview?.triggerIfAny ?? []) {
    if (typeof trigger.sqftAtLeast === "number") sqftThreshold = trigger.sqftAtLeast;
  }
  if (sqftThreshold === null) {
    const alt = ext.standardResidential?.largeHomeScaling?.manualReviewAtOrAboveSqft;
    if (typeof alt === "number") sqftThreshold = alt;
  }
  if (sqftThreshold !== null && input.sqft !== undefined && input.sqft >= sqftThreshold) {
    setReview();
    reviewReasons.push(MANUAL_REVIEW_REASONS.SQFT);
    warnings.push(
      "Homes of this size are confirmed by our team before booking. We will review the details and finalize your quote quickly.",
    );
  }

  if (input.unsafeConditions && input.unsafeConditions.length > 0) {
    let recognized: string[] | null = null;
    for (const trigger of ext.manualReview?.triggerIfAny ?? []) {
      if (Array.isArray(trigger.unsafeOrSpecialConditions)) {
        recognized = trigger.unsafeOrSpecialConditions.map((s) => String(s));
      }
    }
    const matches = recognized
      ? input.unsafeConditions.filter((s) => recognized.includes(s))
      : input.unsafeConditions;
    if (matches.length > 0) {
      setReview();
      reviewReasons.push(MANUAL_REVIEW_REASONS.UNSAFE);
      warnings.push(
        "The conditions you described need a quick review by our team before we can confirm this booking. Some jobs may be declined for safety.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Extras pricing shared by every path
// ---------------------------------------------------------------------------

interface ExtrasOutcome {
  /** Minutes billed through the labor rate (mode minutes/both). */
  billedMinutes: number;
  /** Fixed cents billed directly (mode fixed/both). */
  fixedCents: number;
  /** ACTIVE cleaner minutes that schedule but are NOT billed via the rate
   *  (decoupled extras: laundry, light tidying, fixed-price oven/door). */
  activeMinutes: number;
  /** Laundry machine-cycle completion time (never blocks the cleaner). */
  machineElapsedMinutes: number;
  components: QuoteComponentV2[];
}

function priceExtras(
  config: PricingConfigV2,
  input: QuoteInputV2,
  opts: { suppressedKeys?: Set<string>; monetizeMinutesPerExtra: boolean },
): ExtrasOutcome {
  const defs = resolveEffectiveExtras(config);
  const components: QuoteComponentV2[] = [];
  const chosen: Array<{ def: EffectiveExtraDefV2; quantity: number }> = [];

  for (const e of input.extras) {
    if (opts.suppressedKeys?.has(e.key)) {
      const def = defs.find((d) => d.key === e.key);
      components.push({
        code: `included.${e.key}`,
        label: `${def?.label ?? e.key} (included in turnover)`,
        quantity: e.quantity,
        laborMinutes: 0,
        amountCents: 0,
        source: "policy",
      });
      continue;
    }
    const def = defs.find((d) => d.key === e.key && d.active);
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

  // Sliding glass door detail includes its track: suppress the duplicate
  // window-track charge for as many tracks as there are sliding doors booked.
  const overrides = config.extendedRules?.extrasAppSideOverrides;
  let suppressedTrackUnits = 0;
  if (overrides?.slidingGlassDoor?.suppressDuplicateTrackAddon) {
    const doors = chosen.find((c) => c.def.key === "sliding_glass_door_cleaning")?.quantity ?? 0;
    const trackEntry = chosen.find((c) => c.def.key === "window_track_cleaning");
    if (doors > 0 && trackEntry) {
      suppressedTrackUnits = Math.min(doors, trackEntry.quantity);
      trackEntry.quantity -= suppressedTrackUnits;
    }
  }

  let billedMinutes = 0;
  let fixedCents = 0;
  let activeMinutes = 0;
  let machineElapsedMinutes = 0;

  for (const { def, quantity } of chosen) {
    if (quantity <= 0) {
      if (def.key === "window_track_cleaning" && suppressedTrackUnits > 0) {
        components.push({
          code: "included.window_track_cleaning",
          label: `${def.label} (included with the sliding door detail)`,
          quantity: suppressedTrackUnits,
          laborMinutes: 0,
          amountCents: 0,
          source: "policy",
        });
      }
      continue;
    }
    const minutes = def.mode === "fixed" ? 0 : def.minutesPerUnit * quantity;
    const fixed = def.mode === "minutes" ? 0 : def.fixedCentsPerUnit * quantity;
    const active = (def.activeLaborMinutesPerUnit ?? 0) * quantity;
    billedMinutes += minutes;
    fixedCents += fixed;
    activeMinutes += active;
    if (def.key === "laundry" && overrides?.laundry) {
      machineElapsedMinutes = laundryMachineElapsedMinutes(overrides.laundry, quantity);
    }
    const minutesCents = opts.monetizeMinutesPerExtra
      ? roundDiv(minutes * config.rates.customerLaborRateCentsPerHour, 60)
      : 0;
    const suppressedNote =
      def.key === "window_track_cleaning" && suppressedTrackUnits > 0
        ? ` (${suppressedTrackUnits} included with the sliding door detail)`
        : "";
    components.push({
      code: `extra.${def.key}`,
      label: `${def.label}${quantity > 1 ? ` ×${quantity}` : ""}${suppressedNote}`,
      quantity,
      laborMinutes: minutes + active,
      amountCents: fixed + minutesCents,
      source: minutes > 0 && fixed > 0 ? "labor" : fixed > 0 ? "fixed" : "labor",
    });
  }

  return { billedMinutes, fixedCents, activeMinutes, machineElapsedMinutes, components };
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

export function computeQuoteV2(
  config: PricingConfigV2,
  rawInput: QuoteInputV2,
  opts: ComputeQuoteOptions,
): QuoteResultV2 {
  const input = normalizeQuoteInput(rawInput);
  const requested = input.serviceType ?? "standard";
  if (requested === "moveInOut" && config.extendedRules?.moveInOut) {
    return computeMatrixQuote(config, input, opts, "moveInOut");
  }
  if (requested === "airbnb" && config.extendedRules?.airbnbSTR) {
    return computeMatrixQuote(config, input, opts, "airbnb");
  }
  return computeStandardQuote(config, input, opts);
}

// ---------------------------------------------------------------------------
// Standard residential path (the original labor-minutes model)
// ---------------------------------------------------------------------------

function computeStandardQuote(
  config: PricingConfigV2,
  input: QuoteInputV2,
  opts: ComputeQuoteOptions,
): QuoteResultV2 {
  const warnings: string[] = [];
  const reviewReasons: string[] = [];
  let manualReviewRequired = false;
  const setReview = () => {
    manualReviewRequired = true;
  };
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
      reviewReasons.push(MANUAL_REVIEW_REASONS.OBSTRUCTED);
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
  // Effective definitions apply the app-side overrides (decoupled laundry /
  // light tidying, fixed-price oven and sliding door, patio exclusivity,
  // linens/laundry overlap prevention). A legacy config resolves to its
  // catalog unchanged.
  const extras = priceExtras(config, input, { monetizeMinutesPerExtra: false });
  components.push(...extras.components);

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

  // ---- 5b. Deep-clean auto-classification (extended configs only) --------
  // Base cleaning workload = condition + clutter + size + operational labor.
  // Purchased add-ons are excluded from the multiplier and never trigger it.
  // Effect: +N% base-workload labor allowance — NO separate customer-facing
  // surcharge line (the allowance is labor, monetized inside the one labor
  // subtotal) — and deepCleanApplied on the result so the app labels the
  // booking "Deep Clean".
  const baseWorkloadMinutes =
    Math.round(conditionMinutesFloat) + clutterMinutes + sizeMinutes + operationalMinutes;
  let deepCleanApplied = false;
  let deepCleanMinutes = 0;
  const deepRules = config.extendedRules?.deepClean;
  if (deepRules) {
    const cls = classifyDeepClean(deepRules, input);
    if (cls.applied) {
      deepCleanApplied = true;
      const pct = deepRules.baseWorkloadMultiplierPercent ?? 10;
      deepCleanMinutes = roundDiv(baseWorkloadMinutes * pct, 100);
      if (deepCleanMinutes > 0) {
        components.push({
          code: "deep_clean.allowance",
          label: `Deep clean workload allowance (+${pct}%)`,
          quantity: 1,
          laborMinutes: deepCleanMinutes,
          amountCents: 0,
          source: "labor",
        });
      }
    }
  }

  // ---- 5c. Pet hair percentage tiers (extended configs only) -------------
  let petHairMinutes = 0;
  if (input.petHair) {
    const pct = petHairPercent(config.extendedRules?.extrasAppSideOverrides, input.petHair);
    if (pct === null) {
      warnings.push("Pet hair service is not configured for this pricing version.");
    } else if (pct > 0) {
      petHairMinutes = roundDiv(baseWorkloadMinutes * pct, 100);
      components.push({
        code: "extra.pet_hair",
        label: `Pet hair detail (${PET_HAIR_LABELS[input.petHair]}, +${pct}%)`,
        quantity: 1,
        laborMinutes: petHairMinutes,
        amountCents: 0,
        source: "labor",
      });
    }
  }

  // ---- 6. Expected labor → THE integer-minutes boundary ------------------
  const expectedLaborMinutes = Math.round(
    conditionMinutesFloat +
      clutterMinutes +
      sizeMinutes +
      extras.billedMinutes +
      operationalMinutes +
      deepCleanMinutes +
      petHairMinutes,
  );

  // ---- 7. Scheduling reserve (capacity, never billed) ---------------------
  // The posterior over H yields a distribution of condition minutes; take the
  // configured upper percentile, add the deterministic components, then the
  // optional cold-start buffer, then round up to the scheduling increment.
  // ACTIVE (unbilled) minutes from decoupled extras schedule too — the
  // cleaner is genuinely busy — while machine cycle time never does.
  const deterministicMinutes =
    clutterMinutes +
    sizeMinutes +
    extras.billedMinutes +
    operationalMinutes +
    deepCleanMinutes +
    petHairMinutes +
    extras.activeMinutes;
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
    expectedLaborMinutes + extras.activeMinutes,
    Math.round(percentileMinutes + deterministicMinutes),
  );
  const buffered = roundDiv(reservedRaw * (1000 + config.scheduling.bufferRatePermille), 1000);
  const inc = Math.max(1, config.scheduling.roundUpToIncrementMinutes);
  const scheduledLaborMinutes = Math.ceil(buffered / inc) * inc;

  // ---- 8. Team + elapsed --------------------------------------------------
  const requiredTeamSize =
    scheduledLaborMinutes > config.scheduling.twoPersonThresholdMinutes ? 2 : 1;
  const productivityMap = resolveTeamProductivityPermille(config);
  const productivity = productivityMap[String(requiredTeamSize)] ?? 1000;
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

  const startingSubtotal =
    laborSubtotalCents + config.rates.fixedServiceCents + extras.fixedCents + extraCleanerCents;

  applyExtendedReviewTriggers(config, input, warnings, reviewReasons, setReview);
  const tail = applyMoneyTail(
    config,
    input,
    startingSubtotal,
    components,
    warnings,
    reviewReasons,
    setReview,
  );

  // ---- 10. Modeled cleaner-payout ESTIMATE (independent of the customer
  // price). This figure is used for margin validation and planning only —
  // actual cleaner compensation is 70% of captured proceeds (the 30%
  // Marketplace Services Fee is Sweepr's share; apps/api/src/lib/
  // payoutEngine.ts) plus 100% of tips, and never reads this number.
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
    recommendedTeamSize: requiredTeamSize,
    roomInference,
    components,
    subtotalCents: tail.subtotalCents,
    discountCents: 0, // promotions/coupons apply through the booking ledger
    taxCents: tail.taxCents,
    totalCents: tail.totalCents,
    cleanerPayoutCents,
    minimumApplied: tail.minimumApplied,
    warnings,
    manualReviewRequired,
    calculationFingerprint: fingerprint,
    serviceType: "standard",
    deepCleanApplied,
    requiredTeamSize,
    manualReviewReasons: reviewReasons,
    laborScheduling: {
      activeLaborMinutes: expectedLaborMinutes + extras.activeMinutes,
      machineElapsedMinutes: extras.machineElapsedMinutes,
      onSiteMinutes: Math.max(estimatedElapsedMinutes, extras.machineElapsedMinutes),
    },
  };
}

// ---------------------------------------------------------------------------
// Matrix paths: Move-In/Out and Airbnb/STR turnovers
// ---------------------------------------------------------------------------

function computeMatrixQuote(
  config: PricingConfigV2,
  input: QuoteInputV2,
  opts: ComputeQuoteOptions,
  serviceType: Exclude<ServiceTypeV2, "standard">,
): QuoteResultV2 {
  const warnings: string[] = [];
  const reviewReasons: string[] = [];
  let manualReviewRequired = false;
  const setReview = () => {
    manualReviewRequired = true;
  };
  const components: QuoteComponentV2[] = [];

  const bedrooms = input.counts.bedroom;
  const bathrooms = Math.max(1, input.counts.bathroom);
  const level: ConditionLevel =
    input.conditionLevel ??
    (Math.max(...ROOM_TYPES_V2.map((t) => input.conditions[t])) as ConditionLevel);

  let baseCents = 0;
  let conditionCents = 0;
  let guardrailCents = 0;

  if (serviceType === "moveInOut") {
    const rules = config.extendedRules!.moveInOut!;
    const base = resolveMoveInOutBase(rules, bedrooms, bathrooms);
    baseCents = base.baseCents;
    components.push({
      code: "service.base",
      label: `Move-in / move-out clean (${comboKeyLabel(base.key)})`,
      quantity: 1,
      laborMinutes: 0,
      amountCents: baseCents,
      source: "fixed",
    });
    if (!base.exact) {
      warnings.push("Priced from the closest home size in our move-in/out rate table.");
    }

    const pct = levelPercent(rules.conditionMultipliersPercent, level);
    if (pct > 0) {
      conditionCents = roundDiv(baseCents * pct, 100);
      components.push({
        code: "service.condition",
        label: `Condition adjustment (level ${level}, +${pct}%)`,
        quantity: 1,
        laborMinutes: 0,
        amountCents: conditionCents,
        source: "adjustment",
      });
    }

    // Oversized-home guardrail: NO standard size scaling. Charged only when
    // the home is unusually large for its room count (included sqft from the
    // guardrail's own table, else the Airbnb per-bedroom table as the shared
    // "typical size for this room count" reference).
    const guardrail = rules.oversizedHomeGuardrail;
    if (guardrail && input.sqft) {
      const table =
        guardrail.includedSqftByBedroomCount ??
        config.extendedRules?.airbnbSTR?.sizeGuardrail?.includedSqftByBedroomCount;
      const included = table ? resolveBedroomTableEntry(table, bedrooms) : null;
      if (included !== null && input.sqft > included) {
        const per = guardrail.priceCentsPerAdditional250Sqft ?? 1500;
        const units = Math.ceil((input.sqft - included) / 250);
        guardrailCents = units * per;
        components.push({
          code: "service.size_guardrail",
          label: `Oversized home (${input.sqft} sq ft, ${included} included)`,
          quantity: units,
          laborMinutes: 0,
          amountCents: guardrailCents,
          source: "adjustment",
        });
      }
    }
  } else {
    const rules = config.extendedRules!.airbnbSTR!;
    const base = resolveAirbnbBase(rules, bedrooms, bathrooms);
    baseCents = base.baseCents;
    components.push({
      code: "service.base",
      label: `Short-term rental turnover (${comboKeyLabel(base.key)})`,
      quantity: 1,
      laborMinutes: 0,
      amountCents: baseCents,
      source: "fixed",
    });
    if (!base.exact) {
      warnings.push("Priced from the closest property size in our turnover rate table.");
    }

    // Per-bedroom included-sqft guardrail.
    const guardrail = rules.sizeGuardrail;
    if (guardrail?.includedSqftByBedroomCount && input.sqft) {
      const included = resolveBedroomTableEntry(guardrail.includedSqftByBedroomCount, bedrooms);
      if (included !== null && input.sqft > included) {
        const inc = guardrail.incrementSqft ?? 250;
        const per = guardrail.priceCentsPerAdditional250Sqft ?? 1200;
        const units = Math.ceil((input.sqft - included) / inc);
        guardrailCents = units * per;
        components.push({
          code: "service.size_guardrail",
          label: `Large property (${input.sqft} sq ft, ${included} included)`,
          quantity: units,
          laborMinutes: 0,
          amountCents: guardrailCents,
          source: "adjustment",
        });
      }
    }

    // Dirtiness adjustment on base + guardrail (L1/L2 0, L3 +20, L4 +35).
    const pct = levelPercent(rules.dirtinessAdjustmentPercent, level);
    if (pct > 0) {
      conditionCents = roundDiv((baseCents + guardrailCents) * pct, 100);
      components.push({
        code: "service.dirtiness",
        label: `Dirtiness adjustment (level ${level}, +${pct}%)`,
        quantity: 1,
        laborMinutes: 0,
        amountCents: conditionCents,
        source: "adjustment",
      });
    }

    if (input.severeMess) {
      setReview();
      reviewReasons.push(MANUAL_REVIEW_REASONS.SEVERE_MESS);
      warnings.push(
        "This level of mess needs a quick review by our team. We will confirm the scope and price before the booking is finalized, and some jobs may be declined.",
      );
    }
  }

  // Airbnb repeat/volume discount (resolved by the service adapter from real
  // booking history; highest only, never stacking). Applies ONLY to the base
  // service + size guardrail — never to the mess adjustment, rush, laundry,
  // or specialty add-ons — and reduces the service price BEFORE the 70/30
  // split (a structural discount, not a Sweepr-funded coupon).
  let discountApplied: QuoteResultV2["appliedDiscount"];
  if (serviceType === "airbnb" && input.airbnbDiscount && input.airbnbDiscount.percent > 0) {
    const amount = roundDiv((baseCents + guardrailCents) * input.airbnbDiscount.percent, 100);
    if (amount > 0) {
      discountApplied = {
        kind: input.airbnbDiscount.kind,
        percent: input.airbnbDiscount.percent,
        amountCents: amount,
      };
      components.push({
        code:
          input.airbnbDiscount.kind === "repeat_property"
            ? "discount.airbnb_repeat"
            : "discount.airbnb_volume",
        label:
          input.airbnbDiscount.kind === "repeat_property"
            ? `Repeat turnover discount (${input.airbnbDiscount.percent}%)`
            : `Host volume discount (${input.airbnbDiscount.percent}%)`,
        quantity: 1,
        laborMinutes: 0,
        amountCents: -amount,
        source: "adjustment",
      });
    }
  }

  // Extras — with the Airbnb turnover-scope suppression (bed making,
  // dishwasher load, and the basic patio sweep are included in the turnover
  // base; garage sweep, interior windows, window tracks, and the sliding
  // door detail remain paid).
  const suppressedKeys =
    serviceType === "airbnb"
      ? airbnbSuppressedAddOnKeys(config.extendedRules?.airbnbSTR)
      : undefined;
  const extras = priceExtras(config, input, { suppressedKeys, monetizeMinutesPerExtra: true });
  components.push(...extras.components);
  const extrasCents = extras.components.reduce((s, comp) => s + comp.amountCents, 0);

  // Pet hair percentage tiers, applied to the core service price.
  let petHairCents = 0;
  if (input.petHair) {
    const pct = petHairPercent(config.extendedRules?.extrasAppSideOverrides, input.petHair);
    if (pct === null) {
      warnings.push("Pet hair service is not configured for this pricing version.");
    } else if (pct > 0) {
      petHairCents = roundDiv((baseCents + conditionCents + guardrailCents) * pct, 100);
      components.push({
        code: "extra.pet_hair",
        label: `Pet hair detail (${PET_HAIR_LABELS[input.petHair]}, +${pct}%)`,
        quantity: 1,
        laborMinutes: 0,
        amountCents: petHairCents,
        source: "fixed",
      });
    }
  }

  // Scheduling estimate: the matrix paths have no per-room labor model, so
  // the labor-minutes figure is DERIVED from the core service price at the
  // config's customer labor rate (a capacity-planning estimate, never a
  // billing input — the customer pays the matrix price, not these minutes).
  const coreServiceCents = baseCents + conditionCents + guardrailCents;
  const derivedServiceMinutes = roundDiv(
    coreServiceCents * 60,
    Math.max(1, config.rates.customerLaborRateCentsPerHour),
  );
  const expectedLaborMinutes = derivedServiceMinutes + extras.billedMinutes;
  const bufferable = expectedLaborMinutes + extras.activeMinutes;
  const buffered = roundDiv(bufferable * (1000 + config.scheduling.bufferRatePermille), 1000);
  const inc = Math.max(1, config.scheduling.roundUpToIncrementMinutes);
  const scheduledLaborMinutes = Math.ceil(buffered / inc) * inc;

  // Team sizing.
  let requiredTeamSize: number;
  if (serviceType === "airbnb") {
    const sizing = computeAirbnbTeamSize(config, {
      bedrooms,
      bathrooms,
      level,
      turnoverWindowHours: input.turnoverWindowHours,
      scheduledLaborMinutes,
    });
    requiredTeamSize = sizing.teamSize;
    warnings.push(...sizing.notes);
    if (sizing.manualReview) {
      setReview();
      reviewReasons.push(MANUAL_REVIEW_REASONS.TURNOVER_WINDOW);
    }
  } else {
    requiredTeamSize =
      scheduledLaborMinutes > config.scheduling.twoPersonThresholdMinutes ? 2 : 1;
  }
  const productivityMap = resolveTeamProductivityPermille(config);
  const productivity =
    productivityMap[String(requiredTeamSize)] ?? 1000 * Math.max(1, requiredTeamSize);
  const estimatedElapsedMinutes = Math.ceil((scheduledLaborMinutes * 1000) / productivity);

  // Money tail (zip → short-notice → minimum → tax → rounding → limit).
  const startingSubtotal =
    coreServiceCents +
    extrasCents +
    petHairCents -
    (discountApplied?.amountCents ?? 0) +
    (config.rates.fixedServiceCents > 0 ? config.rates.fixedServiceCents : 0);
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

  applyExtendedReviewTriggers(config, input, warnings, reviewReasons, setReview);
  const tail = applyMoneyTail(
    config,
    input,
    startingSubtotal,
    components,
    warnings,
    reviewReasons,
    setReview,
  );

  // Modeled payout estimate: for matrix paths the percent mode reads the
  // pre-tax subtotal (the discounted service price — the 70/30 split base).
  const cleanerPayoutCents =
    config.payout.mode === "per_labor_hour"
      ? roundDiv(expectedLaborMinutes * config.payout.centsPerLaborHour, 60)
      : applyBps(tail.subtotalCents, config.payout.percentBps);

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
    recommendedTeamSize: requiredTeamSize,
    roomInference: [],
    components,
    subtotalCents: tail.subtotalCents,
    discountCents: 0, // ledger-level promotions stay outside the engine
    taxCents: tail.taxCents,
    totalCents: tail.totalCents,
    cleanerPayoutCents,
    minimumApplied: tail.minimumApplied,
    warnings,
    manualReviewRequired,
    calculationFingerprint: fingerprint,
    serviceType,
    deepCleanApplied: false,
    requiredTeamSize,
    manualReviewReasons: reviewReasons,
    laborScheduling: {
      activeLaborMinutes: expectedLaborMinutes + extras.activeMinutes,
      machineElapsedMinutes: extras.machineElapsedMinutes,
      onSiteMinutes: Math.max(estimatedElapsedMinutes, extras.machineElapsedMinutes),
    },
    ...(discountApplied ? { appliedDiscount: discountApplied } : {}),
  };
}
