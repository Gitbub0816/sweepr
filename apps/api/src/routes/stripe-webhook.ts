import { Hono } from "hono";
import { getStripe } from "../lib/stripe";
import { getDb } from "../lib/db";
import { sendEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import { audit } from "../lib/audit";
import { serverTrack } from "../lib/posthog";
import { initiateAssignment } from "../lib/assignment";
import { nextOccurrenceDate } from "../lib/subscriptions";
import { recordPaymentEvent } from "../lib/paymentObservability";
import type { AppBindings } from "../types";
import type { BookingRow } from "@sweepr/db";

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

  // Idempotency: ignore already-processed events.
  const existing = await sql`
    SELECT id FROM stripe_events WHERE stripe_event_id = ${event.id} LIMIT 1
  ` as Array<{ id: string }>;
  if (existing[0]) {
    return c.json({ received: true, duplicate: true });
  }
  await sql`
    INSERT INTO stripe_events (stripe_event_id, event_type, payload)
    VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)})
    ON CONFLICT (stripe_event_id) DO NOTHING
  `;

  await recordPaymentEvent(sql, {
    eventType: "webhook_received",
    providerEventId: event.id,
    success: true,
    metadata: { type: event.type },
  });

  let processingError: Error | null = null;
  try {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const bookingId = intent.metadata?.bookingId;
      await recordPaymentEvent(sql, {
        eventType: "payment_intent_succeeded",
        bookingId: bookingId ?? null,
        amountCents: intent.amount,
        providerEventId: intent.id,
        success: true,
      });
      if (bookingId) {
        await sql`
          UPDATE bookings
          SET status = 'booked', stripe_payment_intent_id = ${intent.id},
              updated_at = NOW()
          WHERE id = ${bookingId}
        `;
        // Create payout_ledger row so automated payout engine can track it.
        await sql`
          INSERT INTO payout_ledger (
            booking_id, gross_amount_cents, platform_fee_cents,
            cleaner_payout_cents, stripe_payment_intent_id, status
          )
          SELECT b.id, b.total_price, 0, 0, ${intent.id}, 'pending'
          FROM bookings b WHERE b.id = ${bookingId}
          ON CONFLICT (booking_id) DO NOTHING
        `;
        await audit(sql, {
          action: "payment.captured",
          actorClerkId: intent.metadata?.clerkId ?? "system:stripe",
          targetType: "booking",
          targetId: bookingId,
          metadata: { intentId: intent.id, amount: intent.amount },
          timestamp: new Date().toISOString(),
        });
        await serverTrack(
          c.env,
          "payment_captured",
          intent.metadata?.clerkId ?? "system:stripe",
          { bookingId, intentId: intent.id, amount: intent.amount }
        );
        // Payment captured -> kick off silent auto-assignment.
        try {
          await initiateAssignment(sql, bookingId);
        } catch (err) {
          logger.error("assignment after payment failed", err, { bookingId });
        }
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
      await recordPaymentEvent(sql, {
        eventType: "payment_intent_failed",
        bookingId: bookingId ?? null,
        amountCents: intent.amount,
        providerEventId: intent.id,
        success: false,
        errorCode: intent.last_payment_error?.code ?? null,
        errorMessage: intent.last_payment_error?.message ?? null,
      });
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
      const account = event.data.object;
      // Sync stripe_connected_accounts with latest capability flags.
      await sql`
        UPDATE stripe_connected_accounts
        SET charges_enabled  = ${account.charges_enabled},
            payouts_enabled  = ${account.payouts_enabled},
            details_submitted = ${account.details_submitted},
            capabilities     = ${JSON.stringify(account.capabilities ?? {})},
            requirements     = ${JSON.stringify(account.requirements ?? {})},
            status = CASE
              WHEN ${account.charges_enabled} AND ${account.payouts_enabled} THEN 'enabled'
              WHEN NOT ${account.details_submitted} THEN 'pending'
              ELSE 'restricted'
            END,
            updated_at = NOW()
        WHERE stripe_account_id = ${account.id}
      `;
      await sql`
        UPDATE cleaners SET updated_at = NOW()
        WHERE stripe_connect_id = ${account.id}
      `;
      break;
    }
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const paymentIntent = typeof dispute.payment_intent === "string"
        ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
      if (paymentIntent) {
        await sql`
          UPDATE payout_ledger SET status = 'eligible', dispute_id = NULL, updated_at = NOW()
          WHERE stripe_payment_intent_id = ${paymentIntent}
            AND status = 'held'
        `;
      }
      break;
    }
    case "transfer.failed" as string: {
      const transfer = (event as unknown as { data: { object: { id: string; transfer_group?: string; destination?: unknown } } }).data.object;
      const bookingId = transfer.transfer_group?.replace("booking_", "");
      await recordPaymentEvent(sql, {
        eventType: "transfer_failed",
        bookingId: bookingId ?? null,
        providerEventId: transfer.id,
        success: false,
        metadata: { destination: transfer.destination },
      });
      if (bookingId) {
        await sql`
          UPDATE payout_ledger SET status = 'failed', failed_at = NOW(),
            failure_message = 'Stripe transfer failed', updated_at = NOW()
          WHERE booking_id = ${bookingId}
        `;
      }
      break;
    }
    case "payout.paid": {
      const payout = event.data.object;
      await recordPaymentEvent(sql, {
        eventType: "payout_paid",
        amountCents: payout.amount,
        providerEventId: payout.id,
        success: true,
      });
      break;
    }
    case "payout.failed": {
      const payout = event.data.object;
      await recordPaymentEvent(sql, {
        eventType: "payout_failed",
        amountCents: payout.amount,
        providerEventId: payout.id,
        success: false,
        errorCode: payout.failure_code ?? null,
        errorMessage: payout.failure_message ?? null,
      });
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
      await serverTrack(c.env, "dispute_opened", "system:stripe", {
        bookingId: bookingId ?? "unknown",
        stripeDisputeId: dispute.id,
        reason: dispute.reason ?? null,
      });
      // Notify admin.
      try {
        await sendEmail(c.env.MAILERSEND_API_KEY, {
          to: "support@getsweepr.com",
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
    case "invoice.payment_succeeded": {
      // A subscription invoice was paid — generate the next booking instance
      // from the subscription and run assignment.
      const invoice = event.data.object as unknown as {
        subscription?: string | null;
      };
      const stripeSubId =
        typeof invoice.subscription === "string" ? invoice.subscription : null;
      if (!stripeSubId) break;

      const subs = (await sql`
        SELECT * FROM subscriptions
        WHERE stripe_subscription_id = ${stripeSubId} AND status = 'active'
        LIMIT 1
      `) as Array<{
        id: string;
        customer_id: string;
        service_type: string;
        address_id: string | null;
        display_price: number;
        internal_price: number;
        cadence: "weekly" | "biweekly" | "monthly";
        preferred_day_of_week: number | null;
        home_details: {
          bedrooms?: number;
          bathrooms?: number;
          sqft?: number;
          homeType?: string;
        } | null;
        add_on_keys: string[] | null;
      }>;
      const sub = subs[0];
      if (!sub) break;

      // Skip if the very next instance was already marked skipped.
      const pending = (await sql`
        SELECT * FROM subscription_bookings
        WHERE subscription_id = ${sub.id} AND status = 'skipped'
          AND scheduled_for >= CURRENT_DATE
        ORDER BY scheduled_for ASC LIMIT 1
      `) as Array<{ id: string }>;
      if (pending[0]) {
        await sql`
          UPDATE subscription_bookings SET status = 'booked' WHERE id = ${pending[0].id}
        `;
        break;
      }

      const scheduledFor = nextOccurrenceDate(
        sub.cadence,
        sub.preferred_day_of_week
      );
      const home = sub.home_details ?? {};
      const bookingRows = (await sql`
        INSERT INTO bookings (
          customer_id, address_id, status, service_type, bedrooms, bathrooms,
          sqft, home_type, scheduled_at, base_price, total_price
        ) VALUES (
          ${sub.customer_id}, ${sub.address_id}, 'booked', ${sub.service_type},
          ${home.bedrooms ?? 1}, ${home.bathrooms ?? 1}, ${home.sqft ?? 800},
          ${home.homeType ?? "apartment"}, ${scheduledFor.toISOString()},
          ${sub.display_price}, ${sub.display_price}
        ) RETURNING *
      `) as BookingRow[];
      const booking = bookingRows[0];
      if (booking) {
        await sql`
          INSERT INTO subscription_bookings (subscription_id, booking_id, scheduled_for, status)
          VALUES (${sub.id}, ${booking.id}, ${scheduledFor
            .toISOString()
            .slice(0, 10)}, 'booked')
        `;
        try {
          await initiateAssignment(sql, booking.id);
        } catch (err) {
          logger.error("subscription assignment failed", err, {
            bookingId: booking.id,
          });
        }
      }
      break;
    }
    default:
      break;
  }
  } catch (err) {
    processingError = err instanceof Error ? err : new Error(String(err));
    logger.error("stripe webhook processing failed", err, { eventId: event.id, type: event.type });
  }

  if (processingError) {
    // Insert to dead-letter queue for admin review and replay.
    try {
      await sql`
        INSERT INTO failed_webhook_events (stripe_event_id, event_type, payload, error_message)
        VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}, ${processingError.message})
        ON CONFLICT DO NOTHING
      `;
      await sql`
        UPDATE stripe_events
        SET retry_count = retry_count + 1,
            last_error = ${processingError.message}
        WHERE stripe_event_id = ${event.id}
      `;
    } catch (dlqErr) {
      logger.error("failed to write to DLQ", dlqErr, { eventId: event.id });
    }
    // Return 200 to prevent Stripe from retrying (DLQ handles retries instead).
    return c.json({ received: true, queued: true });
  }

  // Mark event as processed.
  await sql`
    UPDATE stripe_events SET processed_at = NOW()
    WHERE stripe_event_id = ${event.id}
  `;

  return c.json({ received: true });
});
