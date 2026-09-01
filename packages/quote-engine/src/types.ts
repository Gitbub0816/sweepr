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

/**
 * The three pricing paths of the multi-service engine (formatVersion 2):
 *  - standard: the labor-minutes residential model (the original v2 path).
 *  - moveInOut: BR/BA base-price matrix + condition multipliers + oversized
 *    guardrail. No standard size scaling.
 *  - airbnb: short-term-rental turnover matrix + per-bedroom sqft guardrail +
 *    dirtiness adjustments + staffing matrix + turnover-window rules.
 */
export type ServiceTypeV2 = "standard" | "moveInOut" | "airbnb";
/** Customer-selected pet-hair intensity (percentage-of-base-workload tiers). */
export type PetHairLevel = "light" | "moderate" | "heavy";

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

// ---------------------------------------------------------------------------
// Extended ruleset (formatVersion 2 — the SweeprExtendedPricingRuleset shape)
//
// A formatVersion-2 config is a legacy PricingConfigV2 PLUS an optional
// `extendedRules` block carrying the multi-service-type rules (Move-In/Out,
// Airbnb/STR, deep-clean classification, short-notice tiers, location tiers,
// extras overrides, manual-review triggers, marketplace economics). Every
// section is optional, every section tolerates unknown keys (preserved
// verbatim through storage and round-trips), and a config WITHOUT
// extendedRules prices byte-identically to the pre-extension engine.
// ---------------------------------------------------------------------------

/** One short-notice surcharge band, in the master ruleset's own vocabulary. */
export interface ShortNoticeTierV2 {
  hoursBeforeServiceMaxExclusive?: number;
  hoursBeforeServiceMinInclusive?: number;
  hoursBeforeServiceMaxInclusive?: number;
  hoursBeforeServiceMinExclusive?: number;
  surchargePercent: number;
  [key: string]: unknown;
}

export interface DeepCleanRulesV2 {
  classification?: {
    triggerIfAny?: Array<Record<string, unknown>>;
    addOnsDoNotTriggerDeepClean?: boolean;
    [key: string]: unknown;
  };
  /** Percent added to the BASE cleaning workload (never purchased add-ons). */
  baseWorkloadMultiplierPercent?: number;
  [key: string]: unknown;
}

