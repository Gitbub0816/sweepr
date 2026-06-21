import { Hono } from "hono";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import { audit } from "../lib/audit";
import type { AppBindings } from "../types";

export const stripeWebhookRouter = new Hono<AppBindings>();

stripeWebhookRouter.post("/", async (c) => {
  const stripe = getStripe(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing signature" }, 400);

  // Read the raw body BEFORE any parsing — signature verification requires it.
  const payload = await c.req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // Log failures with IP + timestamp for monitoring; never echo details back.
    logger.warn("Stripe webhook signature verification failed", {
      ip: c.req.header("CF-Connecting-IP") ?? "unknown",
      ts: new Date().toISOString(),
    });
    return c.json({ error: "Webhook signature verification failed" }, 400);
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
        await audit(sql, {
          action: "payment.captured",
          actorClerkId: intent.metadata?.clerkId ?? "system:stripe",
          targetType: "booking",
          targetId: bookingId,
          metadata: { intentId: intent.id, amount: intent.amount },
          timestamp: new Date().toISOString(),
        });
      }
      // Send confirmation email to the receipt address, if Stripe captured one.
      const email = intent.receipt_email ?? undefined;
      if (email) {
        try {
          await sendEmail(c.env.MAILERSEND_API_KEY, {
            to: email,
            subject: "Your Sweepr booking is confirmed",
            html: `<p>Your payment was received and your clean is booked. We'll match you with a top-rated cleaner shortly.</p>`,
          });
        } catch {
          // Non-fatal.
        }
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
      const email = intent.receipt_email ?? undefined;
      if (email) {
        try {
          await sendEmail(c.env.MAILERSEND_API_KEY, {
            to: email,
            subject: "Payment failed — action needed",
            html: `<p>We couldn't process your payment. Please update your payment method to confirm your booking.</p>`,
          });
        } catch {
          // Non-fatal.
        }
      }
      break;
    }
    case "account.updated": {
      // Stripe Connect — touch the cleaner row so payout-readiness changes are
      // reflected. Detailed capability flags are read on demand via the status
      // endpoint; here we just mark the record as seen.
      const account = event.data.object;
      await sql`
        UPDATE cleaners SET updated_at = NOW()
        WHERE stripe_connect_id = ${account.id}
      `;
      break;
    }
    case "transfer.created": {
      const transfer = event.data.object;
      const bookingId = transfer.transfer_group?.replace("booking_", "");
      if (bookingId) {
        await sql`
          UPDATE payouts
          SET status = 'paid', stripe_transfer_id = ${transfer.id}, paid_at = NOW()
          WHERE booking_id = ${bookingId}
        `;
      }
      break;
    }
    case "charge.dispute.created": {
      const dispute = event.data.object;
      const paymentIntent =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      const bookings = paymentIntent
        ? ((await sql`
            SELECT id FROM bookings
            WHERE stripe_payment_intent_id = ${paymentIntent} LIMIT 1
          `) as Array<{ id: string }>)
        : [];
      const bookingId = bookings[0]?.id ?? null;
      await sql`
        INSERT INTO disputes (booking_id, reason, description, status)
        VALUES (${bookingId}, ${dispute.reason ?? "stripe_dispute"},
                ${"Stripe dispute " + dispute.id}, 'open')
      `;
      if (bookingId) {
        await sql`
          UPDATE bookings SET status = 'disputed', updated_at = NOW()
          WHERE id = ${bookingId}
        `;
      }
      await audit(sql, {
        action: "dispute.opened",
        actorClerkId: "system:stripe",
        targetType: "booking",
        targetId: bookingId ?? "unknown",
        metadata: { stripeDisputeId: dispute.id, reason: dispute.reason ?? null },
        timestamp: new Date().toISOString(),
      });
      // Notify admin.
      try {
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: "support@sweep-r.com",
          subject: "New Stripe dispute opened",
          html: `<p>A dispute (${dispute.id}) was opened${
            bookingId ? ` for booking ${bookingId}` : ""
          }. Review it in the admin console.</p>`,
        });
      } catch {
        // Non-fatal.
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
      if (paymentIntent) {
        await sql`
          UPDATE payments SET status = 'refunded'
          WHERE stripe_payment_intent_id = ${paymentIntent}
        `;
      }
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});
