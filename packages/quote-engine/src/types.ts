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
 * Pricing v2 — types for the ONE authoritative quote service.
 *
 * Measurement rules (docs/PRICING_V2.md):
 *  - Money: integer minor units (cents). Rates that need sub-cent or
 *    sub-unit precision are integers in smaller units (basis points,
 *    permille) so no charge calculation ever runs through binary floats.
 *  - Durations: integer minutes at every stored boundary. The inference
 *    model's expected counts are probabilities (floats by nature); they are
 *    converted to minutes ONCE, at a defined rounding boundary, before any
 *    currency math.
 *  - Condition levels are ORDERED CATEGORIES (1..4), never an equally
 *    spaced score. Labor comes from the per-room-type minutes matrix.
 */

export type RoomTypeV2 = "kitchen" | "bathroom" | "bedroom" | "living_room";
export const ROOM_TYPES_V2: RoomTypeV2[] = ["kitchen", "bathroom", "bedroom", "living_room"];

export type ConditionLevel = 1 | 2 | 3 | 4;
/** Clutter/access: 0 clear · 1 some items · 2 substantially obstructed. */
export type ClutterLevel = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Configuration (snapshotted whole into pricing_versions.config)
// ---------------------------------------------------------------------------

export interface ExtraDefV2 {
  key: string;
  label: string;
  /** minutes → billed via labor rate; fixed → flat cents; both → both. */
  mode: "minutes" | "fixed" | "both";
  minutesPerUnit: number;
  fixedCentsPerUnit: number;
  unitLabel: string;
  minQuantity: number;
  maxQuantity: number;
  /** Room types this extra applies to (informational + future validation). */
  eligibleRooms?: RoomTypeV2[];
  /** Extras sharing an overlap group cannot be combined. */
  overlapGroup?: string;
  /** Keys that cannot be booked together with this extra. */
  incompatibleWith?: string[];
  /** How the cleaner is compensated for this extra. */
  payoutTreatment: "standard" | "cleaner_full";
  active: boolean;
}

export interface InferenceParamsV2 {
  /** Immutable identifier for this parameter set (stamped on every quote). */
  modelVersion: string;
  provenance: "cold_start" | "learned" | "blended";
  /**
   * Ordered cumulative-logit thresholds per room type:
   * P(L <= k | H) = sigmoid(thresholds[t][k-1] - betaHome[t] * H), k = 1..3.
   * Must be strictly increasing within a type.
   */
  thresholds: Record<RoomTypeV2, [number, number, number]>;
  /**
   * Whole-home sensitivity per room type (>= 0). Larger values couple the
   * room type more tightly to the home's overall reported tendency — this
   * is the plain-language "how much the rest of the home influences the
   * estimate" knob.
   */
  betaHome: Record<RoomTypeV2, number>;
  /** Latent-H integration grid: `points` nodes spanning ±`span` std devs. */
  hGridPoints: number;
  hGridSpan: number;
}

export interface PricingConfigV2 {
  /** Expected labor minutes for ONE room of a type at each condition level.
   *  Admins edit these totals directly; there are no hidden coefficients. */
  laborMatrix: Record<RoomTypeV2, [number, number, number, number]>;
  clutter: {
    /** Additional minutes for one room at [clear, some, obstructed]. */
    minutesByType: Record<RoomTypeV2, [number, number, number]>;
    /**
     * Unobserved same-type rooms are charged this fraction (permille) of the
     * reported clutter minutes — the reported state is the WORST room, so
     * the remainder are assumed lighter. 1000 = charge every room fully.
     */
    unobservedFactorPermille: number;
    /** "Substantially obstructed" flags the quote for pre-service review. */
    obstructedRequiresReview: boolean;
  };
  size: {
    /** Square footage inside this allowance adds no time (neutral band). */
    includedSqft: number;
    incrementSqft: number;
    minutesPerIncrement: number;
    maxAdjustmentMinutes: number;
  };
  operational: {
    setupMinutes: number;
    packdownMinutes: number;
    /** Per counted room beyond the first (in-home transitions). */
    perExtraRoomTransitionMinutes: number;
  };
  extras: ExtraDefV2[];
  rates: {
    /**
     * Integer cents charged to the CUSTOMER per estimated labor-hour. This is
     * a PRICING MODEL INPUT — a device that converts estimated labor minutes
     * into a customer price. It is NOT a wage and NOT what cleaners receive:
     * cleaners are paid from captured booking proceeds minus the platform fee
     * (default 20% — apps/api/src/lib/payoutEngine.ts), regardless of this
     * number.
     */
    customerLaborRateCentsPerHour: number;
    /** Flat per-booking amount (trip/supplies), shown as its own line. */
    fixedServiceCents: number;
    /**
     * Minimum job total, integer cents. Supports "hourly rate PLUS a
     * minimum" pricing (e.g. $25/labor-hour but at least $40 per job).
     *
     * WHERE IT CLAMPS (deliberate, see docs/PRICING_V2.md): it floors the
     * ENTIRE pre-tax subtotal — labor + fixed service visit + extras +
     * extra-cleaner fee, after the zip-area and short-notice adjustments —
     * BEFORE tax and charm rounding. Standard minimum-order semantics: the
     * customer must spend at least this much per visit and every line item
     * counts toward it, so the customer-facing total can never fall below
     * minimum + tax. When it bites, the top-up appears as the
     * `policy.minimum` breakdown component and the result sets
     * `minimumApplied: true`.
     *
     * Optional for backward compatibility with stored configs; absent or 0
     * means no minimum.
     */
    minimumBookingCents?: number;
    /** Quotes above this require manual review instead of auto-booking. */
    maxAutoQuoteCents: number;
    taxRateBps: number;
    /** Charm rounding: round the final total UP to end in this digit (dollars
     *  ending digit of the cents total's dollar part — e.g. 9). null = off. */
    roundTotalUpToEndingDigit: number | null;
    /** Disclosed short-notice surcharge (<48h), basis points of subtotal. */
    emergencySurchargeBps: number;
    /**
     * Flat fee, in INTEGER CENTS per 100 sqft, charged ONLY when the customer
     * explicitly opts to add one extra cleaner for speed (QuoteInputV2
     * .extraCleanerRequested). The base price stays crew-count-independent;
     * this is a customer-elected line item, never a multiplier on the whole
     * price. Default 100 cents ($1) per 100 sqft.
     */
    extraCleanerFeeCentsPer100Sqft: number;
  };
  payout: {
    mode: "per_labor_hour" | "percent_of_subtotal";
    centsPerLaborHour: number;
    percentBps: number;
  };
  scheduling: {
    /** Upper posterior percentile used for capacity (NOT billed), 50–99. */
    reservePercentile: number;
    /** Extra cold-start buffer on scheduled minutes, permille (0 = off). */
    bufferRatePermille: number;
    roundUpToIncrementMinutes: number;
    /** Effective productivity by team size, permille of one cleaner
     *  (e.g. {"1": 1000, "2": 1800} — two people ≠ exactly 2×). */
    teamProductivityPermille: Record<string, number>;
    /** Scheduled labor above this recommends a two-person team. */
    twoPersonThresholdMinutes: number;
  };
  inference: InferenceParamsV2;
}

