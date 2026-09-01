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
 * Extended multi-service ruleset (formatVersion 2) — pure helpers shared by
 * the engine, the validator, the MCP sandbox, and the admin Studio:
 *
 *  - Ruleset unwrapping (the SweeprExtendedPricingRuleset wrapper → a flat
 *    PricingConfigV2 with `extendedRules`).
 *  - Deep-clean auto-classification (standard path).
 *  - Short-notice tier resolution (replaces the single emergency surcharge).
 *  - Location-tier ZIP handling (0/+5/+10 with a cap; supersedes legacy
 *    negative per-zip discounts).
 *  - BR/BA matrix key parsing + nearest-entry resolution (moveInOut/airbnb).
 *  - Effective-extras resolution (app-side overrides: decoupled laundry and
 *    light tidying, fixed-price oven and sliding door, patio mutual
 *    exclusion, bed-linens/laundry overlap prevention, pet-hair tiers).
 *  - Staffing accessors (productivity map incl. team of 3, Airbnb staffing
 *    matrix, turnover-window team sizing) — the crew engine's contract.
 *
 * Everything is a pure function of (config, input); no DB, no env.
 */

import { QuoteInputError, roundDiv } from "./shared";
import {
  ROOM_TYPES_V2,
  type AirbnbRulesV2,
  type ConditionLevel,
  type ExtendedRulesV2,
  type ExtraDefV2,
  type ExtrasOverridesV2,
  type MoveInOutRulesV2,
  type PetHairLevel,
  type PricingConfigV2,
  type QuoteInputV2,
  type ShortNoticeTierV2,
} from "./types";

// ---------------------------------------------------------------------------
// Manual-review reason codes (machine-readable; formal copy lives with them)
// ---------------------------------------------------------------------------

export const MANUAL_REVIEW_REASONS = {
  SQFT: "sqft_over_threshold",
  PRICE: "price_over_auto_quote_limit",
  OBSTRUCTED: "obstructed_clutter",
  UNSAFE: "unsafe_conditions",
  SEVERE_MESS: "severe_mess",
  TURNOVER_WINDOW: "turnover_window_under_4h",
  /** Flag DEFINITION only — set by day-of-service tooling when the arrival
   *  condition is materially outside the booked condition/scope, never at
   *  quote time. Exported so every surface uses the same code. */
  ARRIVAL_MISMATCH: "arrival_condition_mismatch",
} as const;

// ---------------------------------------------------------------------------
// Ruleset unwrapping (formatVersion 2)
// ---------------------------------------------------------------------------

export interface UnwrappedRuleset {
  config: PricingConfigV2;
  /** Wrapper metadata, when the input was a SweeprExtendedPricingRuleset. */
  meta: { name?: string; note?: string; format?: string; formatVersion?: number } | null;
}

/**
 * Accepts any of:
 *  - a legacy flat PricingConfigV2 (returned as-is),
 *  - a flat formatVersion-2 config (PricingConfigV2 + extendedRules),
 *  - the SweeprExtendedPricingRuleset wrapper
 *    ({ format, formatVersion, name, note, config, extendedRules }) — the
 *    master ruleset upload shape — which is flattened to
 *    { ...config, formatVersion: 2, extendedRules }.
 * Unknown extendedRules sections are preserved verbatim.
 */