export interface MoveInOutRulesV2 {
  /** Keys like "3BR_2BA" (also accepts "Studio_or_1BR_1BA"), integer cents. */
  basePriceMatrixCents: Record<string, number>;
  /** Percent added to the matrix base at each condition level. */
  conditionMultipliersPercent?: { L1?: number; L2?: number; L3?: number; L4?: number };
  useStandardResidentialSizeScaling?: boolean;
  oversizedHomeGuardrail?: {
    priceCentsPerAdditional250Sqft?: number;
    /** Optional per-bedroom included sqft; falls back to the Airbnb size
     *  guardrail table (a "typical size for this room count" reference). */
    includedSqftByBedroomCount?: Record<string, number>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AirbnbRulesV2 {
  /** Keys like "Studio_or_1BR_1BA", "2BR_2BA" — integer cents. */
  basePriceMatrixCents: Record<string, number>;
  sizeGuardrail?: {
    includedSqftByBedroomCount?: Record<string, number>;
    priceCentsPerAdditional250Sqft?: number;
    incrementSqft?: number;
    [key: string]: unknown;
  };
  dirtinessAdjustmentPercent?: { L1?: number; L2?: number; L3?: number; L4?: number };
  repeatVolumeDiscounts?: {
    firstCompletedTurnoverAtPropertyPercent?: number;
    secondAndLaterSamePropertyPercent?: number;
    hostRolling30DayCompletedTurnoversThreshold?: number;
    hostRolling30DayDiscountPercent?: number;
    highestOnlyNoStacking?: boolean;
    [key: string]: unknown;
  };
  turnoverWindow?: Record<string, unknown>;
  /** BR/BA key → required cleaners at condition L1..L4. */
  staffingMatrix?: Record<string, { L1?: number; L2?: number; L3?: number; L4?: number }>;
  scopeAndSuppressionRules?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExtrasOverridesV2 {
  insideOven?: { customerPriceCents?: number; activeLaborMinutes?: number; [key: string]: unknown };
  laundry?: {
    customerPriceCentsPerLoad?: number;
    maxLoads?: number;
    /** Modeling knobs for the machine-elapsed estimate (see the engine docs);
     *  defaults: 35 wash + 60 dry per load, pipelined on one washer/dryer. */
    machineWashMinutesPerLoad?: number;
    machineDryMinutesPerLoad?: number;
    [key: string]: unknown;
  };
  lightTidying?: {
    customerPriceCentsPer30MinuteBlock?: number;
    minutesPerBlock?: number;
    [key: string]: unknown;
  };
  petHair?: {
    useFlat39DollarPlaceholder?: boolean;
    /** [light, moderate, heavy] percent of the base cleaning workload. */
    percentageTiers?: number[];
    [key: string]: unknown;
  };
  patio?: { basicAndCobwebDetailMutuallyExclusive?: boolean; [key: string]: unknown };
  slidingGlassDoor?: {
    detailPriceCents?: number;
    includesTrack?: boolean;
    suppressDuplicateTrackAddon?: boolean;
    [key: string]: unknown;
  };
  bedLinensAndLaundry?: { preventDoubleChargeForOverlappingWork?: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ExtendedRulesV2 {
  quoteConstruction?: Record<string, unknown>;
  standardResidential?: {
    minimumBookingCents?: number;
    largeHomeScaling?: { manualReviewAtOrAboveSqft?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  deepClean?: DeepCleanRulesV2;
  moveInOut?: MoveInOutRulesV2;
  airbnbSTR?: AirbnbRulesV2;
  shortNotice?: { tiers?: ShortNoticeTierV2[]; neverStack?: boolean; [key: string]: unknown };
  locationPricing?: {
    model?: string;
    tiersPercent?: Record<string, number>;
    initialCapPercent?: number;
    [key: string]: unknown;
  };
  manualReview?: {
    triggerIfAny?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  payoutAndMarketplaceEconomics?: {
    threeCleanerProductivityPermille?: number;
    twoCleanerProductivityPermille?: number;
    oneCleanerProductivityPermille?: number;
    [key: string]: unknown;
  };
  extrasAppSideOverrides?: ExtrasOverridesV2;
  /** Any further sections (accessDelayAndLockout, cleanerOfferUI, programs,
   *  implementation notes…) are preserved verbatim and round-trip untouched. */
  [key: string]: unknown;
}

export interface PricingConfigV2 {
  /** 2 marks a config carrying the extended multi-service ruleset; absent or
   *  1 = a legacy standard-only config (prices byte-identically to before). */
  formatVersion?: 1 | 2;
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
     * cleaners (the cleaner/team pool) are paid 70% of captured booking
     * proceeds — the 30% Marketplace Services Fee is Sweepr's share
     * (apps/api/src/lib/payoutEngine.ts) — regardless of this number. Tips are
     * 100% to the cleaner, outside the split.
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
  /** Extended multi-service ruleset (formatVersion 2). Optional; absent =
   *  legacy standard-only behavior. See ExtendedRulesV2. */
  extendedRules?: ExtendedRulesV2;
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
   * Standard path only — matrix paths size crews from the staffing rules.
   */
  extraCleanerRequested?: boolean;

  // ---- formatVersion-2 inputs (all optional; omit for legacy behavior) ----

  /** Which pricing path to run. Absent = "standard" (legacy behavior). The
   *  matrix paths run ONLY when the config carries the matching extendedRules
   *  section; otherwise the engine falls back to the standard path. */
  serviceType?: ServiceTypeV2;
  /** Overall property condition for the matrix paths (moveInOut condition
   *  multiplier / airbnb dirtiness). Absent = the worst reported room level. */
  conditionLevel?: ConditionLevel;
  /** Hours between quote time and the service start, server-derived — never a
   *  client value. Drives the short-notice tiers when the config has them. */
  hoursUntilService?: number;
  /** Airbnb: hours between guest checkout and next check-in (host-provided).
   *  Drives the turnover-window staffing rules. */
  turnoverWindowHours?: number;
  /** Airbnb: severe or unsafe mess reported — manual review, never auto-priced. */
  severeMess?: boolean;
  /** Reported unsafe/special conditions (e.g. "significant_mold", "pests").
   *  Any entry matching the config's manual-review list flags the quote. */
  unsafeConditions?: string[];
  /** Pet-hair intensity — prices via the percentage tiers
   *  (extendedRules.extrasAppSideOverrides.petHair.percentageTiers). */
  petHair?: PetHairLevel;
  /**
   * Airbnb repeat/volume discount, resolved by the SERVICE ADAPTER from real
   * booking history at quote time (the pure engine never queries a DB).
   * Applied only to base service + size guardrail; highest-only, no stacking;
   * a structural discount reducing the service price BEFORE the 70/30 split.
   */
  airbnbDiscount?: { kind: "repeat_property" | "host_volume"; percent: number };
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
   * pays cleaners: actual cleaner compensation is 70% of captured booking
   * proceeds (the 30% Marketplace Services Fee is Sweepr's share —
   * apps/api/src/lib/payoutEngine.ts), plus 100% of tips.
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
