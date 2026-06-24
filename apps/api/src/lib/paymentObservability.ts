import type { Sql } from "./db";
import { logger } from "./logger";

export interface PaymentObsInput {
  eventType: string;
  bookingId?: string | null;
  amountCents?: number | null;
  providerEventId?: string | null;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordPaymentEvent(
  sql: Sql,
  input: PaymentObsInput
): Promise<void> {
  try {
    await sql`
      INSERT INTO payment_observability_events (
        event_type, booking_id, amount_cents, provider_event_id,
        success, error_code, error_message, metadata
      ) VALUES (
        ${input.eventType},
        ${input.bookingId ?? null},
        ${input.amountCents ?? null},
        ${input.providerEventId ?? null},
        ${input.success},
        ${input.errorCode ?? null},
        ${input.errorMessage ?? null},
        ${JSON.stringify(input.metadata ?? {})}
      )
    `;
  } catch (err) {
    // Never let observability writes break the request path.
    logger.error("paymentObservability write failed", err);
  }
}
