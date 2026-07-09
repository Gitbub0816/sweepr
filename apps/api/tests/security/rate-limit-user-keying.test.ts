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
 * Per-user rate limiting must actually key by the authenticated user.
 *
 * The limiters are registered globally BEFORE the routers run requireAuth, so
 * `c.get("user")` is unset when the limiter runs. Previously `by:"user"` then
 * silently degraded to a pure-IP bucket. It now falls back to the token's
 * unverified `sub` claim combined with the IP (`${ip}:${sub}`), so:
 *   - two distinct users behind the same shared IP get independent buckets;
 *   - the same user is capped regardless of which of the fallback keys is used;
 *   - forging a sub only splits the attacker's own IP bucket.
 */

import { Hono } from "hono";
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../../src/middleware/rateLimit";

// Minimal in-memory KV stand-in for RATE_LIMIT_KV.
function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    _store: store,
  };
}

// Build a JWT-shaped token (header.payload.signature) with the given sub. Only
// the payload segment is read by the limiter; signature is irrelevant here.
function tokenWithSub(sub: string): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "RS256" })}.${b64({ sub })}.sig`;
}

function buildApp(kv: ReturnType<typeof makeKV>) {
  const app = new Hono();
  app.use(
    "*",
    rateLimit({ limit: 2, windowMs: 60_000, keyPrefix: "test-user", by: "user", strict: true }),
  );
  app.get("/x", (c) => c.json({ ok: true }));
  // Inject the fake KV as env.
  return (headers: Record<string, string>) =>
    app.request("/x", { headers }, { RATE_LIMIT_KV: kv } as never);
}

describe("per-user rate limit keying", () => {
  let kv: ReturnType<typeof makeKV>;
  let call: (headers: Record<string, string>) => Promise<Response>;

  beforeEach(() => {
    kv = makeKV();
    call = buildApp(kv);
  });

  it("keys distinct users on a shared IP into independent buckets", async () => {
    const ip = "203.0.113.7";
    const userA = { "CF-Connecting-IP": ip, Authorization: `Bearer ${tokenWithSub("user_A")}` };
    const userB = { "CF-Connecting-IP": ip, Authorization: `Bearer ${tokenWithSub("user_B")}` };

    // User A exhausts their bucket (limit 2).
    expect((await call(userA)).status).toBe(200);
    expect((await call(userA)).status).toBe(200);
    expect((await call(userA)).status).toBe(429);

    // User B on the SAME IP is unaffected — proving the bucket is per-user,
    // not a shared IP bucket.
    expect((await call(userB)).status).toBe(200);
    expect((await call(userB)).status).toBe(200);
    expect((await call(userB)).status).toBe(429);
  });

  it("caps the same user across requests", async () => {
    const h = { "CF-Connecting-IP": "198.51.100.9", Authorization: `Bearer ${tokenWithSub("same")}` };
    expect((await call(h)).status).toBe(200);
    expect((await call(h)).status).toBe(200);
    expect((await call(h)).status).toBe(429);
  });

  it("writes the bucket under an ip:sub key, not a bare IP key", async () => {
    const ip = "192.0.2.55";
    await call({ "CF-Connecting-IP": ip, Authorization: `Bearer ${tokenWithSub("keycheck")}` });
    const keys = [...kv._store.keys()];
    expect(keys.some((k) => k.includes("keycheck"))).toBe(true);
    // Must not have stored under a plain IP-only identity.
    expect(keys.some((k) => k.endsWith(`:${ip}`))).toBe(false);
  });

  it("falls back to IP when no bearer token is present", async () => {
    const ip = "192.0.2.77";
    expect((await call({ "CF-Connecting-IP": ip })).status).toBe(200);
    expect((await call({ "CF-Connecting-IP": ip })).status).toBe(200);
    expect((await call({ "CF-Connecting-IP": ip })).status).toBe(429);
    const keys = [...kv._store.keys()];
    expect(keys.some((k) => k.endsWith(`:${ip}`))).toBe(true);
  });
});
