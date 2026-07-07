/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type {
  HomeCleaningPriceInput,
  HomeCleaningPriceResult,
  RoomConditionLevel,
  RoomType,
} from "@sweepr/types";

// ---------------------------------------------------------------------------
// Room-condition home-cleaning pricing engine.
//
// Fully config-driven so the admin pricing page is the single source of truth
// (no hardcoded fees leaking into the UI). All money is in integer CENTS.
//
// CRITICAL UX CONTRACT: nothing here is shown to the customer mid-flow. The
// booking flow collects room conditions with zero price feedback; only
// `customerVisible.totalOwed` is surfaced, and only at the final review step.
// ---------------------------------------------------------------------------

export interface SqftTier {
  /** Upper bound (inclusive) of this tier in sqft; null = unbounded top tier. */
  maxSqft: number | null;
  addCents: number;
}

export interface RoomConditionRule {
  /** Extra charge per level (level_1 is baseline, usually 0). */
  levelCents: Record<RoomConditionLevel, number>;
}

export interface RoomConditionConfig {
  /**
   * When true, the level charge applies for every room of that type (using the
   * home's room counts); when false it applies once (worst-room model).
   */
  applyPerRoom: boolean;
  rules: Record<RoomType, RoomConditionRule>;
}

export interface HomeCleaningPricingConfig {
  currency: string;
  baseFeeCents: number;

  sqftIncluded: number;
  sqftTiers: SqftTier[];

  bedroomsIncluded: number;
  perExtraBedroomCents: number;

  bathroomsIncluded: number;
  perExtraBathroomCents: number;

  roomCondition: RoomConditionConfig;

  addOnCents: Record<string, number>;

  taxRate: number; // e.g. 0.0825
  serviceFeeRate: number; // e.g. 0.10
  /** Round the pre-tax total up to a price ending in this digit (charm pricing). */
  roundToEndingDigit: number;
}

const zeroLevels = (
  l2: number,
  l3: number,
  l4: number,
): Record<RoomConditionLevel, number> => ({
  level_1: 0,
  level_2: l2,
  level_3: l3,
  level_4: l4,
});

export const DEFAULT_HOME_CLEANING_CONFIG: HomeCleaningPricingConfig = {
  currency: "USD",
  baseFeeCents: 8900,

  sqftIncluded: 900,
  sqftTiers: [
    { maxSqft: 1200, addCents: 1500 },
    { maxSqft: 1600, addCents: 3000 },
    { maxSqft: 2000, addCents: 5000 },
    { maxSqft: 2600, addCents: 8000 },
    { maxSqft: 3200, addCents: 11000 },
    { maxSqft: null, addCents: 15000 },
  ],

  bedroomsIncluded: 1,
  perExtraBedroomCents: 1800,

  bathroomsIncluded: 1,
  perExtraBathroomCents: 2800,

  roomCondition: {
    applyPerRoom: false,
    rules: {
      kitchen: { levelCents: zeroLevels(1500, 3500, 6000) },
      bathroom: { levelCents: zeroLevels(1200, 3000, 5500) },
      bedroom: { levelCents: zeroLevels(800, 2000, 3800) },
      living_room: { levelCents: zeroLevels(1000, 2400, 4500) },
    },
  },

  addOnCents: {
    inside_fridge: 2900,
    inside_oven: 3400,
    interior_windows: 3900,
    inside_cabinets: 4900,
    laundry: 2400,
    dishes: 2400,
    baseboards: 3900,
    pet_hair_detail: 3900,
  },

  taxRate: 0.0825,
  serviceFeeRate: 0.1,
  roundToEndingDigit: 9,
};

function sqftCharge(sqft: number, cfg: HomeCleaningPricingConfig): number {
  if (sqft <= cfg.sqftIncluded) return 0;
  for (const tier of cfg.sqftTiers) {
    if (tier.maxSqft === null || sqft <= tier.maxSqft) return tier.addCents;
  }
  return cfg.sqftTiers.length ? cfg.sqftTiers[cfg.sqftTiers.length - 1].addCents : 0;
}

/** Count of rooms of a given type, for the per-room condition model. */
function roomCount(roomType: RoomType, input: HomeCleaningPriceInput): number {
  if (roomType === "bedroom") return Math.max(1, input.property.bedrooms);
  if (roomType === "bathroom") return Math.max(1, Math.ceil(input.property.bathrooms));
  return 1; // one kitchen / one living area assumed
}

/** Round a cents amount up so the whole-dollar value ends in `digit`. */
export function roundUpToEndingDigit(cents: number, digit: number): number {
  const dollars = Math.ceil(cents / 100);
  const rem = ((dollars % 10) + 10) % 10;
  const target = rem <= digit ? dollars + (digit - rem) : dollars + (10 - rem + digit);
  return target * 100;
}

