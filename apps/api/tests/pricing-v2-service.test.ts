/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildColdStartConfig, computeQuoteV2 } from "../src/lib/quoteEngine";
import {
  buildQuoteInputFromBooking,
  assembleV2Pricing,
} from "../src/lib/quoteEngine/bookingAdapter";
import {
  clearActivePricingVersionCache,
  loadActivePricingVersion,
} from "../src/lib/quoteEngine/service";
import type { Sql } from "@sweepr/db";

vi.mock("../src/lib/foundingMember", () => ({
  foundingCustomerDiscountPct: vi.fn(async () => 0),
}));

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
type Handler = (text: string, values: unknown[]) => unknown;
let handler: Handler = () => [];

function makeSql(): Sql {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    sqlCalls.push({ text, values });
    return Promise.resolve(handler(text, values) ?? []);
  }) as unknown as Sql;
}

const cfg = buildColdStartConfig();

function activeVersionHandler(): Handler {
  return (text) => {
    if (text.includes("FROM pricing_versions")) {
      return [{ id: "ver-1", name: "Test", config: cfg }];
    }
    if (text.includes("INSERT INTO pricing_quotes_v2")) return [{ id: "quote-1" }];
    return [];
  };
}

beforeEach(() => {
  sqlCalls.length = 0;
  handler = () => [];
  clearActivePricingVersionCache();
});

describe("buildQuoteInputFromBooking", () => {
  it("maps wire levels/counts to engine input (bathrooms ceil'd, 1 kitchen/living)", () => {
    const input = buildQuoteInputFromBooking(
      {
        bedrooms: 4,
        bathrooms: 2.5,
        sqft: 1800,
        addOnKeys: ["inside_oven"],
        rooms: [
          { roomType: "bathroom", level: "level_4" },
          { roomType: "kitchen", level: "level_2" },
        ],
        clutter: { bedroom: 1 },
        roomCountsByLevel: { bathroom: [1, 1, 0, 1] },
      },
      { emergency: true, zipMultiplierPct: 5 },
    );
    expect(input.counts).toEqual({ kitchen: 1, bathroom: 3, bedroom: 4, living_room: 1 });
    expect(input.conditions).toEqual({ kitchen: 2, bathroom: 4, bedroom: 1, living_room: 1 });
    expect(input.clutter).toEqual({ bedroom: 1 });
    expect(input.countsByLevel).toEqual({ bathroom: [1, 1, 0, 1] });
    expect(input.extras).toEqual([{ key: "inside_oven", quantity: 1 }]);
    expect(input.emergency).toBe(true);
    expect(input.zipMultiplierPct).toBe(5);
  });
});

describe("assembleV2Pricing", () => {
  const wire = {
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1600,
    addOnKeys: [],
    rooms: [
      { roomType: "kitchen" as const, level: "level_2" },
      { roomType: "bathroom" as const, level: "level_2" },
      { roomType: "bedroom" as const, level: "level_2" },
      { roomType: "living_room" as const, level: "level_2" },
    ],
  };

  it("returns null when no pricing version is active (v2 dark)", async () => {
    handler = () => []; // no active version row
    const out = await assembleV2Pricing(makeSql(), wire, {
      customerId: null,
      emergency: false,
      zipMultiplierPct: 0,
    });
    expect(out).toBeNull();
  });

  it("returns null when the client sent no rooms (legacy client)", async () => {
    handler = activeVersionHandler();
    const out = await assembleV2Pricing(makeSql(), { ...wire, rooms: [] }, {
      customerId: null,
      emergency: false,
      zipMultiplierPct: 0,
    });
    expect(out).toBeNull();
  });

  it("assembles totals that match the engine exactly and persists the quote", async () => {
    handler = activeVersionHandler();
    const out = await assembleV2Pricing(makeSql(), wire, {
      customerId: "cust-1",
      emergency: false,
      zipMultiplierPct: 0,
    });
    expect(out).not.toBeNull();
    const expected = computeQuoteV2(
      cfg,
      buildQuoteInputFromBooking(wire, { emergency: false, zipMultiplierPct: 0 }),
      { pricingVersionId: "ver-1" },
    );
    expect(out!.totalPrice).toBe(expected.totalCents);
    expect(out!.cleanerPayout).toBe(expected.cleanerPayoutCents);
    expect(out!.taxCents).toBe(expected.taxCents);
    expect(out!.quoteId).toBe("quote-1");
    expect(out!.versionId).toBe("ver-1");
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO pricing_quotes_v2"))).toBe(true);
    // Money line items reconcile with the engine's components.
    const lineSum = out!.lineItems.reduce((s, li) => s + li.cents, 0);
    const componentSum = expected.components.reduce((s, comp) => s + comp.amountCents, 0);
    expect(lineSum).toBe(componentSum);
  });

  it("falls back to null (never throws) on an internal failure", async () => {
    handler = (text) => {
      if (text.includes("FROM pricing_versions")) return [{ id: "ver-1", name: "T", config: cfg }];
      if (text.includes("INSERT INTO pricing_quotes_v2")) throw new Error("db down");
      return [];
    };
    const out = await assembleV2Pricing(makeSql(), wire, {
      customerId: null,
      emergency: false,
      zipMultiplierPct: 0,
    });
    expect(out).toBeNull();
  });
});

