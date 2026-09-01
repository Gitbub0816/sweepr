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
 * Adapter between the booking flow's wire shape and the v2 quote service.
 * Returns a fully assembled pricing block when a v2 pricing version is
 * Active, or null so computeBookingPricing falls through to the existing
 * engine chain (the explicit rollout gate: publishing a version turns v2 on,
 * archiving it turns v2 off — no code change either way).
 */

import type { Sql } from "@sweepr/db";
import { foundingCustomerDiscountPct } from "../foundingMember";
import { logger } from "../logger";
import { QuoteInputError } from "@sweepr/quote-engine";
import { loadActivePricingVersion, quoteAndPersist } from "./service";
import type {
  ClutterLevel,
  ConditionLevel,
  ExtendedRulesV2,
  PetHairLevel,
  QuoteInputV2,
  QuoteResultV2,
  RoomTypeV2,
  ServiceTypeV2,
} from "@sweepr/quote-engine";
import { ROOM_TYPES_V2 } from "@sweepr/quote-engine";

const LEVEL_MAP: Record<string, ConditionLevel> = {
  level_1: 1,
  level_2: 2,
  level_3: 3,
  level_4: 4,
};

/**
 * Wire serviceType (packages/types ServiceType) → engine pricing path.
 * move_in_out and vacation_rental route to their matrix paths WHEN the
 * active config carries the matching extendedRules section; every other
 * package (light/standard/deep/recurring/post_construction) prices on the
 * standard labor-minutes path — the deep-clean AUTO-classification, not the
 * package choice, is what marks a job "Deep Clean" under v2.
 */
export function mapWireServiceType(wire: string | undefined): ServiceTypeV2 {
  if (wire === "move_in_out") return "moveInOut";
  if (wire === "vacation_rental") return "airbnb";
  return "standard";
}

/** Customer-declared cleaning level → overall matrix condition level, used
 *  only when no per-room selections exist (matrix paths without the room
 *  flow). Magnitudes align with the legacy surcharges (0/15/35%) vs the
 *  matrix multipliers (0/10/20/30%). */
const CLEANING_LEVEL_TO_CONDITION: Record<string, ConditionLevel> = {
  refresh: 1,
  extra_attention: 3,
  significant_attention: 4,
};

export interface BookingWireInput {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  addOnKeys: string[];
  rooms?: Array<{ roomType: RoomTypeV2; level: string }>;
  clutter?: Partial<Record<RoomTypeV2, number>>;
  roomCountsByLevel?: Partial<Record<RoomTypeV2, number[]>>;
  /** Customer explicitly opted to add one extra cleaner for speed (flat fee). */
  extraCleanerRequested?: boolean;
  /** Wire package (ServiceType); routes move_in_out / vacation_rental to the
   *  matrix paths when the active config prices them. */
  serviceType?: string;
  /** Customer-declared cleaning level (matrix condition fallback). */
  cleaningLevel?: string;
  /** ISO schedule instant — drives the short-notice tier hours server-side. */
  scheduledAt?: string;
  /** Saved address id — anchors the Airbnb repeat-property discount. */
  addressId?: string;
  /** Customer-picked pet-hair intensity (percentage tiers). */
  petHairLevel?: PetHairLevel;
}

export interface V2Assembly {
  engine: "v2";
  quoteId: string;
  versionId: string;
  expiresAt: string;
  result: QuoteResultV2;
  baseTotalPrice: number;
  basePrice: number;
  addonsTotal: number;
  feeCents: number;
  taxCents: number;
  cleanerPayout: number;
  levelSurchargeCents: 0;
  emergencySurchargeCents: number;
  isEmergency: boolean;
  zipPricingAdjustmentCents: number;
  totalPrice: number;
  foundingCustomerDiscountCents: number;
  lineItems: Array<{ label: string; cents: number }>;
}