export function calculateHomeCleaningPrice(
  input: HomeCleaningPriceInput,
  config: HomeCleaningPricingConfig = DEFAULT_HOME_CLEANING_CONFIG,
): HomeCleaningPriceResult {
  const cfg = config;
  const lineItems: Array<{ label: string; amountCents: number }> = [];

  const baseFeeCents = cfg.baseFeeCents;
  lineItems.push({ label: "Base cleaning", amountCents: baseFeeCents });

  const sqftCents = sqftCharge(input.property.sqft, cfg);
  if (sqftCents > 0) lineItems.push({ label: "Home size", amountCents: sqftCents });

  const extraBedrooms = Math.max(0, input.property.bedrooms - cfg.bedroomsIncluded);
  const bedroomCents = extraBedrooms * cfg.perExtraBedroomCents;
  if (bedroomCents > 0)
    lineItems.push({ label: `Bedrooms (+${extraBedrooms})`, amountCents: bedroomCents });

  const extraBathrooms = Math.max(
    0,
    Math.ceil(input.property.bathrooms) - cfg.bathroomsIncluded,
  );
  const bathroomCents = extraBathrooms * cfg.perExtraBathroomCents;
  if (bathroomCents > 0)
    lineItems.push({ label: `Bathrooms (+${extraBathrooms})`, amountCents: bathroomCents });

  // Per-room condition charges. Deduplicate by room type (last selection wins),
  // matching the "worst room of each type" UX.
  let roomConditionCents = 0;
  const byType = new Map<RoomType, RoomConditionLevel>();
  for (const sel of input.rooms) byType.set(sel.roomType, sel.level);
  for (const [roomType, level] of byType) {
    const rule = cfg.roomCondition.rules[roomType];
    if (!rule) continue;
    const per = rule.levelCents[level] ?? 0;
    if (per === 0) continue;
    const mult = cfg.roomCondition.applyPerRoom ? roomCount(roomType, input) : 1;
    roomConditionCents += per * mult;
  }
  if (roomConditionCents > 0)
    lineItems.push({ label: "Room condition", amountCents: roomConditionCents });

  let addOnsCents = 0;
  for (const key of input.addOnKeys) {
    const c = cfg.addOnCents[key];
    if (c) {
      addOnsCents += c;
      lineItems.push({ label: key.replace(/_/g, " "), amountCents: c });
    }
  }

  const subtotalCents =
    baseFeeCents + sqftCents + bedroomCents + bathroomCents + roomConditionCents + addOnsCents;

  const feeCents = Math.round(subtotalCents * cfg.serviceFeeRate);
  const taxCents = Math.round((subtotalCents + feeCents) * cfg.taxRate);
  const rawTotalCents = subtotalCents + feeCents + taxCents;

  // Charm-round the final, customer-facing total so the single number shown at
  // review ends in the configured digit (9). The delta is absorbed internally.
  const totalCents = roundUpToEndingDigit(rawTotalCents, cfg.roundToEndingDigit);
  const roundingDeltaCents = totalCents - rawTotalCents;

  return {
    customerVisible: {
      totalOwed: Math.round(totalCents) / 100,
      currency: cfg.currency,
    },
    internalBreakdown: {
      baseFeeCents,
      sqftCents,
      bedroomCents,
      bathroomCents,
      roomConditionCents,
      addOnsCents,
      subtotalCents,
      roundingDeltaCents,
      taxCents,
      feeCents,
      totalCents,
      lineItems,
    },
  };
}

// ---------------------------------------------------------------------------
// Short-term rental turnaround pricing.
//
// Never hardcode the per-turnaround fee — it comes from admin config. The
// monthly connection fee ($20 default) is billed separately from turnarounds.
// ---------------------------------------------------------------------------

export interface ShortTermRentalPricingConfig {
  currency: string;
  monthlyConnectionFeeCents: number; // default 2000 ($20/mo), configurable
  perTurnaroundFeeCents: number; // NOT hardcoded — admin-configured
  taxRate: number;
  roundToEndingDigit: number;
}

export const DEFAULT_STR_PRICING_CONFIG: ShortTermRentalPricingConfig = {
  currency: "USD",
  monthlyConnectionFeeCents: 2000,
  perTurnaroundFeeCents: 9900,
  taxRate: 0.0825,
  roundToEndingDigit: 9,
};

export function calculateTurnaroundPrice(
  config: ShortTermRentalPricingConfig = DEFAULT_STR_PRICING_CONFIG,
): { totalOwed: number; currency: string; turnaroundCents: number; taxCents: number } {
  const rounded = roundUpToEndingDigit(config.perTurnaroundFeeCents, config.roundToEndingDigit);
  const taxCents = Math.round(rounded * config.taxRate);
  return {
    totalOwed: (rounded + taxCents) / 100,
    currency: config.currency,
    turnaroundCents: rounded,
    taxCents,
  };
}
