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
 * Regression tests for the payments-fixer pass:
 *  - bookingLedger increment-authorization on post-auth increases
 *  - scope-review refusal refund when the PI was already captured at full total
 */
import { describe, it, expect, vi } from "vitest";
import { applyBookingPriceAdjustment } from "../src/lib/bookingLedger";
import { decideScopeReview } from "../src/lib/scopeReviewEngine";

vi.mock("../src/lib/scopeReviewNotify", () => ({
  notifyCleanerDecision: vi.fn().mockResolvedValue(undefined),
}));

interface Recorded { text: string; values: unknown[] }

/**
 * Build a tagged-template `sql` mock. `handler(text, values)` returns the rows
 * for a query; every call is also pushed onto `calls` for later assertions.
 */
function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  const calls: Recorded[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as import("../src/lib/db").Sql;
  return { sql, calls };
}

function baseHandler(overrides: Partial<Record<string, unknown[]>> = {}) {
  return (text: string): unknown => {
    if (text.includes("SELECT total_price")) {
      return overrides.select ?? [{ total_price: 10000, stripe_payment_intent_id: "pi_1" }];
    }
    if (text.includes("UPDATE bookings")) return [{ id: "b1" }];
    if (text.includes("INSERT INTO booking_price_ledger")) return [{ id: "led1" }];
    return [];
  };
}

describe("applyBookingPriceAdjustment — post-auth increase on requires_capture", () => {
  it("raises the held amount via incrementAuthorization when the card supports it", async () => {
    const { sql } = makeSql(baseHandler());
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ status: "requires_capture", amount: 10000 }),
        update: vi.fn(),
        incrementAuthorization: vi.fn().mockResolvedValue({}),
      },
    } as unknown as import("stripe").default;

    const res = await applyBookingPriceAdjustment(sql, stripe, {
      bookingId: "b1",
      adjustmentCents: 2500,
      eventType: "addon_purchase",
      source: "customer",
    });

    expect(stripe.paymentIntents.incrementAuthorization).toHaveBeenCalledWith("pi_1", { amount: 12500 });
    expect(res.paymentIntentSynced).toBe(true);
    expect(res.newTotal).toBe(12500);
  });

  it("flags the ledger entry as UNCOLLECTED when incrementAuthorization is unsupported", async () => {
    let ledgerReason: unknown;
    const { sql } = makeSql((text, values) => {
      if (text.includes("SELECT total_price")) return [{ total_price: 10000, stripe_payment_intent_id: "pi_1" }];
      if (text.includes("UPDATE bookings")) return [{ id: "b1" }];
      if (text.includes("INSERT INTO booking_price_ledger")) {
        // reason is the 6th positional value in recordLedgerEntry's insert
        ledgerReason = values[5];
        return [{ id: "led1" }];
      }
      return [];
    });
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ status: "requires_capture", amount: 10000 }),
        update: vi.fn(),
        incrementAuthorization: vi.fn().mockRejectedValue(new Error("card_declined_incremental")),
      },
    } as unknown as import("stripe").default;

    const res = await applyBookingPriceAdjustment(sql, stripe, {
      bookingId: "b1",
      adjustmentCents: 2500,
      eventType: "addon_purchase",
      reason: "Extra room",
      source: "customer",
    });

    expect(res.paymentIntentSynced).toBe(false);
    expect(String(ledgerReason)).toContain("UNCOLLECTED");
  });

  it("does not attempt increment on a decrease", async () => {
    const { sql } = makeSql(baseHandler());
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ status: "requires_capture", amount: 10000 }),
        update: vi.fn(),
        incrementAuthorization: vi.fn(),
      },
    } as unknown as import("stripe").default;

    await applyBookingPriceAdjustment(sql, stripe, {
      bookingId: "b1",
      adjustmentCents: -2500,
      eventType: "admin_adjustment",
      source: "admin",
    });

    expect(stripe.paymentIntents.incrementAuthorization).not.toHaveBeenCalled();
  });
});

describe("decideScopeReview — refusal approval when PI already captured at full total", () => {
  it("refunds the customer the amount over the refusal fee", async () => {
    const { sql, calls } = makeSql((text) => {
      if (text.includes("FROM scope_review_requests WHERE id")) {
        return [{
          id: "req1", booking_id: "b1", cleaner_id: "cl1", customer_id: null,
          request_type: "refusal", status: "pending_admin", fee_code: null,
        }];
      }
      if (text.includes("FROM site_settings")) return [];
      if (text.includes("UPDATE scope_review_requests")) return [{ id: "req1" }];
      if (text.includes("FROM bookings b")) {
        return [{
          id: "b1", status: "in_progress", total_price: 50000,
          stripe_payment_intent_id: "pi_1", address_id: null, cleaner_id: "cl1",
          street: null, unit: null, city: null, state: null, zip: null, lat: null, lng: null,
        }];
      }
      if (text.includes("INSERT INTO booking_price_ledger")) return [{ id: "led1" }];
      if (text.includes("FROM bookings WHERE cleaner_id")) return [{ c: 0 }];
      return [];
    });

    const refundCreate = vi.fn().mockResolvedValue({ id: "re_1" });
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ status: "succeeded", amount: 50000, amount_received: 50000 }),
        capture: vi.fn(),
      },
      refunds: { create: refundCreate },
    } as unknown as import("stripe").default;

    const res = await decideScopeReview(sql, stripe, {} as never, {
      requestId: "req1",
      decision: "approve",
      adminId: "admin_1",
    });

    // refusalFee = 20% of $500 = $100 → refund excess $400.
    expect(refundCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = refundCreate.mock.calls[0];
    expect(params.amount).toBe(40000);
    expect(opts.idempotencyKey).toBe("refusal_refund_req1");
    expect(res.feeAmountCents).toBe(10000);

    // Ledger/request rows should record the effective fee, not the full total.
    const ledger = calls.find((c) => c.text.includes("INSERT INTO booking_price_ledger"));
    expect(ledger?.values).toContain(10000);
  });
});