export function unwrapPricingRuleset(raw: unknown): UnwrappedRuleset {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { config: raw as PricingConfigV2, meta: null };
  }
  const obj = raw as Record<string, unknown>;
  const isWrapper =
    obj.config !== null &&
    typeof obj.config === "object" &&
    !Array.isArray(obj.config) &&
    (obj.format === "SweeprExtendedPricingRuleset" || "extendedRules" in obj) &&
    !("laborMatrix" in obj);
  if (!isWrapper) return { config: obj as unknown as PricingConfigV2, meta: null };
  const inner = obj.config as Record<string, unknown>;
  const extendedRules =
    obj.extendedRules && typeof obj.extendedRules === "object" && !Array.isArray(obj.extendedRules)
      ? (obj.extendedRules as ExtendedRulesV2)
      : undefined;
  const flat: PricingConfigV2 = {
    ...(inner as unknown as PricingConfigV2),
    ...(extendedRules ? { formatVersion: 2 as const, extendedRules } : {}),
  };
  return {
    config: flat,
    meta: {
      name: typeof obj.name === "string" ? obj.name : undefined,
      note: typeof obj.note === "string" ? obj.note : undefined,
      format: typeof obj.format === "string" ? obj.format : undefined,
      formatVersion: typeof obj.formatVersion === "number" ? obj.formatVersion : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// BR/BA matrix keys ("Studio_or_1BR_1BA", "3BR_2BA") + nearest resolution
// ---------------------------------------------------------------------------

interface ParsedComboKey {
  brMin: number;
  brMax: number;
  ba: number;
}

function parseComboKey(key: string): ParsedComboKey | null {
  const m = /^(Studio_or_1BR|(\d+)BR)_(\d+)BA$/.exec(key);
  if (!m) return null;
  const ba = Number(m[3]);
  if (m[1] === "Studio_or_1BR") return { brMin: 0, brMax: 1, ba };
  return { brMin: Number(m[2]), brMax: Number(m[2]), ba };
}

export interface MatrixResolution<T> {
  key: string;
  value: T;
  /** false when the requested BR/BA combo had no exact entry and the nearest
   *  one was used (surfaced as a quote warning). */
  exact: boolean;
}

/**
 * Resolve a BR/BA-keyed matrix entry. Exact match first; otherwise nearest:
 * smallest bedroom distance (ties prefer the LOWER bedroom count), then the
 * closest bathroom count preferring at-or-below (never silently billing a
 * bathroom the home does not have).
 */
export function resolveComboMatrixEntry<T>(
  matrix: Record<string, T>,
  bedrooms: number,
  bathrooms: number,
): MatrixResolution<T> | null {
  const entries = Object.entries(matrix)
    .map(([key, value]) => ({ key, value, parsed: parseComboKey(key) }))
    .filter((e): e is { key: string; value: T; parsed: ParsedComboKey } => e.parsed !== null);
  if (entries.length === 0) return null;

  const brDist = (p: ParsedComboKey) =>
    bedrooms < p.brMin ? p.brMin - bedrooms : bedrooms > p.brMax ? bedrooms - p.brMax : 0;

  const exact = entries.find((e) => brDist(e.parsed) === 0 && e.parsed.ba === bathrooms);
  if (exact) return { key: exact.key, value: exact.value, exact: true };

  const minBr = Math.min(...entries.map((e) => brDist(e.parsed)));
  let pool = entries.filter((e) => brDist(e.parsed) === minBr);
  const minBrMax = Math.min(...pool.map((e) => e.parsed.brMax));
  pool = pool.filter((e) => e.parsed.brMax === minBrMax);

  const below = pool.filter((e) => e.parsed.ba <= bathrooms);
  const pick =
    below.length > 0
      ? below.reduce((a, b) => (b.parsed.ba > a.parsed.ba ? b : a))
      : pool.reduce((a, b) => (b.parsed.ba < a.parsed.ba ? b : a));
  return { key: pick.key, value: pick.value, exact: false };
}

/** Resolve a bedroom-count-keyed table ("Studio_or_1BR", "3BR"), nearest-below
 *  preferred, clamped to the table's range. */
export function resolveBedroomTableEntry(
  table: Record<string, number>,
  bedrooms: number,
): number | null {
  const entries = Object.entries(table)
    .map(([key, value]) => {
      const m = /^(Studio_or_1BR|(\d+)BR)$/.exec(key);
      if (!m) return null;
      const brMax = m[1] === "Studio_or_1BR" ? 1 : Number(m[2]);
      const brMin = m[1] === "Studio_or_1BR" ? 0 : brMax;
      return { brMin, brMax, value };
    })
    .filter((e): e is { brMin: number; brMax: number; value: number } => e !== null)
    .sort((a, b) => a.brMax - b.brMax);
  if (entries.length === 0) return null;
  const exact = entries.find((e) => bedrooms >= e.brMin && bedrooms <= e.brMax);
  if (exact) return exact.value;
  if (bedrooms < entries[0].brMin) return entries[0].value;
  // Above the table: use the largest entry (guardrail keeps charging by sqft).
  return entries[entries.length - 1].value;
}

// ---------------------------------------------------------------------------
// Deep-clean auto-classification (standard path)
// ---------------------------------------------------------------------------

export interface DeepCleanClassification {
  applied: boolean;
  level3Rooms: number;
  level4Rooms: number;
  countedRooms: number;
  percentLevel3or4: number;
}

/**
 * Deterministic classification from the REPORTED inputs (never from the
 * probabilistic posterior, so the flag is stable and explainable):
 *  - a type with direct counts-by-level uses them exactly;
 *  - when EVERY counted type reports the same level (the consensus rule),
 *    every room of every type is at that level;
 *  - otherwise a type contributes exactly its one guaranteed worst room at
 *    the reported maximum; the remaining same-type rooms are unknown and
 *    count toward the denominator only.
 * Triggers (any): ≥1 level-4 room, ≥2 level-3 rooms, or ≥40% of counted
 * rooms at level 3/4 (thresholds configurable). Add-ons never trigger it.
 */
export function classifyDeepClean(
  rules: NonNullable<ExtendedRulesV2["deepClean"]>,
  input: Pick<QuoteInputV2, "counts" | "conditions" | "countsByLevel">,
): DeepCleanClassification {
  let level3 = 0;
  let level4 = 0;
  let counted = 0;

  const countedTypes = ROOM_TYPES_V2.filter((t) => (input.counts[t] ?? 0) >= 1);
  const consensusLevel =
    countedTypes.length > 0 &&
    countedTypes.every((t) => input.conditions[t] === input.conditions[countedTypes[0]])
      ? input.conditions[countedTypes[0]]
      : null;

  for (const t of countedTypes) {
    const n = input.counts[t];
    counted += n;
    const direct = input.countsByLevel?.[t];
    if (direct && direct.length === 4) {
      level3 += direct[2];
      level4 += direct[3];
    } else if (consensusLevel !== null) {
      if (consensusLevel === 3) level3 += n;
      if (consensusLevel === 4) level4 += n;
    } else {
      const max = input.conditions[t];
      if (max === 3) level3 += 1;
      if (max === 4) level4 += 1;
    }
  }

  const pct = counted > 0 ? ((level3 + level4) / counted) * 100 : 0;

  let minL4 = 1;
  let minL3 = 2;
  let minPct = 40;
  for (const trigger of rules.classification?.triggerIfAny ?? []) {
    if (typeof trigger.level4RoomCountAtLeast === "number") minL4 = trigger.level4RoomCountAtLeast;
    if (typeof trigger.level3RoomCountAtLeast === "number") minL3 = trigger.level3RoomCountAtLeast;
    if (typeof trigger.percentOfCountedRoomsLevel3Or4AtLeast === "number") {
      minPct = trigger.percentOfCountedRoomsLevel3Or4AtLeast;
    }
  }

  const applied = level4 >= minL4 || level3 >= minL3 || pct >= minPct;
  return {
    applied,
    level3Rooms: level3,
    level4Rooms: level4,
    countedRooms: counted,
    percentLevel3or4: Math.round(pct * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Short-notice tiers (<24h / 24-48h / >48h, never stacking)
// ---------------------------------------------------------------------------

function tierMatches(t: ShortNoticeTierV2, hours: number): boolean {
  if (t.hoursBeforeServiceMaxExclusive != null && !(hours < t.hoursBeforeServiceMaxExclusive)) {
    return false;
  }
  if (t.hoursBeforeServiceMaxInclusive != null && !(hours <= t.hoursBeforeServiceMaxInclusive)) {
    return false;
  }
  if (t.hoursBeforeServiceMinInclusive != null && !(hours >= t.hoursBeforeServiceMinInclusive)) {
    return false;
  }
  if (t.hoursBeforeServiceMinExclusive != null && !(hours > t.hoursBeforeServiceMinExclusive)) {
    return false;
  }
  return true;
}

function tierBandLabel(t: ShortNoticeTierV2): string {
  if (t.hoursBeforeServiceMaxExclusive != null && t.hoursBeforeServiceMinInclusive == null) {
    return `within ${t.hoursBeforeServiceMaxExclusive} hours`;
  }
  const lo = t.hoursBeforeServiceMinInclusive ?? t.hoursBeforeServiceMinExclusive;
  const hi = t.hoursBeforeServiceMaxInclusive ?? t.hoursBeforeServiceMaxExclusive;
  if (lo != null && hi != null) return `${lo} to ${hi} hours ahead`;
  if (lo != null) return `more than ${lo} hours ahead`;
  return "short notice";
}

export interface ShortNoticeResolution {
  surchargeBps: number;
  label: string;
}

/**
 * Resolve the short-notice surcharge from the config's tiers. Exactly one
 * tier applies (first match; never stacking). `hoursUntilService` is
 * server-derived; when only the legacy boolean `emergency` is known, it maps
 * to the strictest (<24h) tier — the same magnitude the single legacy
 * surcharge charged. Returns null when no surcharge applies.
 */
export function resolveShortNotice(
  rules: NonNullable<ExtendedRulesV2["shortNotice"]>,
  hoursUntilService: number | undefined,
  emergency: boolean,
): ShortNoticeResolution | null {
  const tiers = rules.tiers ?? [];
  if (tiers.length === 0) return null;
  let hours = hoursUntilService;
  if (hours === undefined) {
    if (!emergency) return null;
    hours = 0; // legacy boolean only: treat as the strictest tier
  }
  for (const t of tiers) {
    if (!tierMatches(t, hours)) continue;
    const pct = t.surchargePercent ?? 0;
    if (pct <= 0) return null;
    return {
      surchargeBps: Math.round(pct * 100),
      label: `Short-notice booking (${tierBandLabel(t)}, +${pct}%)`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Location tiers (ZIP): 0/+5/+10 with a cap; supersedes legacy discounts
// ---------------------------------------------------------------------------

/**
 * When the config carries location tiers, the ZIP multiplier feeding v2 is
 * clamped into [0, cap]: legacy NEGATIVE per-zip discounts (e.g. the 94541
 * -5% production row) are superseded and ignored, and nothing can exceed the
 * configured cap (default +10%).
 */
export function resolveZipPct(
  rules: NonNullable<ExtendedRulesV2["locationPricing"]> | undefined,
  rawPct: number,
): number {
  if (!rules) return rawPct;
  const cap = typeof rules.initialCapPercent === "number" ? rules.initialCapPercent : 10;
  return Math.min(Math.max(rawPct, 0), cap);
}

// ---------------------------------------------------------------------------
// Effective extras (app-side overrides applied at resolve time — the stored
// config round-trips untouched)
// ---------------------------------------------------------------------------

export interface EffectiveExtraDefV2 extends ExtraDefV2 {
  /**
   * Minutes of ACTIVE cleaner labor per unit that count toward scheduling
   * (the cleaner is genuinely busy) but are NOT billed through the labor
   * rate — the customer price for these extras is their fixed amount.
   * Used by the decoupled extras (laundry, light tidying, inside oven,
   * sliding glass door).
   */
  activeLaborMinutesPerUnit?: number;
}

export const LAUNDRY_MACHINE_DEFAULTS = {
  washMinutesPerLoad: 35,
  dryMinutesPerLoad: 60,
} as const;

/** Machine-cycle elapsed minutes for N laundry loads, pipelined on one
 *  washer/dryer pair: wash the first load, then each load dries in sequence
 *  (subsequent washes overlap the previous dry). Modeling knobs overridable
 *  via extrasAppSideOverrides.laundry. */
export function laundryMachineElapsedMinutes(
  overrides: ExtrasOverridesV2["laundry"] | undefined,
  loads: number,
): number {
  if (loads <= 0) return 0;
  const wash = overrides?.machineWashMinutesPerLoad ?? LAUNDRY_MACHINE_DEFAULTS.washMinutesPerLoad;
  const dry = overrides?.machineDryMinutesPerLoad ?? LAUNDRY_MACHINE_DEFAULTS.dryMinutesPerLoad;
  return wash + dry * loads;
}

/**
 * Apply extendedRules.extrasAppSideOverrides onto the stored catalog,
 * producing the EFFECTIVE definitions the engine prices with:
 *  - inside_oven: fixed customer price ($40) with 35 min active labor.
 *  - laundry: fixed $25/load (max 2); its catalog minutes become ACTIVE labor
 *    (machine cycles are modeled separately and never billed).
 *  - organization_light (Light Tidying): ACTIVATED, fixed $25 per 30-minute
 *    block; 30 min/block books as active labor (decoupled from the labor
 *    rate).
 *  - sliding_glass_door_cleaning: fixed $20 including its track.
 *  - patio_sweep / patio_sweep_cobwebs: mutually exclusive (overlap group).
 *  - change_bed_linens: cannot be combined with laundry (overlap
 *    double-charge prevention).
 *  - pet_hair_detail: DEACTIVATED when percentage tiers replace the flat
 *    placeholder (pet hair then prices via QuoteInputV2.petHair).
 * A config without overrides returns its catalog unchanged.
 */
export function resolveEffectiveExtras(config: PricingConfigV2): EffectiveExtraDefV2[] {
  const o = config.extendedRules?.extrasAppSideOverrides;
  if (!o) return config.extras;
  const hasLaundry = config.extras.some((e) => e.key === "laundry");
  return config.extras.map((def): EffectiveExtraDefV2 => {
    switch (def.key) {
      case "inside_oven":
        if (!o.insideOven) return def;
        return {
          ...def,
          mode: "fixed",
          fixedCentsPerUnit: o.insideOven.customerPriceCents ?? def.fixedCentsPerUnit,
          activeLaborMinutesPerUnit: o.insideOven.activeLaborMinutes ?? def.minutesPerUnit,
        };
      case "laundry":
        if (!o.laundry) return def;
        return {
          ...def,
          mode: "fixed",
          fixedCentsPerUnit: o.laundry.customerPriceCentsPerLoad ?? def.fixedCentsPerUnit,
          maxQuantity: o.laundry.maxLoads ?? def.maxQuantity,
          activeLaborMinutesPerUnit: def.minutesPerUnit,
          ...(o.bedLinensAndLaundry?.preventDoubleChargeForOverlappingWork
            ? { overlapGroup: def.overlapGroup ?? "linens_laundry" }
            : {}),
        };
      case "organization_light":
        if (!o.lightTidying) return def;
        return {
          ...def,
          active: true,
          mode: "fixed",
          fixedCentsPerUnit: o.lightTidying.customerPriceCentsPer30MinuteBlock ?? 2500,
          activeLaborMinutesPerUnit: o.lightTidying.minutesPerBlock ?? 30,
        };
      case "sliding_glass_door_cleaning":
        if (!o.slidingGlassDoor) return def;
        return {
          ...def,
          mode: "fixed",
          fixedCentsPerUnit: o.slidingGlassDoor.detailPriceCents ?? def.fixedCentsPerUnit,
          activeLaborMinutesPerUnit: def.minutesPerUnit,
        };
      case "patio_sweep":
      case "patio_sweep_cobwebs":
        if (!o.patio?.basicAndCobwebDetailMutuallyExclusive) return def;
        return { ...def, overlapGroup: def.overlapGroup ?? "patio_scope" };
      case "change_bed_linens":
        if (!o.bedLinensAndLaundry?.preventDoubleChargeForOverlappingWork || !hasLaundry) {
          return def;
        }
        return { ...def, overlapGroup: def.overlapGroup ?? "linens_laundry" };
      case "pet_hair_detail":
        if (o.petHair?.useFlat39DollarPlaceholder === false && o.petHair.percentageTiers?.length) {
          return { ...def, active: false };
        }
        return def;
      default:
        return def;
    }
  });
}

export const PET_HAIR_LEVELS: PetHairLevel[] = ["light", "moderate", "heavy"];

/** Percentage of the base cleaning workload for a pet-hair level, from the
 *  configured tiers ([light, moderate, heavy]); null when not configured. */
export function petHairPercent(
  overrides: ExtrasOverridesV2 | undefined,
  level: PetHairLevel,
): number | null {
  const tiers = overrides?.petHair?.percentageTiers;
  if (!tiers || tiers.length < 3) return null;
  return tiers[PET_HAIR_LEVELS.indexOf(level)] ?? null;
}

// ---------------------------------------------------------------------------
// Airbnb turnover scope suppression (server-enforced)
// ---------------------------------------------------------------------------

/** Add-on keys included in the Airbnb turnover base per the suppression
 *  rules — selecting them adds no charge (they are already covered). */
export function airbnbSuppressedAddOnKeys(rules: AirbnbRulesV2 | undefined): Set<string> {
  const s = rules?.scopeAndSuppressionRules as Record<string, unknown> | undefined;
  const keys = new Set<string>();
  if (!s) return keys;
  if (s.suppressChangeBedLinensAddonWhenIncluded) keys.add("change_bed_linens");
  if (s.suppressLoadDishwasherAddonWhenIncluded) keys.add("load_dishwasher");
  if (s.suppressBasicPatioSweepAddonWhenIncluded) keys.add("patio_sweep");
  return keys;
}

// ---------------------------------------------------------------------------
// Staffing contract (consumed by the crew engine)
// ---------------------------------------------------------------------------

const PRODUCTIVITY_FALLBACK: Record<string, number> = { "1": 1000, "2": 1800, "3": 2500 };

/**
 * The RESOLVED team-productivity map: the config's
 * scheduling.teamProductivityPermille plus any team sizes the marketplace
 * economics section adds (e.g. threeCleanerProductivityPermille → "3": 2500).
 * Explicit scheduling entries always win.
 */
export function resolveTeamProductivityPermille(config: PricingConfigV2): Record<string, number> {
  const map = { ...config.scheduling.teamProductivityPermille };
  const econ = config.extendedRules?.payoutAndMarketplaceEconomics;
  if (econ) {
    if (map["1"] === undefined && typeof econ.oneCleanerProductivityPermille === "number") {
      map["1"] = econ.oneCleanerProductivityPermille;
    }
    if (map["2"] === undefined && typeof econ.twoCleanerProductivityPermille === "number") {
      map["2"] = econ.twoCleanerProductivityPermille;
    }
    if (map["3"] === undefined && typeof econ.threeCleanerProductivityPermille === "number") {
      map["3"] = econ.threeCleanerProductivityPermille;
    }
  }
  return map;
}

/** Typed accessor for the Airbnb staffing matrix (null when not configured). */
export function getAirbnbStaffingMatrix(
  config: PricingConfigV2,
): NonNullable<AirbnbRulesV2["staffingMatrix"]> | null {
  return config.extendedRules?.airbnbSTR?.staffingMatrix ?? null;
}

/** Required cleaners for a BR/BA combo at a condition level, from the Airbnb
 *  staffing matrix (nearest-entry resolution). Null when not configured. */
export function getAirbnbStaffing(
  config: PricingConfigV2,
  bedrooms: number,
  bathrooms: number,
  level: ConditionLevel,
): number | null {
  const matrix = getAirbnbStaffingMatrix(config);
  if (!matrix) return null;
  const entry = resolveComboMatrixEntry(matrix, bedrooms, bathrooms);
  if (!entry) return null;
  const v = entry.value[`L${level}` as "L1" | "L2" | "L3" | "L4"];
  return typeof v === "number" ? v : null;
}

export interface AirbnbTeamSizing {
  teamSize: number;
  manualReview: boolean;
  notes: string[];
}

/** A job is "borderline" when the base team's estimated on-site time exceeds
 *  this fraction of the turnover window. */
const BORDERLINE_WINDOW_FRACTION_PERMILLE = 850;

/**
 * Airbnb team sizing: staffing matrix (BR/BA × condition) + turnover-window
 * rules. Window rules (hours between checkout and next check-in):
 *  - under 4h: staff up one AND flag for manual review;
 *  - 4h to <5h: borderline jobs (base-team elapsed > 85% of the window) add
 *    one cleaner;
 *  - 5h to <6h: default staffing;
 *  - 6h+: borderline L1/L2 jobs may drop one cleaner IF the smaller team
 *    still fits within 85% of the window — NEVER L3/L4.
 * Clamped to [1, max team size in the resolved productivity map].
 */
export function computeAirbnbTeamSize(
  config: PricingConfigV2,
  args: {
    bedrooms: number;
    bathrooms: number;
    level: ConditionLevel;
    turnoverWindowHours?: number;
    scheduledLaborMinutes: number;
  },
): AirbnbTeamSizing {
  const productivity = resolveTeamProductivityPermille(config);
  const teamSizes = Object.keys(productivity)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 1);
  const maxTeam = teamSizes.length > 0 ? Math.max(...teamSizes) : 3;

  const productivityFor = (n: number): number =>
    productivity[String(n)] ?? PRODUCTIVITY_FALLBACK[String(Math.min(n, 3))] ?? 1000 * n;
  const elapsedFor = (n: number): number =>
    Math.ceil((args.scheduledLaborMinutes * 1000) / productivityFor(Math.max(1, n)));

  const matrixSize = getAirbnbStaffing(config, args.bedrooms, args.bathrooms, args.level);
  const base =
    matrixSize ??
    (args.scheduledLaborMinutes > config.scheduling.twoPersonThresholdMinutes ? 2 : 1);

  const clamp = (n: number) => Math.min(Math.max(1, n), maxTeam);
  const notes: string[] = [];
  let teamSize = clamp(base);
  let manualReview = false;

  const w = args.turnoverWindowHours;
  if (w !== undefined) {
    const windowMinutes = Math.round(w * 60);
    const borderlineLimit = roundDiv(windowMinutes * BORDERLINE_WINDOW_FRACTION_PERMILLE, 1000);
    if (w < 4) {
      teamSize = clamp(base + 1);
      manualReview = true;
      notes.push(
        "This turnover window is under 4 hours. We add a cleaner and our team confirms feasibility before the booking is finalized.",
      );
    } else if (w < 5) {
      if (elapsedFor(base) > borderlineLimit) {
        teamSize = clamp(base + 1);
        notes.push("Tight same-day window: one cleaner added so the turnover finishes in time.");
      }
    } else if (w >= 6) {
      if (args.level <= 2 && base > 1 && elapsedFor(base - 1) <= borderlineLimit) {
        teamSize = clamp(base - 1);
        notes.push("Long turnover window: staffing reduced by one for this lighter clean.");
      }
      // L3/L4 never reduce on window length alone.
    }
  }

  return { teamSize, manualReview, notes };
}

// ---------------------------------------------------------------------------
// Matrix-path building blocks (shared by moveInOut and airbnb in the engine)
// ---------------------------------------------------------------------------

export interface MatrixBaseResolution {
  key: string;
  baseCents: number;
  exact: boolean;
}

export function resolveMoveInOutBase(
  rules: MoveInOutRulesV2,
  bedrooms: number,
  bathrooms: number,
): MatrixBaseResolution {
  const entry = resolveComboMatrixEntry(rules.basePriceMatrixCents, bedrooms, bathrooms);
  if (!entry || typeof entry.value !== "number") {
    throw new QuoteInputError("matrix_unresolvable", "No move-in/out price for this home size.");
  }
  return { key: entry.key, baseCents: entry.value, exact: entry.exact };
}

export function resolveAirbnbBase(
  rules: AirbnbRulesV2,
  bedrooms: number,
  bathrooms: number,
): MatrixBaseResolution {
  const entry = resolveComboMatrixEntry(rules.basePriceMatrixCents, bedrooms, bathrooms);
  if (!entry || typeof entry.value !== "number") {
    throw new QuoteInputError("matrix_unresolvable", "No turnover price for this property size.");
  }
  return { key: entry.key, baseCents: entry.value, exact: entry.exact };
}

/** Condition-multiplier percent for a level from an {L1..L4} percent map. */
export function levelPercent(
  map: { L1?: number; L2?: number; L3?: number; L4?: number } | undefined,
  level: ConditionLevel,
  fallback = 0,
): number {
  const v = map?.[`L${level}` as "L1" | "L2" | "L3" | "L4"];
  return typeof v === "number" ? v : fallback;
}
