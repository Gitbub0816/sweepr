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
 * Admin editor for the room-condition home-cleaning config and the short-term
 * rental turnaround config. Mounted at /admin-pricing-config (admin only).
 *
 * These configs are the single source of truth for the new pricing engines
 * (packages/utils/roomPricing). Stored as JSON in site_settings.
 */
import { Hono } from "hono";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import {
  loadHomeCleaningConfig,
  saveHomeCleaningConfig,
  loadStrConfig,
  saveStrConfig,
} from "../lib/pricingConfig";
import {
  DEFAULT_HOME_CLEANING_CONFIG,
  DEFAULT_STR_PRICING_CONFIG,
  calculateHomeCleaningPrice,
  type HomeCleaningPricingConfig,
  type ShortTermRentalPricingConfig,
} from "@sweepr/utils";
import type { AppBindings } from "../types";

export const adminPricingConfigRouter = new Hono<AppBindings>();
adminPricingConfigRouter.use("*", requireAuth, requireAdmin);

adminPricingConfigRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const [home, str] = await Promise.all([loadHomeCleaningConfig(sql), loadStrConfig(sql)]);
  return c.json({
    home,
    str,
    defaults: { home: DEFAULT_HOME_CLEANING_CONFIG, str: DEFAULT_STR_PRICING_CONFIG },
  });
});

adminPricingConfigRouter.put("/home", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = (await c.req.json()) as HomeCleaningPricingConfig;
  // Merge over defaults so a partial payload can't drop required fields.
  const cfg: HomeCleaningPricingConfig = { ...DEFAULT_HOME_CLEANING_CONFIG, ...body };
  await saveHomeCleaningConfig(sql, cfg);
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "pricing_config",
    targetId: "home_cleaning_pricing_config",
    metadata: { event: "home_cleaning_pricing_updated" },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true, home: cfg });
});

adminPricingConfigRouter.put("/str", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = (await c.req.json()) as ShortTermRentalPricingConfig;
  const cfg: ShortTermRentalPricingConfig = { ...DEFAULT_STR_PRICING_CONFIG, ...body };
  await saveStrConfig(sql, cfg);
  await audit(sql, {
    action: "admin.action",
    actorClerkId: c.get("user").clerkId,
    targetType: "pricing_config",
    targetId: "str_pricing_config",
    metadata: { event: "str_pricing_updated" },
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true, str: cfg });
});

/** Preview the customer-visible total for a sample home with the given config. */
adminPricingConfigRouter.post("/simulate", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = (await c.req.json()) as {
    config?: HomeCleaningPricingConfig;
    property?: { homeType: string; sqft: number; bedrooms: number; bathrooms: number };
    rooms?: { roomType: string; level: string }[];
    addOnKeys?: string[];
  };
  const cfg = body.config ?? (await loadHomeCleaningConfig(sql));
  const result = calculateHomeCleaningPrice(
    {
      property: {
        homeType: (body.property?.homeType ?? "house") as never,
        sqft: body.property?.sqft ?? 1200,
        bedrooms: body.property?.bedrooms ?? 2,
        bathrooms: body.property?.bathrooms ?? 2,
      },
      rooms: (body.rooms ?? []) as never,
      addOnKeys: body.addOnKeys ?? [],
    },
    cfg,
  );
  return c.json(result);
});
