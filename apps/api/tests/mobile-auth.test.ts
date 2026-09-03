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
 * Mobile BFF (routes/mobileAuth.ts) — the native apps' bridge to the auth
 * broker. The worker is the only holder of broker service keys on the mobile
 * path, so these tests pin the three things that matter:
 *  - fail closed: missing broker config can only ever produce 503, never a
 *    token;
 *  - the broker call carries the right service key + origin-verify header and
 *    forwards the device IP/UA (rate-limit identity);
 *  - the minted API token is exactly what requireAuth's BFF path accepts
 *    (iss broker.getsweepr.com/bff, HS256 over API_BROKER_TOKEN_SECRET,
 *    sub = clerk user id, app + principal_user_id claims).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mobileAuthRouter } from "../src/routes/mobileAuth";
import type { AppBindings } from "../src/types";

const ENV = {
  BROKER_KEY_CUSTOMER: "svc-key-customer",
  BROKER_KEY_CLEANER: "svc-key-cleaner",
  ORIGIN_SHARED_SECRET: "origin-verify-secret",
  API_BROKER_TOKEN_SECRET: "api-token-hmac-secret",
} as Record<string, string>;

function buildApp() {
  const app = new Hono<AppBindings>();
  app.route("/mobile-auth", mobileAuthRouter);
  return app;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Verify a minted token the same way middleware/auth.ts verifyBffToken does. */
async function verifyMintedToken(token: string, secret: string) {
  const [h, p, sig] = token.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sig),
    new TextEncoder().encode(`${h}.${p}`),
  );
  expect(ok).toBe(true);
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as {
    iss: string;
    sub: string;
    app: string;
    principal_user_id: string | null;
    exp: number;
  };
}

const realFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function brokerReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /mobile-auth/session", () => {
  it("fails closed with 503 when the app's broker key is missing", async () => {
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", clerkToken: "x".repeat(40) }),
      },
      { ...ENV, BROKER_KEY_CUSTOMER: undefined },
    );
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when API_BROKER_TOKEN_SECRET is missing", async () => {
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", clerkToken: "x".repeat(40) }),
      },
      { ...ENV, API_BROKER_TOKEN_SECRET: undefined },
    );
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges a Clerk proof for a broker session + a verifiable API token", async () => {
    brokerReplies(200, {
      session_token: "opaque-session-token",
      session_id: "3f0b1a9e-0000-0000-0000-000000000000",
      principal_user_id: "9d3f0000-0000-0000-0000-000000000001",
      clerk_user_id: "user_clerk123",
      expires_at: "2026-11-02T00:00:00+00",
    });

    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.9",
          "User-Agent": "SweeprApp/1.0 iOS",
        },
        body: JSON.stringify({ app: "customer", clerkToken: "x".repeat(40) }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sessionToken).toBe("opaque-session-token");
    expect(body.sessionExpiresAt).toBe("2026-11-02T00:00:00+00");

    // The broker call: right endpoint, right service key, origin verify,
    // device identity forwarded.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sweepr.fly.dev/v1/auth/native/exchange");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer svc-key-customer");
    expect(headers["X-Sweepr-Origin-Verify"]).toBe("origin-verify-secret");
    expect(headers["CF-Connecting-IP"]).toBe("203.0.113.9");
    expect(headers["User-Agent"]).toBe("SweeprApp/1.0 iOS");
    expect(JSON.parse(init.body as string)).toEqual({ clerk_token: "x".repeat(40) });

    // The minted token is exactly what requireAuth's BFF path accepts.
    const claims = await verifyMintedToken(body.apiToken as string, ENV.API_BROKER_TOKEN_SECRET);
    expect(claims.iss).toBe("https://broker.getsweepr.com/bff");
    expect(claims.sub).toBe("user_clerk123");
    expect(claims.app).toBe("customer");
    expect(claims.principal_user_id).toBe("9d3f0000-0000-0000-0000-000000000001");
    expect(claims.exp * 1000).toBeGreaterThan(Date.now());
  });

  it("uses the cleaner service key for the cleaner app", async () => {
    brokerReplies(200, {
      session_token: "t",
      clerk_user_id: "user_c",
      principal_user_id: null,
      expires_at: "2026-11-02T00:00:00+00",
    });
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "cleaner", clerkToken: "x".repeat(40) }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer svc-key-cleaner");
    const claims = await verifyMintedToken(
      ((await res.json()) as { apiToken: string }).apiToken,
      ENV.API_BROKER_TOKEN_SECRET,
    );
    expect(claims.app).toBe("cleaner");
    expect(claims.principal_user_id).toBeNull();
  });

  it("propagates the broker's precise denial vocabulary", async () => {
    brokerReplies(401, { error: "reverification_required" });
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", clerkToken: "x".repeat(40) }),
      },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "reverification_required" });
  });

  it("maps a broker outage to 502, never a token", async () => {
    fetchMock.mockRejectedValue(new Error("connect timeout"));
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", clerkToken: "x".repeat(40) }),
      },
      ENV,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "broker_unavailable" });
  });

  it("rejects an unknown app id at validation", async () => {
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "admin", clerkToken: "x".repeat(40) }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /mobile-auth/token", () => {
  it("re-mints an API token from an active broker session", async () => {
    brokerReplies(200, {
      active: true,
      app_id: "customer",
      principal_user_id: "9d3f0000-0000-0000-0000-000000000001",
      clerk_user_id: "user_clerk123",
      expires_at: "2026-12-01T00:00:00+00",
    });
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", sessionToken: "opaque-session-token-123" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { apiToken: string; sessionExpiresAt: string };
    expect(body.sessionExpiresAt).toBe("2026-12-01T00:00:00+00");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://sweepr.fly.dev/v1/auth/introspect");
    const claims = await verifyMintedToken(body.apiToken, ENV.API_BROKER_TOKEN_SECRET);
    expect(claims.sub).toBe("user_clerk123");
  });

  it("answers 401 session_inactive for a revoked/expired session", async () => {
    brokerReplies(200, { active: false });
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", sessionToken: "opaque-session-token-123" }),
      },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "session_inactive" });
  });
});

describe("POST /mobile-auth/logout", () => {
  it("revokes at the broker and always frees the device", async () => {
    brokerReplies(200, { ok: true });
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/logout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "cleaner", sessionToken: "opaque-session-token-123" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sweepr.fly.dev/v1/auth/logout");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer svc-key-cleaner");
  });

  it("still frees the device when the broker is down", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const app = buildApp();
    const res = await app.request(
      "/mobile-auth/logout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: "customer", sessionToken: "opaque-session-token-123" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
