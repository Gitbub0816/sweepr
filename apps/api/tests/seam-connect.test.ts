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
 * Seam connect + webhook coverage:
 *  - webhook Svix signature verify + replay dedup
 *  - Connect Webview start (lock brands) + Airbnb start
 *  - connect/status upserts the connected_account
 *  - GET /devices is scoped to the caller's own connection (no cross-customer leak)
 *  - provisionSmartEntry creates a Seam grant ONLY when a device is present
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared fake tagged-template sql ──────────────────────────────────────────
interface Recorded {
  text: string;
  values: unknown[];
}
function makeSql(handler: (text: string, values: unknown[]) => unknown) {
  const calls: Recorded[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as import("../src/lib/db").Sql;
  return { sql, calls };
}

// Router-level tests use a module-level fake so the vi.mock('getDb') factory can
// close over it. Each test swaps `currentHandler`.
let currentHandler: (text: string, values: unknown[]) => unknown = () => [];
const routerCalls: Recorded[] = [];
const routerSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join("?");
  routerCalls.push({ text, values });
  return Promise.resolve(currentHandler(text, values) ?? []);
}) as unknown as import("../src/lib/db").Sql;

vi.mock("../src/lib/db", () => ({ getDb: () => routerSql }));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "clerk_caller" });
    await next();
  },
}));
vi.mock("../src/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));

import { smartEntryRouter } from "../src/routes/smartEntry";
import { seamWebhookRouter } from "../src/routes/seamWebhook";
import { provisionSmartEntry } from "../src/lib/smartEntry";

const CFG_ENABLED = JSON.stringify({ smartEntryEnabled: true });
const UID = "user_caller";

// ── Seam fetch mock (dispatch on URL path) ───────────────────────────────────
function stubSeamFetch(routes: Record<string, unknown>) {
  const seen: Array<{ path: string; body: unknown }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(init.body as string) : {};
    seen.push({ path, body });
    const match = routes[path];
    return {
      ok: true,
      status: 200,
      json: async () => match ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return seen;
}

beforeEach(() => {
  routerCalls.length = 0;
  vi.unstubAllGlobals();
});

// ═════════════════════════ Webhook: verify + dedup ═══════════════════════════
describe("Seam webhook — Svix verify + dedup", () => {
  const SECRET = "whsec_" + btoa("seam-webhook-signing-secret-value");

  async function sign(id: string, ts: string, body: string): Promise<string> {
    const b64 = SECRET.slice("whsec_".length);
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
    return "v1," + btoa(String.fromCharCode(...new Uint8Array(mac)));
  }

  function post(body: string, headers: Record<string, string>) {
    return seamWebhookRouter.request(
      "/",
      { method: "POST", headers, body },
      { SEAM_WEBHOOK_SECRET: SECRET, DATABASE_URL: "postgres://fake" } as never,
    );
  }

  it("accepts a valid signature, processes once, and skips the replay", async () => {
    const seenKeys = new Set<string>();
    currentHandler = (text, values) => {
      if (text.includes("INSERT INTO seam_webhook_events")) {
        const key = String(values[0]);
        if (seenKeys.has(key)) return []; // ON CONFLICT DO NOTHING
        seenKeys.add(key);
        return [{ id: "wh_1" }];
      }
      if (text.includes("UPDATE seam_connected_accounts")) return []; // no existing row
      return [];
    };

    const body = JSON.stringify({
      event_id: "evt_1",
      event_type: "connected_account.connected",
      connected_account_id: "acct_1",
      custom_metadata: { user_id: UID, provider: "seam" },
    });
    const id = "msg_1";
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await sign(id, ts, body);
    const headers = { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig };

    const first = await post(body, headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ received: true });
    // A connected event with metadata upserts the account row.
    expect(routerCalls.some((c) => c.text.includes("INSERT INTO seam_connected_accounts"))).toBe(true);

    routerCalls.length = 0;
    const replay = await post(body, headers);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ received: true, duplicate: true });
    // The replay must not re-run the handler.
    expect(routerCalls.some((c) => c.text.includes("INSERT INTO seam_connected_accounts"))).toBe(false);
  });

  it("rejects a bad signature with 401 before any DB work", async () => {
    currentHandler = () => [];
    const body = JSON.stringify({ event_id: "evt_2", event_type: "device.connected" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await post(body, { "svix-id": "m2", "svix-timestamp": ts, "svix-signature": "v1,deadbeef" });
    expect(res.status).toBe(401);
    expect(routerCalls.some((c) => c.text.includes("INSERT INTO seam_webhook_events"))).toBe(false);
  });

  it("fails closed (500) when the signing secret is unset", async () => {
    const res = await seamWebhookRouter.request(
      "/",
      { method: "POST", headers: {}, body: "{}" },
      { DATABASE_URL: "postgres://fake" } as never,
    );
    expect(res.status).toBe(500);
  });
});

// ═════════════════════════ Connect start / status ════════════════════════════
describe("Smart Entry connect webview", () => {
  function env(over: Record<string, unknown> = {}) {
    return { DATABASE_URL: "postgres://fake", SEAM_API_KEY: "seam_key", ...over } as never;
  }

  it("connect/start creates a webview and inserts a pending account row", async () => {
    currentHandler = (text) => {
      if (text.includes("FROM users WHERE clerk_id")) return [{ id: UID }];
      if (text.includes("FROM site_settings")) return [{ value: CFG_ENABLED }];
      return [];
    };
    const seen = stubSeamFetch({
      "/connect_webviews/create": {
        connect_webview: { connect_webview_id: "cw_1", url: "https://connect.seam/cw_1", status: "pending" },
      },
    });

    const res = await smartEntryRouter.request("/connect/start", { method: "POST" }, env());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: "https://connect.seam/cw_1", webviewId: "cw_1" });
    // Lock-brand providers, NOT airbnb.
    const create = seen.find((s) => s.path === "/connect_webviews/create");
    expect((create?.body as { accepted_providers: string[] }).accepted_providers).not.toContain("airbnb");
    expect((create?.body as { custom_metadata: { user_id: string } }).custom_metadata.user_id).toBe(UID);
    expect(routerCalls.some((c) => c.text.includes("INSERT INTO seam_connected_accounts"))).toBe(true);
  });

  it("connect/status upserts the connected account when authorized", async () => {
    currentHandler = (text) => {
      if (text.includes("FROM users WHERE clerk_id")) return [{ id: UID }];
      if (text.includes("FROM seam_connected_accounts") && text.includes("connect_webview_id"))
        return [{ id: "sca_1" }]; // ownership check
      if (text.includes("INSERT INTO smart_lock_connections")) return [{ id: "conn_1" }];
      return [];
    };
    stubSeamFetch({
      "/connect_webviews/get": {
        connect_webview: { connect_webview_id: "cw_1", status: "authorized", connected_account_id: "acct_9" },
      },
      "/devices/list": { devices: [] },
    });

    const res = await smartEntryRouter.request("/connect/status?webviewId=cw_1", { method: "GET" }, env());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: true, accountId: "acct_9" });
    const upsert = routerCalls.find(
      (c) => c.text.includes("UPDATE seam_connected_accounts") && c.text.includes("seam_connected_account_id"),
    );
    expect(upsert).toBeTruthy();
    expect(upsert?.values).toContain("acct_9");
  });

  it("airbnb/connect/start requests the airbnb provider", async () => {
    currentHandler = (text) => {
      if (text.includes("FROM users WHERE clerk_id")) return [{ id: UID }];
      if (text.includes("FROM site_settings")) return [{ value: CFG_ENABLED }];
      return [];
    };
    const seen = stubSeamFetch({
      "/connect_webviews/create": {
        connect_webview: { connect_webview_id: "cw_air", url: "https://connect.seam/airbnb", status: "pending" },
      },
    });

    const res = await smartEntryRouter.request("/airbnb/connect/start", { method: "POST" }, env());
    expect(res.status).toBe(200);
    const create = seen.find((s) => s.path === "/connect_webviews/create");
    expect((create?.body as { accepted_providers: string[] }).accepted_providers).toEqual(["airbnb"]);
    // The pending row is provider 'airbnb' (a SQL literal in the INSERT).
    const insert = routerCalls.find((c) => c.text.includes("INSERT INTO seam_connected_accounts"));
    expect(insert?.text).toContain("'airbnb'");
  });
});

