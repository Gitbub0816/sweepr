import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { calculateQuote } from "@sweepr/utils";
import type { AppBindings } from "../types";

const quoteSchema = z.object({
  serviceType: z.enum(["standard", "deep", "move_in_out", "recurring"]),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  sqft: z.number().int().min(0).max(50000),
  homeType: z
    .enum(["apartment", "house", "condo", "townhouse", "studio"])
    .default("house"),
  pets: z.boolean().default(false),
  addOnKeys: z.array(z.string()).default([]),
});

export const pricingRouter = new Hono<AppBindings>();

pricingRouter.post("/quote", zValidator("json", quoteSchema), (c) => {
  const input = c.req.valid("json");
  const quote = calculateQuote({
    serviceType: input.serviceType,
    home: {
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      sqft: input.sqft,
      homeType: input.homeType,
      pets: input.pets,
    },
    addOnKeys: input.addOnKeys,
  });

  return c.json({
    basePrice: quote.basePrice,
    addOnsTotal: quote.addOnTotal,
    subtotal: quote.subtotal,
    serviceFee: quote.serviceFee,
    tax: quote.tax,
    total: quote.total,
    lineItems: quote.lineItems,
  });
});
