import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getCustomerByUserId, getUserByClerkId } from "@sweepr/db";
import { calculatePrice, recurringDisplayPrice } from "@sweepr/utils";
import { getDb } from "../lib/db";
import { getStripe } from "../lib/stripe";
import { initiateAssignment } from "../lib/assignment";
import {
  nextOccurrenceDate,
  stripeRecurringInterval,
} from "../lib/subscriptions";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import type { AppBindings } from "../types";
import type { BookingRow } from "@sweepr/db";
import type { Context } from "hono";

export const subscriptionsRouter = new Hono<AppBindings>();

subscriptionsRouter.use("*", requireAuth);

async function currentCustomer(c: Context<AppBindings>) {
  const sql = getDb(c.env.DATABASE_URL);
  const user = await getUserByClerkId(sql, c.get("user").clerkId);
  if (!user) return { sql, user: null, customer: null };
  const customer = await getCustomerByUserId(sql, user.id);
  return { sql, user, customer };
}

const createSchema = z.object({
  serviceType: z.enum([
    "standard",
    "deep",
    "move_in_out",
    "recurring",
    "post_construction",
    "vacation_rental",
  ]),
  cadence: z.enum(["weekly", "biweekly", "monthly"]),
  homeType: z.enum(["apartment", "house", "condo", "townhouse", "studio"]),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(0).max(20),
  sqft: z.number().int().min(100).max(20000),
  hasPets: z.boolean().default(false),
  heavyMess: z.boolean().default(false),
  suppliesNeeded: z.boolean().default(false),
  addOnKeys: z.array(z.string().max(50)).max(20).default([]),
  addressId: z.string().uuid().optional(),
  preferredDayOfWeek: z.number().int().min(0).max(6).optional(),
  preferredTimeOfDay: z.enum(["morning", "afternoon", "evening"]).optional(),
  preferredCleanerId: z.string().uuid().optional(),
  paymentMethodId: z.string().optional(),
});

subscriptionsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const input = c.req.valid("json");
  const { sql, customer } = await currentCustomer(c);
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  // 1. Calculate pricing.
  const pricing = calculatePrice({
    serviceType: input.serviceType,
    homeType: input.homeType,
    sqft: input.sqft,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    addOnKeys: input.addOnKeys,
    heavyMess: input.heavyMess,
    hasPets: input.hasPets,
    suppliesNeeded: input.suppliesNeeded,
  });
  const recurringDollars = recurringDisplayPrice(
    pricing.displayPrice,
    input.cadence
  );
  const displayCents = Math.round(recurringDollars * 100);
  const internalCents = Math.round(pricing.internalPrice * 100);

  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  let stripeSubscriptionId: string | null = null;
  let stripePriceId: string | null = null;

  // 2-4. Stripe Product/Price/Subscription (best-effort — requires customer id).
  if (customer.stripe_customer_id) {
    try {
      const product = await stripe.products.create({
        name: `Sweepr ${input.serviceType} (${input.cadence})`,
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: displayCents,
        recurring: stripeRecurringInterval(input.cadence),
      });
      stripePriceId = price.id;

      if (input.paymentMethodId) {
        await stripe.paymentMethods.attach(input.paymentMethodId, {
          customer: customer.stripe_customer_id,
        });
        await stripe.customers.update(customer.stripe_customer_id, {
          invoice_settings: {
            default_payment_method: input.paymentMethodId,
          },
        });
      }

      const sub = await stripe.subscriptions.create({
        customer: customer.stripe_customer_id,
        items: [{ price: price.id }],
        metadata: { customerId: customer.id, serviceType: input.serviceType },
      });
      stripeSubscriptionId = sub.id;
    } catch (err) {
      logger.error("stripe subscription create failed", err);
    }
  }

  // 5. Persist subscription.
  const homeDetails = {
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    sqft: input.sqft,
    homeType: input.homeType,
    pets: input.hasPets,
  };
  const rows = (await sql`
    INSERT INTO subscriptions (
      customer_id, service_type, cadence, preferred_day_of_week,
      preferred_time_of_day, address_id, display_price, internal_price,
      stripe_subscription_id, stripe_price_id, status, home_details,
      add_on_keys, pricing_inputs, preferred_cleaner_id
    ) VALUES (
      ${customer.id}, ${input.serviceType}, ${input.cadence},
      ${input.preferredDayOfWeek ?? null}, ${input.preferredTimeOfDay ?? null},
      ${input.addressId ?? null}, ${displayCents}, ${internalCents},
      ${stripeSubscriptionId}, ${stripePriceId}, 'active',
      ${JSON.stringify(homeDetails)}::jsonb, ${input.addOnKeys},
      ${JSON.stringify(pricing.dbRecord.pricing_inputs)}::jsonb,
      ${input.preferredCleanerId ?? null}
    ) RETURNING *
  `) as Array<{ id: string }>;
  const subscription = rows[0];
  if (!subscription) return c.json({ error: "Failed to create subscription" }, 500);

  // 6. Generate first booking immediately.
  const scheduledFor = nextOccurrenceDate(
    input.cadence,
    input.preferredDayOfWeek ?? null
  );
  const bookingRows = (await sql`
    INSERT INTO bookings (
      customer_id, address_id, status, service_type, bedrooms, bathrooms,
      sqft, home_type, has_pets, scheduled_at, base_price, total_price
    ) VALUES (
      ${customer.id}, ${input.addressId ?? null}, 'booked', ${input.serviceType},
      ${input.bedrooms}, ${input.bathrooms}, ${input.sqft}, ${input.homeType},
      ${input.hasPets}, ${scheduledFor.toISOString()},
      ${displayCents}, ${displayCents}
    ) RETURNING *
  `) as BookingRow[];
  const booking = bookingRows[0];
  if (booking) {
    await sql`
      INSERT INTO subscription_bookings (subscription_id, booking_id, scheduled_for, status)
      VALUES (${subscription.id}, ${booking.id}, ${scheduledFor
        .toISOString()
        .slice(0, 10)}, 'booked')
    `;
    // 7. Run assignment for the first booking.
    try {
      await initiateAssignment(sql, booking.id);
    } catch (err) {
      logger.error("subscription first-booking assignment failed", err);
    }
  }

  return c.json(
    {
      subscription,
      displayPrice: recurringDollars,
      firstBookingId: booking?.id ?? null,
    },
    201
  );
});

