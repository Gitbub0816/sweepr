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
import { quoteAndPersist } from "./service";
import type { ClutterLevel, ConditionLevel, QuoteInputV2, QuoteResultV2, RoomTypeV2 } from "@sweepr/quote-engine";
import { ROOM_TYPES_V2 } from "@sweepr/quote-engine";

const LEVEL_MAP: Record<string, ConditionLevel> = {
  level_1: 1,
  level_2: 2,
  level_3: 3,
  level_4: 4,
};

export interface BookingWireInput {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  addOnKeys: string[];
  rooms?: Array<{ roomType: RoomTypeV2; level: string }>;
  clutter?: Partial<Record<RoomTypeV2, number>>;
  roomCountsByLevel?: Partial<Record<RoomTypeV2, number[]>>;
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
 *  room engine's counting: bathrooms ceil'd, one kitchen, one living area). */
export function buildQuoteInputFromBooking(
  input: BookingWireInput,
  opts: { emergency: boolean; zipMultiplierPct: number },
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
  return {
    serviceArea: "default",
    currency: "USD",
    counts: {
      kitchen: 1,
      bathroom: Math.max(1, Math.ceil(input.bathrooms)),
      bedroom: Math.max(1, input.bedrooms),
      living_room: 1,
    },
    conditions,
    countsByLevel: Object.keys(countsByLevel).length > 0 ? countsByLevel : undefined,
    clutter,
    sqft: input.sqft,
    extras: input.addOnKeys.map((key) => ({ key, quantity: 1 })),
    emergency: opts.emergency,
    zipMultiplierPct: opts.zipMultiplierPct,
  };
}

/**
 * Price a booking through v2 when active. Returns null when v2 is dark, the
 * client sent no room selections (legacy client), or the v2 path failed —
 * the caller then continues down the existing engine chain, so a v2 problem
 * can never block a booking.
 */
export async function assembleV2Pricing(
  sql: Sql,
  input: BookingWireInput,
  opts: {
    customerId: string | null;
    emergency: boolean;
    zipMultiplierPct: number;
  },
): Promise<V2Assembly | null> {
  if (!input.rooms || input.rooms.length === 0) return null;
  try {
    const quoted = await quoteAndPersist(
      sql,
      buildQuoteInputFromBooking(input, {
        emergency: opts.emergency,
        zipMultiplierPct: opts.zipMultiplierPct,
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
    const laborCents = componentCents("labor.subtotal");

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
