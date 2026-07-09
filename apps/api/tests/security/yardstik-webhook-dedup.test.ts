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
 * The Yardstik webhook must dedup replayed deliveries. A captured (validly
 * signed) delivery replayed a second time must be recognized as a duplicate via
 * the yardstik_webhook_events claim (INSERT … ON CONFLICT DO NOTHING RETURNING)
 * and skipped — it must not re-drive the cleaner's status a second time.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake DB: records every tagged-template call and simulates the dedup table's
// unique constraint on event_key.
const seenEventKeys = new Set<string>();
const calls: string[] = [];

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = strings.join("?");
  calls.push(text);
  if (text.includes("INSERT INTO yardstik_webhook_events")) {
    const eventKey = String(values[0]);
    if (seenEventKeys.has(eventKey)) return Promise.resolve([]); // ON CONFLICT DO NOTHING
    seenEventKeys.add(eventKey);
    return Promise.resolve([{ id: "row_1" }]);
  }
  if (text.includes("FROM cleaners") && text.includes("yardstik_candidate_id")) {
    return Promise.resolve([{ id: "cleaner_1" }]);
  }
  return Promise.resolve([]);
}

vi.mock("../../src/lib/db", () => ({ getDb: () => fakeSql }));
// Keep external side-effects inert.
vi.mock("../../src/lib/posthog", () => ({ serverTrack: () => {} }));
vi.mock("../../src/lib/adjudication", () => ({ adjudicateConsiderReport: async () => null }));

import { yardstikRouter } from "../../src/routes/yardstik";

const secret = "yardstik-signature-key";

async function signBody(body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function post(body: string, sig: string) {
  return yardstikRouter.request(
    "/webhook",
    { method: "POST", headers: { "x-yardstik-webhook-signature": sig }, body },
    { YARDSTIK_WEBHOOK_SIGNATURE: secret, DATABASE_URL: "postgres://fake" } as never,
  );
}

describe("Yardstik webhook replay dedup", () => {
  beforeEach(() => {
    seenEventKeys.clear();
    calls.length = 0;
  });

  it("processes the first delivery and skips an identical replay", async () => {
    const body = JSON.stringify({
      id: "evt_abc",
      event: "updated",
      resource_type: "report",
      resource_id: "rep_1",
      external_id: "cleaner_1",
      status: "clear",
    });
    const sig = await signBody(body);

    const first = await post(body, sig);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true });
    // First delivery does real work (updates the cleaners row).
    expect(calls.some((c) => c.includes("UPDATE cleaners"))).toBe(true);

    calls.length = 0;
    const replay = await post(body, sig);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ received: true, duplicate: true });
    // Replay must NOT touch the cleaners row again.
    expect(calls.some((c) => c.includes("UPDATE cleaners"))).toBe(false);
  });

  it("rejects an invalid signature before any dedup/processing", async () => {
    const body = JSON.stringify({ id: "evt_x", event: "updated", resource_type: "report" });
    const res = await post(body, "deadbeef");
    expect(res.status).toBe(401);
  });
});
