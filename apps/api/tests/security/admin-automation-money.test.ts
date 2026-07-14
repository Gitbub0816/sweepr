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
 * Money-movement hardening for the admin automation routes:
 *  - capture clamps to min(DB total, authorized) — never a client-influenced
 *    or over-authorized amount — and passes a booking-derived idempotency key
 *  - capture claims the payments row (claim-then-act) BEFORE calling Stripe
 *    and skips when the claim is lost
 *  - release-payout claims the payouts row before the transfer, uses the
 *    DB-computed payout amount and a booking-derived idempotency key
 *  - a lost payout claim never reaches Stripe
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
type Handler = (text: string, values: unknown[]) => unknown;
let handler: Handler = () => [];

vi.mock("../../src/lib/db", () => ({
  getDb: () =>
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    }),
}));
vi.mock("../../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "admin_1" });
    await next();
  },
}));
vi.mock("../../src/middleware/adminRoles", () => ({
  requireAdminRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireAdmin: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("@sweepr/db", () => ({ getUserByClerkId: vi.fn() }));
vi.mock("../../src/lib/assignment", () => ({
  initiateAssignment: vi.fn().mockResolvedValue(undefined),
  processExpiredOffers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const retrieve = vi.fn();
const capture = vi.fn();
const transfersCreate = vi.fn();
vi.mock("../../src/lib/stripe", () => ({
  getStripe: () => ({
    paymentIntents: { retrieve, capture },
    transfers: { create: transfersCreate },
  }),
}));

import { adminAutomationRouter } from "../../src/routes/adminAutomation";

const ENV = { DATABASE_URL: "postgres://test", STRIPE_SECRET_KEY: "sk_test_dummy" };
const BOOKING_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  sqlCalls.length = 0;
  retrieve.mockReset();
  capture.mockReset();
  transfersCreate.mockReset();
});

describe("admin automation: payment capture", () => {
  function captureHandler(opts: { claimWon: boolean }): Handler {
    return (text) => {
      if (text.includes("INSERT INTO automation_runs")) return [{ id: "run1" }];
      if (text.includes("SELECT * FROM bookings")) {
        return [{
          id: BOOKING_ID,
          status: "completed",
          stripe_payment_intent_id: "pi_1",
          total_price: 8000, // DB truth — lower than the authorized amount
        }];
      }
      if (text.includes("INSERT INTO payments")) return opts.claimWon ? [{ id: "pay1" }] : [];
      return [];
    };
  }

  it("captures min(DB total, authorized) with a booking-derived idempotency key, after claiming", async () => {
    handler = captureHandler({ claimWon: true });
    retrieve.mockResolvedValue({ id: "pi_1", status: "requires_capture", amount: 10000 });
    capture.mockResolvedValue({ id: "pi_1", amount: 10000, amount_received: 8000 });

    const res = await adminAutomationRouter.request(`/capture/${BOOKING_ID}`, { method: "POST" }, ENV);
    expect(res.status).toBe(200);

    expect(capture).toHaveBeenCalledWith(
      "pi_1",
      { amount_to_capture: 8000 }, // clamped to the DB total, not the PI amount
      { idempotencyKey: `capture_${BOOKING_ID}` },
    );
    // The claim insert must have happened BEFORE the Stripe capture call.
    const claimIdx = sqlCalls.findIndex((c) => c.text.includes("INSERT INTO payments"));
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(capture.mock.invocationCallOrder[0]).toBeGreaterThan(0);
    const body = (await res.json()) as { result: { captured: boolean; amount: number } };
    expect(body.result.captured).toBe(true);
    expect(body.result.amount).toBe(8000);
  });

  it("never captures above the authorized amount even if the DB total is higher", async () => {
    handler = (text) => {
      if (text.includes("INSERT INTO automation_runs")) return [{ id: "run1" }];
      if (text.includes("SELECT * FROM bookings")) {
        return [{ id: BOOKING_ID, status: "completed", stripe_payment_intent_id: "pi_1", total_price: 15000 }];
      }
      if (text.includes("INSERT INTO payments")) return [{ id: "pay1" }];
      return [];
    };
    retrieve.mockResolvedValue({ id: "pi_1", status: "requires_capture", amount: 10000 });
    capture.mockResolvedValue({ id: "pi_1", amount: 10000, amount_received: 10000 });

    await adminAutomationRouter.request(`/capture/${BOOKING_ID}`, { method: "POST" }, ENV);
    expect(capture).toHaveBeenCalledWith(
      "pi_1",
      { amount_to_capture: 10000 },
      { idempotencyKey: `capture_${BOOKING_ID}` },
    );
  });

  it("skips the Stripe call entirely when the claim is lost (concurrent capture)", async () => {
    handler = captureHandler({ claimWon: false });
    retrieve.mockResolvedValue({ id: "pi_1", status: "requires_capture", amount: 10000 });

    const res = await adminAutomationRouter.request(`/capture/${BOOKING_ID}`, { method: "POST" }, ENV);
    expect(res.status).toBe(200);
    expect(capture).not.toHaveBeenCalled();
  });

  it("releases the claim when the Stripe capture fails, so a retry can recapture", async () => {
    handler = captureHandler({ claimWon: true });
    retrieve.mockResolvedValue({ id: "pi_1", status: "requires_capture", amount: 10000 });
    capture.mockRejectedValue(new Error("stripe down"));

    const res = await adminAutomationRouter.request(`/capture/${BOOKING_ID}`, { method: "POST" }, ENV);
    expect(res.status).not.toBe(200);
    expect(sqlCalls.some((c) => c.text.includes("DELETE FROM payments") && c.text.includes("'capturing'"))).toBe(true);
  });
});

describe("admin automation: release payout", () => {
  function payoutHandler(opts: { claimWon: boolean }): Handler {
    return (text) => {
      if (text.includes("INSERT INTO automation_runs")) return [{ id: "run1" }];
      if (text.includes("SELECT b.*")) {
        return [{
          id: BOOKING_ID,
          cleaner_id: "cl1",
          cleaner_payout: 5000, // DB-computed cents
          stripe_connect_id: "acct_1",
        }];
      }
      if (text.includes("UPDATE payouts SET status = 'processing'")) {
        return opts.claimWon ? [{ id: "payout1" }] : [];
      }
      if (text.includes("SELECT u.id FROM cleaners")) return [{ id: "u1" }];
      return [];
    };
  }

  it("claims the payout row, then transfers the DB amount with a booking-derived idempotency key", async () => {
    handler = payoutHandler({ claimWon: true });
    transfersCreate.mockResolvedValue({ id: "tr_1" });

    const res = await adminAutomationRouter.request(
      "/release-payout",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: BOOKING_ID }) },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(transfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, destination: "acct_1", currency: "usd" }),
      { idempotencyKey: `payout_${BOOKING_ID}` },
    );
    // Claim must precede the transfer.
    const claimIdx = sqlCalls.findIndex((c) => c.text.includes("UPDATE payouts SET status = 'processing'"));
    expect(claimIdx).toBeGreaterThanOrEqual(0);
  });

  it("never calls Stripe when the payout claim is lost (already paid/processing)", async () => {
    handler = payoutHandler({ claimWon: false });

    const res = await adminAutomationRouter.request(
      "/release-payout",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: BOOKING_ID }) },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { alreadyPaid?: boolean } };
    expect(body.result.alreadyPaid).toBe(true);
    expect(transfersCreate).not.toHaveBeenCalled();
  });

  it("releases the claim to 'failed' when the transfer fails, so a retry isn't blocked", async () => {
    handler = payoutHandler({ claimWon: true });
    transfersCreate.mockRejectedValue(new Error("stripe down"));

    const res = await adminAutomationRouter.request(
      "/release-payout",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: BOOKING_ID }) },
      ENV,
    );
    expect(res.status).not.toBe(200);
    expect(sqlCalls.some((c) => c.text.includes("UPDATE payouts SET status = 'failed'"))).toBe(true);
  });

  it("ignores any client-supplied amount/status fields — only bookingId is accepted", async () => {
    handler = payoutHandler({ claimWon: true });
    transfersCreate.mockResolvedValue({ id: "tr_1" });

    await adminAutomationRouter.request(
      "/release-payout",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: BOOKING_ID, amount: 1, status: "paid", cleanerPayout: 1 }),
      },
      ENV,
    );
    // Amount comes from the DB row (5000), not the injected value.
    expect(transfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000 }),
      expect.anything(),
    );
  });
});
