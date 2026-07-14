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
 * Stripe webhook signature verification — exercises the REAL route with real
 * HMAC-SHA256 signatures (Stripe v1 scheme: HMAC over `${timestamp}.${payload}`):
 *  - missing signature header is rejected (400) with no state change
 *  - an invalid/forged signature is rejected
 *  - a correctly signed but STALE payload (timestamp outside tolerance) is
 *    rejected — blocks replay of captured deliveries
 *  - a payload tampered with after signing is rejected
 *  - a correctly signed, fresh payload is accepted and recorded
 *  - duplicate event ids are not processed twice
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
const seenEventIds = new Set<string>();

vi.mock("../../src/lib/db", () => ({
  getDb: () =>
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      if (text.includes("INSERT INTO stripe_events")) {
        const eventId = String(values[0]);
        if (seenEventIds.has(eventId)) return Promise.resolve([]); // ON CONFLICT DO NOTHING
        seenEventIds.add(eventId);
        return Promise.resolve([{ id: "row1" }]);
      }
      return Promise.resolve([]);
    }),
}));
vi.mock("../../src/lib/mailer", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrapBodyInTemplate: vi.fn(() => "<html></html>"),
}));
vi.mock("../../src/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/posthog", () => ({ serverTrack: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/assignment", () => ({ initiateAssignment: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/paymentObservability", () => ({ recordPaymentEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/lib/subscriptions", () => ({ nextOccurrenceDate: vi.fn(() => new Date()) }));
vi.mock("../../src/lib/stripeSubscriptions", () => ({
  syncSweeprPlusSubscription: vi.fn().mockResolvedValue(undefined),
  markMembershipCanceled: vi.fn().mockResolvedValue(undefined),
  SWEEPR_PLUS_META: "sweepr_plus",
}));

import { stripeWebhookRouter } from "../../src/routes/stripe-webhook";

const WEBHOOK_SECRET = "whsec_test_secret_for_signature_tests";
const ENV = {
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  DATABASE_URL: "postgres://test",
  MAILERSEND_API_KEY: "test",
};

function sign(payload: string, timestamp: number, secret: string = WEBHOOK_SECRET): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function makeEvent(id: string): string {
  return JSON.stringify({
    id,
    object: "event",
    type: "payout.paid",
    data: { object: { id: "po_1", object: "payout", amount: 1234 } },
  });
}

async function post(body: string, signature?: string): Promise<Response> {
  return stripeWebhookRouter.request(
    "/",
    {
      method: "POST",
      body,
      headers: signature ? { "stripe-signature": signature } : {},
    },
    ENV,
  );
}

beforeEach(() => {
  sqlCalls.length = 0;
});

describe("Stripe webhook signature verification (real HMAC)", () => {
  it("rejects a request with no stripe-signature header and touches no state", async () => {
    const res = await post(makeEvent("evt_nosig"));
    expect(res.status).toBe(400);
    expect(sqlCalls.length).toBe(0);
  });

  it("rejects a forged signature (wrong secret) and touches no state", async () => {
    const payload = makeEvent("evt_forged");
    const now = Math.floor(Date.now() / 1000);
    const res = await post(payload, sign(payload, now, "whsec_attacker_guess"));
    expect(res.status).toBe(400);
    expect(sqlCalls.length).toBe(0);
  });

  it("rejects garbage in the signature header", async () => {
    const payload = makeEvent("evt_garbage");
    const res = await post(payload, "t=abc,v1=nothex");
    expect(res.status).toBe(400);
    expect(sqlCalls.length).toBe(0);
  });

  it("rejects a correctly signed but stale payload (replay outside tolerance)", async () => {
    const payload = makeEvent("evt_stale");
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600; // > 300s default tolerance
    const res = await post(payload, sign(payload, tenMinutesAgo));
    expect(res.status).toBe(400);
    expect(sqlCalls.length).toBe(0);
  });

  it("rejects a payload tampered with after signing (fake payment success injection)", async () => {
    const original = makeEvent("evt_tamper");
    const now = Math.floor(Date.now() / 1000);
    const signature = sign(original, now);
    const tampered = JSON.stringify({
      id: "evt_tamper",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_fake", amount: 1, metadata: { bookingId: "b1" } } },
    });
    const res = await post(tampered, signature);
    expect(res.status).toBe(400);
    expect(sqlCalls.length).toBe(0);
  });

  it("accepts a correctly signed, fresh payload and records the event", async () => {
    const payload = makeEvent("evt_ok_1");
    const now = Math.floor(Date.now() / 1000);
    const res = await post(payload, sign(payload, now));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO stripe_events"))).toBe(true);
  });

  it("does not process the same event id twice (idempotency claim)", async () => {
    const payload = makeEvent("evt_dup_1");
    const now = Math.floor(Date.now() / 1000);
    const first = await post(payload, sign(payload, now));
    expect(first.status).toBe(200);
    sqlCalls.length = 0;
    const second = await post(payload, sign(payload, now));
    expect(second.status).toBe(200);
    const body = (await second.json()) as { duplicate?: boolean };
    expect(body.duplicate).toBe(true);
    // Only the (conflicting) claim insert ran; nothing was processed or marked.
    expect(sqlCalls.filter((c) => c.text.includes("UPDATE")).length).toBe(0);
  });
});
