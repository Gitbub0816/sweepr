/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect } from "vitest";
import {
  signToken,
  verifyMcpToken,
  mintClientId,
  verifyClientId,
  mintAuthCode,
  mintAccessToken,
  pkceChallengeFromVerifier,
  verifyPkce,
  isAcceptableRedirectUri,
} from "../src/lib/oauth";

const SECRET = "test-secret-for-unit-tests";

describe("HMAC token sign/verify", () => {
  it("round-trips claims", async () => {
    const token = await signToken(SECRET, { typ: "access", iat: 1, admin_email: "a@b.c" });
    const claims = await verifyMcpToken(SECRET, token, "access");
    expect(claims).not.toBeNull();
    expect(claims?.admin_email).toBe("a@b.c");
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(SECRET, { typ: "access", iat: 1, admin_email: "a@b.c" });
    const [h, p, s] = token.split(".");
    const forged = `${h}.${p.slice(0, -2)}xx.${s}`;
    expect(await verifyMcpToken(SECRET, forged, "access")).toBeNull();
  });

  it("rejects the wrong secret", async () => {
    const token = await signToken(SECRET, { typ: "access", iat: 1 });
    expect(await verifyMcpToken("other-secret", token, "access")).toBeNull();
  });

  it("rejects a cross-type replay (refresh used as access)", async () => {
    const token = await signToken(SECRET, { typ: "refresh", iat: 1, admin_email: "a@b.c" });
    expect(await verifyMcpToken(SECRET, token, "access")).toBeNull();
    expect(await verifyMcpToken(SECRET, token, "refresh")).not.toBeNull();
  });

  it("rejects expired tokens", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await signToken(SECRET, { typ: "code", iat: past - 60, exp: past });
    expect(await verifyMcpToken(SECRET, token, "code")).toBeNull();
  });

  it("access tokens verify while fresh", async () => {
    const token = await mintAccessToken(SECRET, "admin@getsweepr.com");
    const claims = await verifyMcpToken(SECRET, token, "access");
    expect(claims?.admin_email).toBe("admin@getsweepr.com");
    expect(claims?.scope).toBe("mcp");
  });
});

describe("stateless client registration", () => {
  it("round-trips redirect uris and name", async () => {
    const id = await mintClientId(SECRET, ["https://chat.openai.com/cb"], "ChatGPT");
    const claims = await verifyClientId(SECRET, id);
    expect(claims?.redirect_uris).toEqual(["https://chat.openai.com/cb"]);
    expect(claims?.client_name).toBe("ChatGPT");
  });

  it("a non-client token is not a client id", async () => {
    const token = await mintAccessToken(SECRET, "a@b.c");
    expect(await verifyClientId(SECRET, token)).toBeNull();
  });

  it("redirect uri policy: https or localhost only", () => {
    expect(isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAcceptableRedirectUri("http://localhost:3000/cb")).toBe(true);
    expect(isAcceptableRedirectUri("http://evil.example.com/cb")).toBe(false);
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAcceptableRedirectUri("not a url")).toBe(false);
  });
});

describe("PKCE S256", () => {
  it("verifies a matching verifier/challenge pair", async () => {
    const verifier = "a".repeat(43);
    const challenge = await pkceChallengeFromVerifier(verifier);
    expect(await verifyPkce(challenge, verifier)).toBe(true);
  });

  it("rejects a wrong verifier and out-of-bounds lengths", async () => {
    const challenge = await pkceChallengeFromVerifier("a".repeat(43));
    expect(await verifyPkce(challenge, "b".repeat(43))).toBe(false);
    expect(await verifyPkce(challenge, "short")).toBe(false);
    expect(await verifyPkce(challenge, "")).toBe(false);
  });
});

describe("auth codes", () => {
  it("carry the grant details and a unique jti", async () => {
    const a = await mintAuthCode(SECRET, {
      adminEmail: "admin@getsweepr.com",
      clientId: "client-1",
      redirectUri: "https://x/cb",
      codeChallenge: "ch",
    });
    const b = await mintAuthCode(SECRET, {
      adminEmail: "admin@getsweepr.com",
      clientId: "client-1",
      redirectUri: "https://x/cb",
      codeChallenge: "ch",
    });
    expect(a.jti).not.toBe(b.jti);
    const claims = await verifyMcpToken(SECRET, a.code, "code");
    expect(claims?.admin_email).toBe("admin@getsweepr.com");
    expect(claims?.jti).toBe(a.jti);
    expect(claims?.code_challenge).toBe("ch");
  });
});
