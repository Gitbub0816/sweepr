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
 * Server-side booking price calculator.
 * Clients must NEVER submit price fields — the server always calculates.
 */

import { ADD_ONS, getAddOn } from "@sweepr/utils";

export interface BookingPriceInput {
  serviceType:
    | "light"
    | "standard"
    | "deep"
    | "move_in_out"
    | "recurring"
    | "post_construction"
    | "vacation_rental";
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  homeType: string;
  hasPets: boolean;
  heavyMess: boolean;
  suppliesNeeded: boolean;
  addOnKeys: string[];
}

export interface BookingPriceBreakdown {
  basePrice: number;      // cents
  bedroomFee: number;
  bathroomFee: number;
  sqftFee: number;
  petFee: number;
  heavyMessFee: number;
  suppliesFee: number;
  addonsTotal: number;
  subtotal: number;
  serviceFee: number;     // platform service fee to customer
  tax: number;
  totalPrice: number;
}

const BASE: Record<string, number> = {
  light:             7900,
  standard:          9900,
  deep:             14900,
  move_in_out:      19900,
  recurring:         8900,
  post_construction:28900,
  vacation_rental:  10900,
};

/**
 * Add-on price in cents for a client-emitted add-on key. The canonical add-on
 * catalogue lives in `packages/utils` (ADD_ONS, prices in dollars) and is the
 * single source of truth the customer store selects from — so we resolve
 * against it here rather than a duplicate server-side map that historically
 * drifted (window_interior vs interior_windows, garage vs garage_sweep, …) and
 * silently priced mismatched keys at $0. An unknown key is a hard error so the
 * route surfaces a 400 instead of undercharging.
 */
function addOnPriceCents(key: string): number {
  const addOn = getAddOn(key);
  if (!addOn) throw new UnknownAddOnError(key);
  return Math.round(addOn.price * 100);
}

/** Thrown when an add-on key isn't in the canonical `@sweepr/utils` catalogue. */
export class UnknownAddOnError extends Error {
  constructor(public readonly key: string) {
    super(`unknown_addon:${key}`);
    this.name = "UnknownAddOnError";
  }
}

export function calculateBookingPrice(
  input: BookingPriceInput
): BookingPriceBreakdown {
  const basePrice = BASE[input.serviceType] ?? 9900;

  const bedroomFee  = input.bedrooms  * 1000;
  const bathroomFee = input.bathrooms * 1500;
  const sqftFee     = Math.max(0, input.sqft - 1000) * 8;
  const petFee      = input.hasPets        ? 1500 : 0;
  const heavyMessFee = input.heavyMess     ? 3000 : 0;
  const suppliesFee = input.suppliesNeeded ? 1000 : 0;

  const addonsTotal = input.addOnKeys.reduce(
    (sum, key) => sum + addOnPriceCents(key),
    0
  );

  const subtotal = basePrice + bedroomFee + bathroomFee + sqftFee +
    petFee + heavyMessFee + suppliesFee + addonsTotal;

  const serviceFee = Math.round(subtotal * 0.08);
  const tax = 0; // Tax calculation requires address, extend when service areas go live
  const totalPrice = subtotal + serviceFee + tax;

  return {
    basePrice,
    bedroomFee,
    bathroomFee,
    sqftFee,
    petFee,
    heavyMessFee,
    suppliesFee,
    addonsTotal,
    subtotal,
    serviceFee,
    tax,
    totalPrice,
  };
}

/**
 * Returns the add-on price catalogue for the frontend quote UI, derived from
 * the canonical `@sweepr/utils` ADD_ONS list so server and client can never
 * disagree on which keys exist or what they cost.
 */
export function getAddOnCatalogue(): Record<string, { label: string; priceCents: number }> {
  const out: Record<string, { label: string; priceCents: number }> = {};
  for (const a of ADD_ONS) {
    out[a.key] = { label: a.name, priceCents: Math.round(a.price * 100) };
  }
  return out;
}