/** Build the engine input from the booking wire shape (mirrors the legacy
 *  room engine's counting: bathrooms ceil'd, one kitchen, one living area).
 *  formatVersion-2 fields are set ONLY when meaningful, so a legacy standard
 *  booking normalizes (and fingerprints) exactly as before. */
export function buildQuoteInputFromBooking(
  input: BookingWireInput,
  opts: {
    emergency: boolean;
    zipMultiplierPct: number;
    serviceType?: ServiceTypeV2;
    hoursUntilService?: number;
    airbnbDiscount?: QuoteInputV2["airbnbDiscount"];
  },
): QuoteInputV2 {
  const conditions = {} as Record<RoomTypeV2, ConditionLevel>;
  for (const t of ROOM_TYPES_V2) conditions[t] = 1;
  for (const r of input.rooms ?? []) {
    const lvl = LEVEL_MAP[r.level];
    if (lvl) conditions[r.roomType] = lvl;
  }
  const clutter: Partial<Record<RoomTypeV2, ClutterLevel>> = {};
  for (const t of ROOM_TYPES_V2) {
    const v = input.clutter?.[t];
    if (v === 1 || v === 2) clutter[t] = v;
  }
  const countsByLevel: QuoteInputV2["countsByLevel"] = {};
  for (const t of ROOM_TYPES_V2) {
    const arr = input.roomCountsByLevel?.[t];
    if (arr && arr.length === 4) {
      countsByLevel[t] = [arr[0], arr[1], arr[2], arr[3]];
    }
  }
  const matrixPath = opts.serviceType === "moveInOut" || opts.serviceType === "airbnb";

  // Pet-hair percentage tiers: an explicit wire level wins; a legacy
  // pet_hair_detail add-on key maps to the moderate tier (the engine retires
  // the flat placeholder when tiers are configured). The key is stripped from
  // extras either way — pet hair prices via the tiers, never twice.
  let petHair = input.petHairLevel;
  let addOnKeys = input.addOnKeys;
  if (addOnKeys.includes("pet_hair_detail")) {
    petHair = petHair ?? "moderate";
    addOnKeys = addOnKeys.filter((k) => k !== "pet_hair_detail");
  }

  const quoteInput: QuoteInputV2 = {
    serviceArea: "default",
    currency: "USD",
    counts: {
      kitchen: 1,
      bathroom: Math.max(1, Math.ceil(input.bathrooms)),
      // Matrix paths allow 0 bedrooms (a studio); the standard path keeps the
      // legacy floor of 1 so existing quotes stay byte-identical.
      bedroom: matrixPath ? Math.max(0, input.bedrooms) : Math.max(1, input.bedrooms),
      living_room: 1,
    },
    conditions,
    countsByLevel: Object.keys(countsByLevel).length > 0 ? countsByLevel : undefined,
    clutter,
    sqft: input.sqft,
    extras: addOnKeys.map((key) => ({ key, quantity: 1 })),
    emergency: opts.emergency,
    zipMultiplierPct: opts.zipMultiplierPct,
    extraCleanerRequested: input.extraCleanerRequested === true,
  };
  if (petHair) quoteInput.petHair = petHair;
  if (matrixPath) {
    quoteInput.serviceType = opts.serviceType;
    // Overall condition: worst reported room when the room flow ran,
    // otherwise the declared cleaning level.
    const reported = (input.rooms ?? [])
      .map((r) => LEVEL_MAP[r.level])
      .filter((l): l is ConditionLevel => Boolean(l));
    quoteInput.conditionLevel =
      reported.length > 0
        ? (Math.max(...reported) as ConditionLevel)
        : (CLEANING_LEVEL_TO_CONDITION[input.cleaningLevel ?? "refresh"] ?? 1);
    if (opts.airbnbDiscount) quoteInput.airbnbDiscount = opts.airbnbDiscount;
  }
  if (opts.hoursUntilService !== undefined) {
    quoteInput.hoursUntilService = opts.hoursUntilService;
  }
  return quoteInput;
}

/** Hours from now until the scheduled instant (never negative); undefined
 *  when the instant is unparseable. */
