import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { calculatePrice, recurringDisplayPrice } from "@sweepr/utils";
import type { AppBindings } from "../types";

const quoteSchema = z.object({
  serviceType: z.enum([
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
    .enum(["apartment", "house", "condo", "townhouse", "studio"])
    .default("house"),
  hasPets: z.boolean().default(false),
  heavyMess: z.boolean().default(false),
  suppliesNeeded: z.boolean().default(false),
  isEmergency: z.boolean().default(false),
  addOnKeys: z.array(z.string()).default([]),
});

export const pricingRouter = new Hono<AppBindings>();

pricingRouter.post("/quote", zValidator("json", quoteSchema), (c) => {
  const input = c.req.valid("json");

  const result = calculatePrice({
    serviceType: input.serviceType,
    homeType: input.homeType,
    sqft: input.sqft,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    addOnKeys: input.addOnKeys,
    heavyMess: input.heavyMess,
    hasPets: input.hasPets,
    suppliesNeeded: input.suppliesNeeded,
    isEmergency: input.isEmergency,
  });

  // The customer only ever sees the display price. Internal price, Stripe cost,
  // rounding buffer, and the breakdown are intentionally NOT returned.
  return c.json({
    displayPrice: result.displayPrice,
    isEmergency: input.isEmergency,
    subscriptionPrice: {
      weekly: recurringDisplayPrice(result.displayPrice, "weekly"),
      biweekly: recurringDisplayPrice(result.displayPrice, "biweekly"),
      monthly: recurringDisplayPrice(result.displayPrice, "monthly"),
    },
  });
});
