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
 * The Didit webhook freshness check must be MANDATORY. Previously it ran only
 * when an X-Timestamp header was present, so an attacker could replay a
 * captured (validly-signed) webhook indefinitely by omitting the header.
 */

import { describe, it, expect } from "vitest";
import { verifyDiditSignature } from "../../src/lib/didit";

const secret = "didit-webhook-secret";

// Didit's canonical form is shortenFloats → sortKeys → JSON.stringify; for a
// flat string/number payload that's just JSON.stringify of the sorted object.
async function sign(body: string): Promise<string> {
  const canonical = JSON.stringify(
    Object.keys(JSON.parse(body)).sort().reduce<Record<string, unknown>>((a, k) => {
      a[k] = JSON.parse(body)[k];
      return a;
    }, {}),
  );
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyDiditSignature freshness is mandatory", () => {
  const body = JSON.stringify({ event_id: "e1", session_id: "s1", status: "Approved" });

  it("accepts a valid signature with a fresh timestamp", async () => {
    const sig = await sign(body);
    const now = String(Math.floor(Date.now() / 1000));
    expect(await verifyDiditSignature(body, sig, secret, now)).toBe(true);
  });

  it("rejects a valid signature when the timestamp header is omitted (replay)", async () => {
    const sig = await sign(body);
    expect(await verifyDiditSignature(body, sig, secret, undefined)).toBe(false);
    expect(await verifyDiditSignature(body, sig, secret, "")).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const sig = await sign(body);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(await verifyDiditSignature(body, sig, secret, old)).toBe(false);
  });
});
