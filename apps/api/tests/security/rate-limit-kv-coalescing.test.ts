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
 * Strict rate-limit buckets coalesce their KV writes.
 *
 * The strict limiter used to write to KV on every request, which let sustained
 * low-volume traffic (health probes, scanners) exhaust Cloudflare's free-tier
 * ~1,000 writes/day with zero real users. It now keeps reading KV every request
 * (reads are ~100× cheaper) but only persists on a window roll, in the
 * near-limit security zone, or after a full step of local progress — so a
 * bucket under its cap costs ~1 write per window instead of one per request,
 * while the cap itself still blocks precisely and stays pinned.
 */

import { Hono } from "hono";
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../../src/middleware/rateLimit";

// In-memory KV stand-in that counts writes.
function makeKV() {
  const store = new Map<string, string>();
  let puts = 0;
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      puts += 1;
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    get puts() {
      return puts;
    },
    _store: store,
  };
}

function buildApp(kv: ReturnType<typeof makeKV>, limit: number, keyPrefix: string) {
  const app = new Hono();
  app.use("*", rateLimit({ limit, windowMs: 60_000, keyPrefix, strict: true }));
  app.get("/x", (c) => c.json({ ok: true }));
  return (ip: string) =>
    app.request("/x", { headers: { "CF-Connecting-IP": ip } }, { RATE_LIMIT_KV: kv } as never);
}

describe("strict rate-limit KV write coalescing", () => {
  let kv: ReturnType<typeof makeKV>;

  beforeEach(() => {
    kv = makeKV();
  });

  it("writes once per window for light under-limit traffic", async () => {
    // Unique IP+prefix so this bucket doesn't collide with other tests sharing
    // the module-level memory map.
    const call = buildApp(kv, 20, "coalesce-light");
    const ip = "203.0.113.101";
    for (let i = 0; i < 5; i++) {
      expect((await call(ip)).status).toBe(200);
    }
    // 5 requests, well under the limit and under one coalesce step → 1 write.
    expect(kv.puts).toBe(1);
  });

  it("still blocks at the cap, with far fewer writes than requests", async () => {
    const call = buildApp(kv, 20, "coalesce-block");
    const ip = "203.0.113.102";
    let last = 200;
    for (let i = 0; i < 21; i++) {
      last = (await call(ip)).status;
    }
    // 21st request exceeds the limit of 20.
    expect(last).toBe(429);
    // Writes are coalesced: nowhere near one-per-request.
    expect(kv.puts).toBeLessThanOrEqual(10);
    expect(kv.puts).toBeGreaterThan(0);
  });

  it("persists every request once inside the near-limit zone (block stays pinned)", async () => {
    const call = buildApp(kv, 20, "coalesce-nearlimit");
    const ip = "203.0.113.103";
    // Drive up to the near-limit floor (16 for limit 20).
    for (let i = 0; i < 15; i++) await call(ip);
    const before = kv.puts;
    // Requests 16..20 are all in the near-limit zone → one write each.
    for (let i = 0; i < 5; i++) await call(ip);
    expect(kv.puts - before).toBe(5);
  });
});