// ---------------------------------------------------------------------------
// Quote input / output
// ---------------------------------------------------------------------------

export interface QuoteInputV2 {
  serviceArea: string;
  currency: string;
  /** Rooms of each type actually being cleaned. Kitchen/living default 1. */
  counts: Record<RoomTypeV2, number>;
  /** One reported MAXIMUM condition per room type. */
  conditions: Record<RoomTypeV2, ConditionLevel>;
  /**
   * Optional direct counts by level ("my rooms vary a lot"): exact number of
   * rooms at [level1, level2, level3, level4]. When present and valid for a
   * type, these observations supersede inference for that type.
   */
  countsByLevel?: Partial<Record<RoomTypeV2, [number, number, number, number]>>;
  /** One reported clutter/access state per room type (worst room). */
  clutter?: Partial<Record<RoomTypeV2, ClutterLevel>>;
  sqft?: number;
  extras: Array<{ key: string; quantity: number }>;
  /** Server-derived (<48h) — never a client flag. */
  emergency?: boolean;
  /** ZIP area adjustment percent (validated server-side from the table). */
  zipMultiplierPct?: number;
  /**
   * Customer explicitly opted to add ONE extra cleaner for speed. When true,
   * a flat fee (rates.extraCleanerFeeCentsPer100Sqft × sqft/100) is added to
   * the subtotal before tax. The base price is otherwise crew-independent.
   */
  extraCleanerRequested?: boolean;
}

export interface QuoteComponentV2 {
  code: string;
  label: string;
  quantity: number;
  laborMinutes: number;
  amountCents: number;
  source: "labor" | "fixed" | "adjustment" | "policy";
}

export interface RoomInferenceResultV2 {
  roomType: RoomTypeV2;
  count: number;
  reportedMaximumLevel: ConditionLevel;
  guaranteedAtMaximum: number;
  /** Posterior expected number of rooms at each level; sums to count. */
  expectedConditionCounts: [number, number, number, number];
  expectedLaborMinutes: number;
  method: "single_room" | "consensus" | "direct_counts" | "inferred";
  confidence: "high" | "medium" | "low";
}

export interface QuoteResultV2 {
  pricingVersionId: string;
  modelVersion: string;
  currency: string;
  expectedLaborMinutes: number;
  scheduledLaborMinutes: number;
  estimatedElapsedMinutes: number;
  recommendedTeamSize: number;
  roomInference: RoomInferenceResultV2[];
  components: QuoteComponentV2[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  /**
   * The config's payout model applied to this quote — an INTERNAL PLANNING
   * ESTIMATE used for margin checks and capacity economics. It is NOT what
   * pays cleaners: actual cleaner compensation is captured booking proceeds
   * minus the platform fee (default 20%, apps/api/src/lib/payoutEngine.ts),
   * plus 100% of tips.
   */
  cleanerPayoutCents: number;
  /**
   * True when rates.minimumBookingCents topped up the pre-tax subtotal (the
   * `policy.minimum` component carries the amount). Older stored snapshots
   * predate this field — treat a missing value as false.
   */
  minimumApplied: boolean;
  warnings: string[];
  manualReviewRequired: boolean;
  calculationFingerprint: string;
}