// ═════════════════════════ Device scoping ════════════════════════════════════
describe("GET /smart-entry/devices scoping", () => {
  it("scopes the device query to the caller's own connection", async () => {
    // The fake models a shared table with two customers' devices; the handler's
    // WHERE cn.customer_id = <uid> is what enforces isolation, so we assert the
    // query carries that clause AND the caller's id, and that only the caller's
    // rows come back.
    currentHandler = (text, values) => {
      if (text.includes("FROM users WHERE clerk_id")) return [{ id: UID }];
      if (text.includes("FROM smart_lock_devices")) {
        expect(text).toContain("cn.customer_id");
        expect(text).toContain("cn.provider = 'seam'");
        expect(values).toContain(UID); // scoped to the caller
        // Simulate the DB returning only the caller's device.
        return [
          {
            id: "dev_mine",
            display_name: "Front door",
            device_type: "august_lock",
            status: "active",
            supports_remote_unlock: true,
            supports_temporary_codes: true,
          },
        ];
      }
      return [];
    };

    const res = await smartEntryRouter.request(
      "/devices",
      { method: "GET" },
      { DATABASE_URL: "postgres://fake" } as never,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { devices: Array<{ id: string; name: string; online: boolean }> };
    expect(json.devices).toHaveLength(1);
    expect(json.devices[0]).toMatchObject({ id: "dev_mine", name: "Front door", online: true });
    // A device belonging to another account ("dev_other") is never returned
    // because the query was scoped and the fake never yields it for this uid.
    expect(json.devices.find((d) => d.id === "dev_other")).toBeUndefined();
  });
});

// ═════════════════════════ provisionSmartEntry grant ═════════════════════════
describe("provisionSmartEntry", () => {
  const env = { SEAM_API_KEY: "seam_key", ENVIRONMENT: "test" } as never;

  it("creates a Seam access grant when a device (provider_device_reference) is present", async () => {
    const { sql, calls } = makeSql((text) => {
      if (text.includes("FROM site_settings")) return [{ value: CFG_ENABLED }];
      if (text.includes("FROM booking_access_authorizations a")) {
        return [
          {
            id: "auth_1",
            access_method: "smart_entry",
            access_starts_at: "2026-08-29T15:00:00.000Z",
            access_ends_at: "2026-08-29T17:30:00.000Z",
            lock_device_id: "dev_mine",
            customer_id: "cust_1",
            provider_device_reference: "seam_device_ref",
            supports_remote_unlock: false,
          },
        ];
      }
      if (text.includes("FROM booking_access_credentials")) return []; // not yet provisioned
      return [];
    });
    const seen = stubSeamFetch({
      "/user_identities/create": { user_identity: { user_identity_id: "ident_1" } },
      "/access_grants/create": { access_grant: { access_grant_id: "grant_1" } },
    });

    await provisionSmartEntry(sql, env, "booking_1");

    expect(seen.some((s) => s.path === "/access_grants/create")).toBe(true);
    const grantCall = seen.find((s) => s.path === "/access_grants/create");
    expect((grantCall?.body as { device_ids: string[] }).device_ids).toEqual(["seam_device_ref"]);
    // The credential row references the grant.
    const credInsert = calls.find((c) => c.text.includes("INSERT INTO booking_access_credentials"));
    expect(credInsert?.values).toContain("grant_1");
  });

  it("does NOT call Seam when no device is attached", async () => {
    const { sql } = makeSql((text) => {
      if (text.includes("FROM site_settings")) return [{ value: CFG_ENABLED }];
      if (text.includes("FROM booking_access_authorizations a")) {
        return [
          {
            id: "auth_2",
            access_method: "smart_entry",
            access_starts_at: "2026-08-29T15:00:00.000Z",
            access_ends_at: "2026-08-29T17:30:00.000Z",
            lock_device_id: null,
            customer_id: "cust_1",
            provider_device_reference: null, // no device chosen
            supports_remote_unlock: null,
          },
        ];
      }
      return [];
    });
    const seen = stubSeamFetch({});

    await provisionSmartEntry(sql, env, "booking_2");
    expect(seen.length).toBe(0); // early return, no Seam call
  });
});