subscriptionsRouter.get("/", async (c) => {
  const { sql, customer } = await currentCustomer(c);
  if (!customer) return c.json({ subscriptions: [] });
  const subs = await sql`
    SELECT s.*,
      (SELECT MIN(scheduled_for) FROM subscription_bookings sb
        WHERE sb.subscription_id = s.id AND sb.scheduled_for >= CURRENT_DATE
          AND sb.status IN ('pending', 'booked')) AS next_cleaning_date
    FROM subscriptions s
    WHERE s.customer_id = ${customer.id} AND s.status != 'cancelled'
    ORDER BY s.created_at DESC
  `;
  return c.json({ subscriptions: subs });
});

/** Resolve a subscription owned by the current customer. */
async function ownedSubscription(c: Context<AppBindings>, id: string) {
  const { sql, customer } = await currentCustomer(c);
  if (!customer) return { sql, customer: null, sub: null };
  const rows = (await sql`
    SELECT * FROM subscriptions WHERE id = ${id} AND customer_id = ${customer.id}
    LIMIT 1
  `) as Array<{ id: string; stripe_subscription_id: string | null }>;
  return { sql, customer, sub: rows[0] ?? null };
}

subscriptionsRouter.patch("/:id/pause", async (c) => {
  const { sql, sub } = await ownedSubscription(c, c.req.param("id"));
  if (!sub) return c.json({ error: "Not found" }, 404);
  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: { behavior: "void" },
      });
    } catch (err) {
      logger.error("stripe pause failed", err);
    }
  }
  await sql`UPDATE subscriptions SET status = 'paused', updated_at = NOW() WHERE id = ${sub.id}`;
  return c.json({ ok: true, status: "paused" });
});

subscriptionsRouter.patch("/:id/resume", async (c) => {
  const { sql, sub } = await ownedSubscription(c, c.req.param("id"));
  if (!sub) return c.json({ error: "Not found" }, 404);
  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: null,
      });
    } catch (err) {
      logger.error("stripe resume failed", err);
    }
  }
  await sql`UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = ${sub.id}`;
  return c.json({ ok: true, status: "active" });
});

subscriptionsRouter.delete("/:id", async (c) => {
  const { sql, sub } = await ownedSubscription(c, c.req.param("id"));
  if (!sub) return c.json({ error: "Not found" }, 404);
  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (err) {
      logger.error("stripe cancel failed", err);
    }
  }
  await sql`UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ${sub.id}`;
  return c.json({ ok: true, status: "cancelled" });
});

subscriptionsRouter.patch("/:id/skip-next", async (c) => {
  const { sql, sub } = await ownedSubscription(c, c.req.param("id"));
  if (!sub) return c.json({ error: "Not found" }, 404);
  const rows = (await sql`
    SELECT id FROM subscription_bookings
    WHERE subscription_id = ${sub.id} AND scheduled_for >= CURRENT_DATE
      AND status IN ('pending', 'booked')
    ORDER BY scheduled_for ASC LIMIT 1
  `) as Array<{ id: string }>;
  if (rows[0]) {
    await sql`UPDATE subscription_bookings SET status = 'skipped' WHERE id = ${rows[0].id}`;
  }
  return c.json({ ok: true, skipped: rows[0]?.id ?? null });
});
