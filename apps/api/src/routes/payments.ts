import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getStripe } from "../lib/stripe";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";

const intentSchema = z.object({
  amount: z.number().int().min(50), // cents
  currency: z.string().default("usd"),
  bookingId: z.string().optional(),
});

export const paymentsRouter = new Hono<AppBindings>();

paymentsRouter.post(
  "/create-intent",
  requireAuth,
  zValidator("json", intentSchema),
  async (c) => {
    const { amount, currency, bookingId } = c.req.valid("json");
    const user = c.get("user");
    const stripe = getStripe(c.env.STRIPE_SECRET_KEY);

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        clerkId: user.clerkId,
        bookingId: bookingId ?? "",
      },
    });

    return c.json({ clientSecret: intent.client_secret, id: intent.id });
  }
);