describe("loadActivePricingVersion cache", () => {
  it("caches within the TTL and survives missing tables", async () => {
    let queries = 0;
    handler = (text) => {
      if (text.includes("FROM pricing_versions")) {
        queries++;
        return [{ id: "ver-1", name: "T", config: cfg }];
      }
      return [];
    };
    const sql = makeSql();
    await loadActivePricingVersion(sql);
    await loadActivePricingVersion(sql);
    expect(queries).toBe(1);

    clearActivePricingVersionCache();
    handler = () => {
      throw new Error('relation "pricing_versions" does not exist');
    };
    await expect(loadActivePricingVersion(makeSql())).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Admin routes: immutability + publish gates
// ---------------------------------------------------------------------------

vi.mock("../src/lib/db", () => ({
  getDb: () =>
    ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return Promise.resolve(handler(text, values) ?? []);
    }),
}));
vi.mock("../src/middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { clerkId: "admin_1" });
    await next();
  },
}));
vi.mock("../src/middleware/adminRoles", () => ({
  requireAdminRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireAdmin: async (_c: unknown, next: () => Promise<void>) => next(),
}));

const ENV = { DATABASE_URL: "postgres://fake" } as never;

describe("admin pricing v2 routes", () => {
  async function router() {
    const { adminPricingV2Router } = await import("../src/routes/adminPricingV2");
    return adminPricingV2Router;
  }

  it("refuses config edits on a published version (immutability)", async () => {
    handler = (text) => {
      if (text.includes("SELECT * FROM pricing_versions WHERE id")) {
        return [{ id: "v1", status: "active", config: cfg, service_area: "default", currency: "USD", inference_provenance: "cold_start" }];
      }
      return [];
    };
    const r = await router();
    const res = await r.request(
      "/versions/6b9d1a1e-0000-4000-8000-000000000001/config",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg }) },
      ENV,
    );
    expect(res.status).toBe(409);
  });

  it("blocks publishing a draft that fails validation", async () => {
    const bad = structuredClone(cfg);
    bad.laborMatrix.kitchen = [40, 30, 60, 85]; // non-monotone
    handler = (text) => {
      if (text.includes("SELECT * FROM pricing_versions WHERE id")) {
        return [{ id: "v1", status: "draft", config: bad, service_area: "default", currency: "USD", inference_provenance: "cold_start" }];
      }
      return [];
    };
    const r = await router();
    const res = await r.request(
      "/versions/6b9d1a1e-0000-4000-8000-000000000001/publish",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeSummary: "test publish" }) },
      ENV,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("rejects scheduling in the past", async () => {
    handler = (text) => {
      if (text.includes("SELECT * FROM pricing_versions WHERE id")) {
        return [{ id: "v1", status: "draft", config: cfg, service_area: "default", currency: "USD", inference_provenance: "cold_start" }];
      }
      return [];
    };
    const r = await router();
    const res = await r.request(
      "/versions/6b9d1a1e-0000-4000-8000-000000000001/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeSummary: "test publish", effectiveAt: "2020-01-01T00:00:00Z" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it("lists MCP sandbox proposals without config bodies", async () => {
    handler = (text) => {
      if (text.includes("FROM mcp_simulator_configs")) {
        return [
          {
            id: "5a9d1a1e-0000-4000-8000-00000000000a",
            admin_email: "owner@getsweepr.com",
            name: "fall-rates",
            notes: "raise rate to $70",
            based_on_version_id: null,
            created_at: "2026-08-30",
            updated_at: "2026-08-31",
          },
        ];
      }
      return [];
    };
    const r = await router();
    const res = await r.request("/proposals", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposals: Array<{ name: string }> };
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].name).toBe("fall-rates");
    // The listing query must not fetch config bodies (word-boundary check —
    // the table name itself contains "configs").
    const listCall = sqlCalls.find((c) => c.text.includes("FROM mcp_simulator_configs"));
    expect(listCall!.text).not.toMatch(/\bconfig\b/);
  });

  it("imports a proposal as a pre-filled draft and records mcp provenance in the audit trail", async () => {
    handler = (text) => {
      if (text.includes("FROM mcp_simulator_configs WHERE id")) {
        return [
          {
            id: "5a9d1a1e-0000-4000-8000-00000000000a",
            admin_email: "owner@getsweepr.com",
            name: "fall-rates",
            config: cfg,
            notes: "raise rate to $70",
            based_on_version_id: null,
            updated_at: "2026-08-31",
          },
        ];
      }
      if (text.includes("INSERT INTO pricing_versions")) {
        return [{ id: "new-draft-1", name: "fall-rates", status: "draft" }];
      }
      return [];
    };
    const r = await router();
    const res = await r.request(
      "/proposals/5a9d1a1e-0000-4000-8000-00000000000a/import",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      ENV,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { version: { id: string }; validation: { ok: boolean } };
    expect(body.version.id).toBe("new-draft-1");
    expect(body.validation.ok).toBe(true);
    // The draft is created with the proposal's full config (autofill source)…
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO pricing_versions"));
    expect(insert).toBeDefined();
    expect(insert!.values.some((v) => typeof v === "string" && v.includes("laborMatrix"))).toBe(true);
    // …and provenance lands in the append-only audit trail.
    const audit = sqlCalls.find((c) => c.text.includes("INSERT INTO pricing_audit_events"));
    expect(audit).toBeDefined();
    const detail = audit!.values.find((v) => typeof v === "string" && v.includes("mcp_proposal")) as string;
    expect(detail).toBeDefined();
    expect(JSON.parse(detail)).toMatchObject({
      source: "mcp_proposal",
      proposalName: "fall-rates",
      proposalAdmin: "owner@getsweepr.com",
    });
  });

  it("import refuses unknown or malformed proposal ids", async () => {
    handler = () => [];
    const r = await router();
    const missing = await r.request(
      "/proposals/5a9d1a1e-0000-4000-8000-00000000000b/import",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      ENV,
    );
    expect(missing.status).toBe(404);
    const malformed = await r.request(
      "/proposals/not-a-uuid/import",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      ENV,
    );
    expect(malformed.status).toBe(400);
    // Neither attempt may create a version.
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO pricing_versions"))).toBe(false);
  });

  it("preview rejects an invalid inline config instead of quoting with it", async () => {
    const bad = structuredClone(cfg);
    bad.rates.customerLaborRateCentsPerHour = -5;
    const r = await router();
    const res = await r.request(
      "/preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: bad,
          input: {
            serviceArea: "default",
            currency: "USD",
            counts: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
            conditions: { kitchen: 1, bathroom: 1, bedroom: 1, living_room: 1 },
            extras: [],
          },
        }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });
});
