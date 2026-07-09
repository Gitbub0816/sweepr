/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { recurringDisplayPrice, getAddOn } from "@sweepr/utils";
import { getDb } from "../lib/db";
import { calculateBookingPrice, UnknownAddOnError } from "../lib/pricingEngine";
import { resolveBookingPricing } from "../lib/resolvePricing";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";

const quoteSchema = z.object({
  serviceType: z.enum([
    "light",
    "standard",
    "deep",
    "move_in_out",
    "recurring",
    "post_construction",
    "vacation_rental",
  ]),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  sqft: z.number().int().min(0).max(50000),
  homeType: z
    .enum(["studio", "apartment", "house", "condo", "townhouse", "large_house"])
    .default("house"),
  hasPets: z.boolean().default(false),
  heavyMess: z.boolean().default(false),
  suppliesNeeded: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
  addOnKeys: z.array(z.string()).default([]),
});

export const pricingRouter = new Hono<AppBindings>();

/**
 * Public quote endpoint. Repointed off the orphaned `calculatePrice` engine
 * (which always emitted subscription tiers and diverged from what bookings
 * actually charge) onto the authoritative resolveBookingPricing path, with the
 * legacy cents calculator as the fallback — the same precedence POST
 * /bookings/quote uses. `calculatePrice` remains in use by subscriptions.ts and
 * is intentionally left untouched. The customer only ever sees the display
 * price (dollars); internal audit fields are never returned.
 */
pricingRouter.post("/quote", zValidator("json", quoteSchema), async (c) => {
  const input = c.req.valid("json");
  const sql = getDb(c.env.DATABASE_URL);

  const unknown = input.addOnKeys.filter((k) => !getAddOn(k));
  if (unknown.length > 0) {
    return c.json({ error: "unknown_addon", message: `Unknown add-ons: ${unknown.join(", ")}` }, 400);
  }

  let totalCents: number;
  try {
    let resolved = null;
    try {
      resolved = await resolveBookingPricing(sql, input);
    } catch (err) {
      logger.error("resolveBookingPricing failed", err, {});
    }
    totalCents = resolved
      ? resolved.breakdown.customer_total_cents
      : calculateBookingPrice(input).totalPrice;
  } catch (err) {
    if (err instanceof UnknownAddOnError) {
      return c.json({ error: "unknown_addon", message: err.message }, 400);
    }
    throw err;
  }

  const displayPrice = Math.round(totalCents) / 100;
  return c.json({
    displayPrice,
    isEmergency: input.isEmergency,
    subscriptionPrice: {
      weekly: recurringDisplayPrice(displayPrice, "weekly"),
      biweekly: recurringDisplayPrice(displayPrice, "biweekly"),
      monthly: recurringDisplayPrice(displayPrice, "monthly"),
    },
  });
});