export function hoursUntil(scheduledAtIso: string | undefined, now: Date): number | undefined {
  if (!scheduledAtIso) return undefined;
  const t = Date.parse(scheduledAtIso);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, (t - now.getTime()) / 3_600_000);
}

/**
 * Airbnb repeat/volume discount, resolved from REAL booking history at quote
 * time (the pure engine never queries a DB). Rules (highest only, never
 * stacking; the engine applies it to base service + size guardrail only,
 * BEFORE the 70/30 split):
 *  - host volume: ≥ N completed turnovers across ALL the host's properties in
 *    the rolling 30 days → the volume percent (default 10%);
 *  - repeat property: ≥ 1 completed turnover at the SAME property (by saved
 *    address) → the repeat percent (default 5%). Follows the address, so it
 *    needs addressId — checkout has it; an address-less preview shows the
 *    volume discount only.
 * Any query failure resolves to no discount (pricing never blocks on this).
 */
export async function resolveAirbnbDiscount(
  sql: Sql,
  args: {
    customerId: string | null;
    addressId: string | null;
    rules: NonNullable<ExtendedRulesV2["airbnbSTR"]> | undefined;
  },
): Promise<QuoteInputV2["airbnbDiscount"] | undefined> {
  const d = args.rules?.repeatVolumeDiscounts;
  if (!d || !args.customerId) return undefined;
  const volumePct = d.hostRolling30DayDiscountPercent ?? 10;
  const volumeThreshold = d.hostRolling30DayCompletedTurnoversThreshold ?? 10;
  const repeatPct = d.secondAndLaterSamePropertyPercent ?? 5;
  try {
    if (volumePct > 0) {
      const volRows = (await sql`
        SELECT COUNT(*)::int AS n FROM bookings
        WHERE customer_id = ${args.customerId}
          AND service_type = 'vacation_rental'
          AND status = 'completed'
          AND COALESCE(completed_at, scheduled_at) >= NOW() - INTERVAL '30 days'
      `) as Array<{ n: number }>;
      if ((volRows[0]?.n ?? 0) >= volumeThreshold) {
        return { kind: "host_volume", percent: volumePct };
      }
    }
    if (repeatPct > 0 && args.addressId) {
      const propRows = (await sql`
        SELECT COUNT(*)::int AS n FROM bookings
        WHERE customer_id = ${args.customerId}
          AND address_id = ${args.addressId}
          AND service_type = 'vacation_rental'
          AND status = 'completed'
      `) as Array<{ n: number }>;
      if ((propRows[0]?.n ?? 0) >= 1) {
        return { kind: "repeat_property", percent: repeatPct };
      }
    }
  } catch (err) {
    logger.warn("airbnb discount history lookup failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return undefined;
}

/** True when a booking's persisted pricing_line_items_json carries the
 *  deep-clean stamp written at creation. */
export function hasDeepCleanMarker(lineItemsJson: unknown): boolean {
  return (
    Array.isArray(lineItemsJson) &&
    lineItemsJson.some(
      (i) =>
        i !== null &&
        typeof i === "object" &&
        (i as { label?: unknown }).label === "deep_clean" &&
        (i as { applied?: unknown }).applied === true,
    )
  );
}

/**
 * Price a booking through v2 when active. Returns null when v2 is dark, the
 * path cannot price this input (standard with no room selections; a matrix
 * package on a config without its extendedRules section), or the v2 path
 * failed — the caller then continues down the existing engine chain, so a
 * v2 problem can never block a booking.
 */
export async function assembleV2Pricing(
  sql: Sql,
  input: BookingWireInput,
  opts: {
    customerId: string | null;
    emergency: boolean;
    zipMultiplierPct: number;
    now?: Date;
  },
): Promise<V2Assembly | null> {
  const mapped = mapWireServiceType(input.serviceType);
  // Route resolution needs the active config (cached; also loaded inside
  // quoteAndPersist): a matrix package only prices on v2 when the active
  // version carries its rules — otherwise the legacy chain keeps pricing it
  // exactly as before this feature.
  const active = await loadActivePricingVersion(sql);
  if (!active) return null;
  const serviceType: ServiceTypeV2 =
    mapped === "moveInOut" && active.config.extendedRules?.moveInOut
      ? "moveInOut"
      : mapped === "airbnb" && active.config.extendedRules?.airbnbSTR
        ? "airbnb"
        : "standard";
  // The standard path still requires the room-condition flow (legacy gate).
  if (serviceType === "standard" && (!input.rooms || input.rooms.length === 0)) return null;
  try {
    const airbnbDiscount =
      serviceType === "airbnb"
        ? await resolveAirbnbDiscount(sql, {
            customerId: opts.customerId,
            addressId: input.addressId ?? null,
            rules: active.config.extendedRules?.airbnbSTR,
          })
        : undefined;
    const quoted = await quoteAndPersist(
      sql,
      buildQuoteInputFromBooking(input, {
        emergency: opts.emergency,
        zipMultiplierPct: opts.zipMultiplierPct,
        serviceType: serviceType === "standard" ? undefined : serviceType,
        hoursUntilService: hoursUntil(input.scheduledAt, opts.now ?? new Date()),
        airbnbDiscount,
      }),
      { customerId: opts.customerId },
    );
    if (!quoted) return null;
    const { result, quoteId, version, expiresAt } = quoted;

    // Founding Member discount stays outside the engine (fee-only, never
    // reduces cleaner payout) — same layering as the legacy paths.
    let foundingCustomerDiscountCents = 0;
    if (opts.customerId) {
      const pct = await foundingCustomerDiscountPct(sql, opts.customerId);
      if (pct > 0) foundingCustomerDiscountCents = Math.round(result.totalCents * (pct / 100));
    }
    const totalPrice = result.totalCents - foundingCustomerDiscountCents;

    const componentCents = (code: string): number =>
      result.components.filter((comp) => comp.code === code).reduce((s, comp) => s + comp.amountCents, 0);
    const extrasFixedCents = result.components
      .filter((comp) => comp.code.startsWith("extra."))
      .reduce((s, comp) => s + comp.amountCents, 0);
    // Core service price: the labor subtotal on the standard path; the matrix
    // base + condition/dirtiness + size guardrail on the matrix paths.
    const laborCents =
      componentCents("labor.subtotal") ||
      componentCents("service.base") +
        componentCents("service.condition") +
        componentCents("service.dirtiness") +
        componentCents("service.size_guardrail");

    const lineItems = [
      ...result.components
        .filter((comp) => comp.amountCents !== 0)
        .map((comp) => ({ label: comp.label, cents: comp.amountCents })),
      ...(foundingCustomerDiscountCents > 0
        ? [{ label: "Founding Member discount", cents: -foundingCustomerDiscountCents }]
        : []),
    ];

    return {
      engine: "v2",
      quoteId,
      versionId: version.id,
      expiresAt,
      result,
      baseTotalPrice: result.totalCents,
      basePrice: laborCents,
      addonsTotal: extrasFixedCents,
      feeCents: componentCents("service.fixed") + componentCents("policy.minimum") + componentCents("policy.rounding"),
      taxCents: result.taxCents,
      cleanerPayout: result.cleanerPayoutCents,
      levelSurchargeCents: 0,
      emergencySurchargeCents: componentCents("adjustment.emergency"),
      isEmergency: opts.emergency,
      zipPricingAdjustmentCents: componentCents("adjustment.zip"),
      totalPrice,
      foundingCustomerDiscountCents,
      lineItems,
    };
  } catch (err) {
    if (err instanceof QuoteInputError) {
      // Genuinely invalid input (bad extra combination etc.) — surface it.
      throw err;
    }
    logger.error("v2 pricing failed; falling back to legacy engine", err, {});
    return null;
  }
}
