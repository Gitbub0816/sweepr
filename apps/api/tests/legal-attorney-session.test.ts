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
 * Attorney portal session tokens: HMAC-signed, expiring, and tamper-evident.
 */
import { describe, it, expect } from "vitest";
import { mintAttorneySession, verifyAttorneySession } from "../src/lib/legalAttorney";

const env = { LEGAL_ATTORNEY_SESSION_SECRET: "test-secret-key", DATABASE_URL: "postgres://x" };

describe("attorney session tokens", () => {
  it("mints a token that verifies back to the attorney id", async () => {
    const token = await mintAttorneySession(env, "attorney-123");
    expect(await verifyAttorneySession(env, token)).toBe("attorney-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintAttorneySession(env, "attorney-123");
    const other = { LEGAL_ATTORNEY_SESSION_SECRET: "different-secret", DATABASE_URL: "postgres://x" };
    expect(await verifyAttorneySession(other, token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await mintAttorneySession(env, "attorney-123");
    const [, sig] = token.split(".");
    const forged = `${btoa('{"sub":"attacker","exp":9999999999}').replace(/=+$/, "")}.${sig}`;
    expect(await verifyAttorneySession(env, forged)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyAttorneySession(env, "not-a-token")).toBeNull();
    expect(await verifyAttorneySession(env, "")).toBeNull();
  });

  it("falls back to a DATABASE_URL-derived key when no dedicated secret is set", async () => {
    const noSecret = { DATABASE_URL: "postgres://fallback" };
    const token = await mintAttorneySession(noSecret, "attorney-9");
    expect(await verifyAttorneySession(noSecret, token)).toBe("attorney-9");
    // A different DATABASE_URL yields a different key, so verification fails.
    expect(await verifyAttorneySession({ DATABASE_URL: "postgres://other" }, token)).toBeNull();
  });
});
