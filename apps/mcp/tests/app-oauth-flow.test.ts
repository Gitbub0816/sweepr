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
 * App-level tests: kill switch, OAuth metadata/registration, the token
 * endpoint's single-use auth-code enforcement, and /mcp bearer gating with
 * the WWW-Authenticate discovery header. The DB layer is mocked at the
 * getDb boundary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the mcp_action_log-based single-use check.
const usedJtis = new Set<string>();
const sqlCalls: Array<{ text: string; values: unknown[] }> = [];

vi.mock("../src/lib/db", () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push({ text, values });
    if (text.includes("SELECT id FROM mcp_action_log") && text.includes("oauth_code_use")) {
      const jti = String(values[0]);
      return Promise.resolve(usedJtis.has(jti) ? [{ id: "x" }] : []);
    }
    if (text.includes("INSERT INTO mcp_action_log") && text.includes("oauth_code_use")) {
      // values: [admin_email, jsonDetail]
      const detail = JSON.parse(String(values[1])) as { jti: string };
      usedJtis.add(detail.jti);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  return { getDb: () => sql };
});

import app from "../src/index";
import { mintAuthCode, mintAccessToken, pkceChallengeFromVerifier } from "../src/lib/oauth";

const ENV = {
  MCP_ENABLED: "true",
  DATABASE_URL: "postgres://mocked",
  CLERK_ADMIN_SECRET_KEY: "sk_test_mocked",
  MCP_TOKEN_SECRET: "app-test-secret",
};

beforeEach(() => {
  usedJtis.clear();
  sqlCalls.length = 0;
});

describe("kill switch", () => {
  it("returns 503 everywhere unless MCP_ENABLED is exactly 'true'", async () => {
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      const res = await app.request(
        "/.well-known/oauth-authorization-server",
        {},
        { ...ENV, MCP_ENABLED: flag },
      );
      expect(res.status).toBe(503);
    }
    const ok = await app.request("/.well-known/oauth-authorization-server", {}, ENV);
    expect(ok.status).toBe(200);
  });

  it("fails closed when MCP_TOKEN_SECRET is missing", async () => {
    const res = await app.request("/", {}, { ...ENV, MCP_TOKEN_SECRET: "" });
    expect(res.status).toBe(503);
  });
});

describe("OAuth metadata + registration", () => {
  it("serves RFC 8414 metadata with PKCE S256 and public-client auth", async () => {
    const res = await app.request("/.well-known/oauth-authorization-server", {}, ENV);
    const meta = (await res.json()) as Record<string, unknown>;
    expect(meta.issuer).toBe("https://mcp.getsweepr.com");
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(meta.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  });

  it("registers a client with https redirect uris and rejects http non-localhost", async () => {
    const good = await app.request(
      "/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
          client_name: "ChatGPT",
        }),
      },
      ENV,
    );
    expect(good.status).toBe(201);
    const reg = (await good.json()) as { client_id: string };
    expect(reg.client_id.split(".").length).toBe(3); // signed blob, no storage

    const bad = await app.request(
      "/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }),
      },
      ENV,
    );
    expect(bad.status).toBe(400);
  });
});

describe("token endpoint", () => {
  async function mintFlow() {
    const verifier = "v".repeat(43);
    const challenge = await pkceChallengeFromVerifier(verifier);
    const { code } = await mintAuthCode(ENV.MCP_TOKEN_SECRET, {
      adminEmail: "admin@getsweepr.com",
      clientId: "client-abc",
      redirectUri: "https://x/cb",
      codeChallenge: challenge,
    });
    return { code, verifier };
  }

  function exchange(code: string, verifier: string) {
    return app.request(
      "/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          client_id: "client-abc",
          redirect_uri: "https://x/cb",
        }).toString(),
      },
      ENV,
    );
  }

  it("exchanges a fresh code + PKCE verifier for tokens", async () => {
    const { code, verifier } = await mintFlow();
    const res = await exchange(code, verifier);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    expect(body.scope).toBe("mcp");
  });

  it("rejects the SECOND use of the same code (single-use)", async () => {
    const { code, verifier } = await mintFlow();
    expect((await exchange(code, verifier)).status).toBe(200);
    const replay = await exchange(code, verifier);
    expect(replay.status).toBe(400);
    const body = (await replay.json()) as { error: string };
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects a wrong PKCE verifier", async () => {
    const { code } = await mintFlow();
    const res = await exchange(code, "w".repeat(43));
    expect(res.status).toBe(400);
  });

  it("refresh_token grant rotates tokens", async () => {
    const { code, verifier } = await mintFlow();
    const first = (await (await exchange(code, verifier)).json()) as { refresh_token: string };
    const res = await app.request(
      "/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: first.refresh_token,
        }).toString(),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string };
    expect(typeof body.access_token).toBe("string");
  });
});

describe("/mcp bearer gating", () => {
  it("401s without a token and advertises the resource metadata for discovery", async () => {
    const res = await app.request(
      "/mcp",
      { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://mcp.getsweepr.com/.well-known/oauth-protected-resource"',
    );
  });

  it("accepts a valid access token and answers ping", async () => {
    const token = await mintAccessToken(ENV.MCP_TOKEN_SECRET, "admin@getsweepr.com");
    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: object }).result).toEqual({});
  });

  it("rejects a share token used as an access token", async () => {
    const { mintShareToken } = await import("../src/lib/oauth");
    const share = await mintShareToken(ENV.MCP_TOKEN_SECRET, "admin@getsweepr.com", "default");
    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${share}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      },
      ENV,
    );
    expect(res.status).toBe(401);
  });
});
