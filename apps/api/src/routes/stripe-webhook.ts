import { Hono } from "hono";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import type { AppBindings } from "../types";

export const stripeWebhookRouter = new Hono<AppBindings>();

stripeWebhookRouter.post("/", async (c) => {
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing signature" }, 400);

  const payload = await c.req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return c.json({ error: `Webhook signature failed: ${String(err)}` }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      if (bookingId) {
        await sql`
          UPDATE bookings
          SET status = 'booked', stripe_payment_intent_id = ${intent.id},
              updated_at = NOW()
          WHERE id = ${bookingId}
        `;
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      if (bookingId) {
        await sql`
          UPDATE bookings SET status = 'payment_pending', updated_at = NOW()
          WHERE id = ${bookingId}
        `;
      }
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});
