/**
 * Booking price ledger + authorization-update helper.
 *
 * Every dollar change to a booking's authoritative total is recorded on the
 * append-only `booking_price_ledger`. When a change happens after the customer
 * has been charged/authorized, we also try to keep the Stripe PaymentIntent in
 * sync so the eventual capture collects the right amount.
 *
 * Money is always integer cents. Client-supplied amounts are never trusted —
 * callers pass an adjustment and we load the current total from the DB.
 */
import type Stripe from "stripe";
import type { Sql } from "./db";
import { audit } from "./audit";
import { logger } from "./logger";

export type LedgerEventType =
  | "initial_quote"
  | "addon_purchase"
  | "level_surcharge"
  | "additional_attention_fee"
  | "refusal_fee"
  | "admin_adjustment"
  | "tax_adjustment";

export type LedgerSource = "customer" | "cleaner_request" | "admin" | "system";

export interface RecordLedgerEntryInput {
  bookingId: string;
  eventType: LedgerEventType;
  previousTotalCents: number;
  adjustmentCents: number;
  newTotalCents: number;
  reason?: string | null;
  source: LedgerSource;
  approvedBy?: string | null;
  scopeReviewRequestId?: string | null;
  stripePaymentIntentId?: string | null;
}

/** Insert a single append-only row on the booking price ledger. */
export async function recordLedgerEntry(
  sql: Sql,
  input: RecordLedgerEntryInput,
): Promise<string> {
  const rows = (await sql`
    INSERT INTO booking_price_ledger (
      booking_id, event_type, previous_total_cents, adjustment_cents,
      new_total_cents, reason, source, approved_by,
      scope_review_request_id, stripe_payment_intent_id
    ) VALUES (
      ${input.bookingId}, ${input.eventType}, ${input.previousTotalCents},
      ${input.adjustmentCents}, ${input.newTotalCents}, ${input.reason ?? null},
      ${input.source}, ${input.approvedBy ?? null},
      ${input.scopeReviewRequestId ?? null}, ${input.stripePaymentIntentId ?? null}
    ) RETURNING id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

export interface ApplyPriceAdjustmentInput {
  bookingId: string;
  adjustmentCents: number; // signed: positive = increase, negative = decrease
  eventType: LedgerEventType;
  reason?: string | null;
  source: LedgerSource;
  approvedBy?: string | null;
  scopeReviewRequestId?: string | null;
}

export interface ApplyPriceAdjustmentResult {
  previousTotal: number;
  newTotal: number;
  ledgerId: string;
  paymentIntentSynced: boolean;
}

/**
 * Atomically apply a price adjustment to a booking, keeping the Stripe
 * PaymentIntent in sync when possible, and record it on the ledger.
 *
 * Claim-then-act: we read the current total, then do a conditional UPDATE that
 * only succeeds if the total is unchanged (optimistic lock). If a concurrent
 * writer moved the total we reload and retry, so two simultaneous adjustments
 * compose correctly instead of clobbering each other.
 *
 * PaymentIntent sync rules (Stripe):
 *  - requires_payment_method / requires_confirmation: the amount is still
 *    editable, so we call paymentIntents.update({ amount: newTotal }).
 *  - requires_capture (manual-capture auth already placed): Stripe does NOT
 *    allow raising the amount above the originally authorized amount, and you
 *    cannot capture more than was authorized. So for an INCREASE we only record
 *    the ledger entry (the extra is not collected on this PI — collecting it
 *    would require a separate incremental PaymentIntent, which is out of scope
 *    here). For a DECREASE the capture path honors it via
 *    `amount_to_capture: min(newTotal, authorizedAmount)` (see the capture cron
 *    in index.ts), so no live Stripe call is needed now.
 *  - succeeded / already captured / canceled: nothing to sync on the PI.
 */
export async function applyBookingPriceAdjustment(
  sql: Sql,
  stripe: Stripe,
  input: ApplyPriceAdjustmentInput,
): Promise<ApplyPriceAdjustmentResult> {
  let previousTotal = 0;
  let newTotal = 0;
  let paymentIntentId: string | null = null;
  let claimed = false;

  // Optimistic-lock retry loop.
  for (let attempt = 0; attempt < 5 && !claimed; attempt++) {
    const rows = (await sql`
      SELECT total_price, stripe_payment_intent_id
      FROM bookings WHERE id = ${input.bookingId} LIMIT 1
    `) as Array<{ total_price: number | null; stripe_payment_intent_id: string | null }>;
    const booking = rows[0];
    if (!booking) throw new Error(`Booking ${input.bookingId} not found`);

    previousTotal = booking.total_price ?? 0;
    paymentIntentId = booking.stripe_payment_intent_id;
    newTotal = previousTotal + input.adjustmentCents;
    if (newTotal < 0) throw new Error("Adjustment would make booking total negative");

    const updated = (await sql`
      UPDATE bookings
      SET total_price = ${newTotal}, updated_at = NOW()
      WHERE id = ${input.bookingId} AND total_price = ${previousTotal}
      RETURNING id
    `) as Array<{ id: string }>;
    claimed = !!updated[0];
  }
  if (!claimed) {
    throw new Error(`Could not apply price adjustment to booking ${input.bookingId} (contention)`);
  }

  // Best-effort: keep the PaymentIntent amount in sync when it's still editable.
  let paymentIntentSynced = false;
  if (paymentIntentId && input.adjustmentCents !== 0) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (
        pi.status === "requires_payment_method" ||
        pi.status === "requires_confirmation"
      ) {
        await stripe.paymentIntents.update(paymentIntentId, { amount: newTotal });
        paymentIntentSynced = true;
      }
      // requires_capture: intentionally not updated here — see doc comment above.
      // The capture cron collects min(newTotal, authorizedAmount).
    } catch (err) {
      logger.error("applyBookingPriceAdjustment: PI sync failed", err, {
        bookingId: input.bookingId,
        paymentIntentId,
      });
    }
  }

  const ledgerId = await recordLedgerEntry(sql, {
    bookingId: input.bookingId,
    eventType: input.eventType,
    previousTotalCents: previousTotal,
    adjustmentCents: input.adjustmentCents,
    newTotalCents: newTotal,
    reason: input.reason ?? null,
    source: input.source,
    approvedBy: input.approvedBy ?? null,
    scopeReviewRequestId: input.scopeReviewRequestId ?? null,
    stripePaymentIntentId: paymentIntentId,
  });

  await audit(sql, {
    action: "booking.price_adjusted",
    actorClerkId: input.approvedBy ?? `system:${input.source}`,
    targetType: "booking",
    targetId: input.bookingId,
    metadata: {
      eventType: input.eventType,
      previousTotal,
      adjustment: input.adjustmentCents,
      newTotal,
      reason: input.reason ?? null,
      paymentIntentSynced,
      scopeReviewRequestId: input.scopeReviewRequestId ?? null,
    },
    timestamp: new Date().toISOString(),
  });

  return { previousTotal, newTotal, ledgerId, paymentIntentSynced };
}
