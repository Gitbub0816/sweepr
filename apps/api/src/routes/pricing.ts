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
import { recurringDisplayPrice, getAddOn, ADD_ONS } from "@sweepr/utils";
import { getDb } from "../lib/db";
import { calculateBookingPrice, UnknownAddOnError } from "../lib/pricingEngine";
import { resolveBookingPricing } from "../lib/resolvePricing";
import { loadActivePricingVersion } from "../lib/quoteEngine/service";
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
/**
 * Public add-on catalogue for the booking wizard. When a Pricing v2 version is
 * Active, the offered add-ons come from THAT version's active extras (so a
 * published version can introduce brand-new add-ons with no code change);
 * names reuse the static ADD_ONS presentation where a key matches, else the
 * extra's own label. When no v2 version is Active, the static ADD_ONS list is
 * returned unchanged (legacy behavior). Only key + display name are exposed —
 * per-add-on prices are never shown to customers (final total is server-side).
 */
pricingRouter.get("/addons", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  try {
    const active = await loadActivePricingVersion(sql, "default", "USD");
    if (active) {
      const addOns = active.config.extras
        .filter((e) => e.active)
        .map((e) => ({ key: e.key, name: getAddOn(e.key)?.name ?? e.label }));
      return c.json({ addOns, source: "v2" as const });
    }
  } catch (err) {
    // Fall back to the static catalogue on any lookup failure — the wizard must
    // always render something.
    logger.warn("GET /pricing/addons: active version lookup failed, using static catalogue", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return c.json({
    addOns: ADD_ONS.map((a) => ({ key: a.key, name: a.name })),
    source: "legacy" as const,
  });
});

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
