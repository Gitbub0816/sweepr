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
 * Sweepr+ Stripe plan resolution. Price IDs are not secret, so they live here
 * as deploy defaults but can be overridden per-environment via env bindings
 * (SWEEPR_PLUS_MONTHLY_PRICE_ID / SWEEPR_PLUS_ANNUAL_PRICE_ID) — e.g. to point a
 * staging worker at test-mode prices.
 */
import type { AppBindings } from "../types";

// Live-mode prices created under product prod_Us3hDkb5z8LUoz (ClearKey Connect).
const DEFAULT_MONTHLY_PRICE_ID = "price_1TsJaHCssmqib76ctBTpe0V0";
const DEFAULT_ANNUAL_PRICE_ID = "price_1TsJaXCssmqib76c59CSjCa7";

export type PlusInterval = "month" | "year";

export function resolvePlusPriceId(env: AppBindings["Bindings"], interval: PlusInterval): string {
  if (interval === "month") return env.SWEEPR_PLUS_MONTHLY_PRICE_ID || DEFAULT_MONTHLY_PRICE_ID;
  return env.SWEEPR_PLUS_ANNUAL_PRICE_ID || DEFAULT_ANNUAL_PRICE_ID;
}
