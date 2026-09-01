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
 * Service-adapter coverage for the extended (formatVersion 2) ruleset:
 * wire service-type routing, short-notice hours derivation, and the Airbnb
 * repeat/volume discount resolved from mocked booking-history queries
 * (precedence: host volume over repeat property; highest only, never
 * stacking; failure-safe).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildColdStartConfig, unwrapPricingRuleset } from "../src/lib/quoteEngine";
import {
  assembleV2Pricing,
  buildQuoteInputFromBooking,
  hasDeepCleanMarker,
  hoursUntil,
  mapWireServiceType,
  resolveAirbnbDiscount,
} from "../src/lib/quoteEngine/bookingAdapter";
import { clearActivePricingVersionCache } from "../src/lib/quoteEngine/service";
import type { Sql } from "@sweepr/db";

vi.mock("../src/lib/foundingMember", () => ({
  foundingCustomerDiscountPct: vi.fn(async () => 0),
}));

const masterConfig = unwrapPricingRuleset(
  JSON.parse(readFileSync(join(__dirname, "fixtures", "master-pricing-ruleset.json"), "utf8")),
).config;

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

/** Active master config + configurable completed-turnover history counts. */
function historyHandler(counts: { volume30d: number; sameProperty: number }): Handler {
  return (text) => {
    if (text.includes("FROM pricing_versions")) {
      return [{ id: "ver-ext", name: "Master", config: masterConfig }];
    }
    if (text.includes("INSERT INTO pricing_quotes_v2")) return [{ id: "quote-ext" }];
    if (text.includes("COUNT(*)") && text.includes("INTERVAL '30 days'")) {
      return [{ n: counts.volume30d }];
    }
    if (text.includes("COUNT(*)") && text.includes("address_id")) {
      return [{ n: counts.sameProperty }];
    }
    return [];
  };
}

beforeEach(() => {
  sqlCalls.length = 0;
  handler = () => [];
  clearActivePricingVersionCache();
});

describe("wire service-type mapping", () => {
  it("maps the booking taxonomy onto the three engine paths", () => {
    expect(mapWireServiceType("move_in_out")).toBe("moveInOut");
    expect(mapWireServiceType("vacation_rental")).toBe("airbnb");
    for (const t of ["light", "standard", "deep", "recurring", "post_construction", undefined]) {
      expect(mapWireServiceType(t)).toBe("standard");
    }
  });

  it("hoursUntil derives non-negative hours server-side", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    expect(hoursUntil("2026-09-02T12:00:00Z", now)).toBe(24);
    expect(hoursUntil("2026-09-01T06:00:00Z", now)).toBe(0);
    expect(hoursUntil("not-a-date", now)).toBeUndefined();
    expect(hoursUntil(undefined, now)).toBeUndefined();
  });

  it("legacy standard input builds without any formatVersion-2 keys", () => {
    const input = buildQuoteInputFromBooking(
      {
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1600,
        addOnKeys: [],
        rooms: [{ roomType: "kitchen", level: "level_2" }],
      },
      { emergency: false, zipMultiplierPct: 0 },
    );
    const json = JSON.stringify(input);
    for (const key of ["serviceType", "conditionLevel", "hoursUntilService", "petHair"]) {
      expect(json).not.toContain(`"${key}"`);
    }
  });

  it("matrix input carries serviceType, allows studios, and derives the condition level", () => {
    const input = buildQuoteInputFromBooking(
      {
        bedrooms: 0,
        bathrooms: 1,
        sqft: 550,
        addOnKeys: [],
        serviceType: "vacation_rental",
        cleaningLevel: "extra_attention",
      },
      { emergency: false, zipMultiplierPct: 0, serviceType: "airbnb", hoursUntilService: 30 },
    );
    expect(input.serviceType).toBe("airbnb");
    expect(input.counts.bedroom).toBe(0); // studio
    expect(input.conditionLevel).toBe(3); // extra_attention fallback
    expect(input.hoursUntilService).toBe(30);
  });

  it("a legacy pet_hair_detail add-on maps to the moderate percentage tier", () => {
    const input = buildQuoteInputFromBooking(
      {
        bedrooms: 2,
        bathrooms: 1,
        sqft: 1000,
        addOnKeys: ["pet_hair_detail", "inside_oven"],
        rooms: [{ roomType: "kitchen", level: "level_2" }],
      },
      { emergency: false, zipMultiplierPct: 0 },
    );
    expect(input.petHair).toBe("moderate");
    expect(input.extras).toEqual([{ key: "inside_oven", quantity: 1 }]);
  });
});

describe("airbnb repeat/volume discount resolution (history mocks)", () => {
  const rules = masterConfig.extendedRules!.airbnbSTR!;

  it("no history: no discount (first turnover at a property is 0%)", async () => {
    handler = historyHandler({ volume30d: 0, sameProperty: 0 });
    const d = await resolveAirbnbDiscount(makeSql(), {
      customerId: "cust-1",
      addressId: "addr-1",
      rules,
    });
    expect(d).toBeUndefined();
  });

  it("second turnover at the SAME property earns 5% (follows the address)", async () => {
    handler = historyHandler({ volume30d: 3, sameProperty: 1 });
    const d = await resolveAirbnbDiscount(makeSql(), {
      customerId: "cust-1",
      addressId: "addr-1",
      rules,
    });
    expect(d).toEqual({ kind: "repeat_property", percent: 5 });
  });

  it("10+ completed turnovers in 30 days wins with 10% (highest only, never stacking)", async () => {
    handler = historyHandler({ volume30d: 10, sameProperty: 4 });
    const d = await resolveAirbnbDiscount(makeSql(), {
      customerId: "cust-1",
      addressId: "addr-1",
      rules,
    });
    expect(d).toEqual({ kind: "host_volume", percent: 10 });
  });

  it("without an addressId only the host-volume discount can apply", async () => {
    handler = historyHandler({ volume30d: 2, sameProperty: 99 });
    const d = await resolveAirbnbDiscount(makeSql(), {
      customerId: "cust-1",
      addressId: null,
      rules,
    });
    expect(d).toBeUndefined();
  });

  it("a history-query failure resolves to no discount, never an error", async () => {
    handler = (text) => {
      if (text.includes("COUNT(*)")) throw new Error("db down");
      return [];
    };
    const d = await resolveAirbnbDiscount(makeSql(), {
      customerId: "cust-1",
      addressId: "addr-1",
      rules,
    });
    expect(d).toBeUndefined();
  });
});

describe("assembleV2Pricing routing", () => {
  it("prices a vacation_rental booking on the airbnb path with the repeat discount line", async () => {
    handler = historyHandler({ volume30d: 0, sameProperty: 2 });
    const out = await assembleV2Pricing(
      makeSql(),
      {
        bedrooms: 2,
        bathrooms: 2,
        sqft: 1100,
        addOnKeys: [],
        serviceType: "vacation_rental",
        cleaningLevel: "refresh",
        addressId: "addr-1",
        scheduledAt: new Date(Date.now() + 100 * 3_600_000).toISOString(),
      },
      { customerId: "cust-1", emergency: false, zipMultiplierPct: 0 },
    );
    expect(out).not.toBeNull();
    expect(out!.result.serviceType).toBe("airbnb");
    // 2BR/2BA base $199 minus the 5% repeat discount ($9.95).
    expect(out!.result.appliedDiscount).toEqual({
      kind: "repeat_property",
      percent: 5,
      amountCents: 995,
    });
    expect(out!.totalPrice).toBe(19900 - 995);
    expect(out!.lineItems.some((li) => li.label.includes("Repeat turnover discount"))).toBe(true);
  });

  it("prices a move_in_out booking from the matrix without rooms", async () => {
    handler = historyHandler({ volume30d: 0, sameProperty: 0 });
    const out = await assembleV2Pricing(
      makeSql(),
      {
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1400,
        addOnKeys: [],
        serviceType: "move_in_out",
        cleaningLevel: "refresh",
        scheduledAt: new Date(Date.now() + 100 * 3_600_000).toISOString(),
      },
      { customerId: null, emergency: false, zipMultiplierPct: 0 },
    );
    expect(out).not.toBeNull();
    expect(out!.result.serviceType).toBe("moveInOut");
    expect(out!.totalPrice).toBe(41900);
  });

  it("short-notice hours flow to the tiered surcharge (26h ahead = 5%)", async () => {
    handler = historyHandler({ volume30d: 0, sameProperty: 0 });
    const out = await assembleV2Pricing(
      makeSql(),
      {
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1400,
        addOnKeys: [],
        serviceType: "move_in_out",
        cleaningLevel: "refresh",
        scheduledAt: new Date(Date.now() + 26 * 3_600_000).toISOString(),
      },
      { customerId: null, emergency: true, zipMultiplierPct: 0 },
    );
    expect(out).not.toBeNull();
    const line = out!.result.components.find((c) => c.code === "adjustment.short_notice");
    expect(line?.label).toContain("5%");
  });

  it("a matrix package on a LEGACY config falls back to the legacy chain (null)", async () => {
    const legacy = buildColdStartConfig();
    handler = (text) => {
      if (text.includes("FROM pricing_versions")) {
        return [{ id: "ver-legacy", name: "Legacy", config: legacy }];
      }
      if (text.includes("INSERT INTO pricing_quotes_v2")) return [{ id: "q" }];
      return [];
    };
    const out = await assembleV2Pricing(
      makeSql(),
      {
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1400,
        addOnKeys: [],
        serviceType: "move_in_out",
        cleaningLevel: "refresh",
      },
      { customerId: null, emergency: false, zipMultiplierPct: 0 },
    );
    expect(out).toBeNull(); // no rooms + standard fallback = legacy chain
  });
});

describe("manual-review booking gate (blocks instant auto-quote)", () => {
  it("blocks the extended triggers and passes flag-only obstructed clutter", async () => {
    const { v2ManualReviewBlock } = await import("../src/routes/bookings");
    const withReasons = (manualReviewRequired: boolean, reasons: string[]) =>
      ({ v2: { result: { manualReviewRequired, manualReviewReasons: reasons } } }) as never;
    // Blocking: sqft / price / unsafe / severe mess / tight turnover window.
    for (const reason of [
      "sqft_over_threshold",
      "price_over_auto_quote_limit",
      "unsafe_conditions",
      "severe_mess",
      "turnover_window_under_4h",
    ]) {
      const msg = v2ManualReviewBlock(withReasons(true, [reason]));
      expect(msg).toContain("review by our team");
      expect(msg).toContain("Nothing has been charged");
    }
    // Obstructed clutter keeps its long-standing flag-and-book behavior.
    expect(v2ManualReviewBlock(withReasons(true, ["obstructed_clutter"]))).toBeNull();
    // No review requirement, or no v2 result at all: never blocked.
    expect(v2ManualReviewBlock(withReasons(false, ["sqft_over_threshold"]))).toBeNull();
    expect(v2ManualReviewBlock({ v2: null } as never)).toBeNull();
  });
});

describe("deep-clean booking stamp", () => {
  it("hasDeepCleanMarker reads the persisted marker and ignores everything else", () => {
    expect(hasDeepCleanMarker([{ label: "deep_clean", applied: true }])).toBe(true);
    expect(
      hasDeepCleanMarker([
        { label: "Cleaning labor", cents: 12000 },
        { label: "deep_clean", applied: true },
        { label: "rooms", rooms: [] },
      ]),
    ).toBe(true);
    expect(hasDeepCleanMarker([{ label: "deep_clean" }])).toBe(false);
    expect(hasDeepCleanMarker([{ label: "rooms" }])).toBe(false);
    expect(hasDeepCleanMarker(null)).toBe(false);
    expect(hasDeepCleanMarker("[]")).toBe(false);
  });

  it("a deep-clean home carries deepCleanApplied on the persisted v2 result", async () => {
    handler = historyHandler({ volume30d: 0, sameProperty: 0 });
    const out = await assembleV2Pricing(
      makeSql(),
      {
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1500,
        addOnKeys: [],
        rooms: [
          { roomType: "kitchen", level: "level_4" },
          { roomType: "bathroom", level: "level_2" },
          { roomType: "bedroom", level: "level_2" },
          { roomType: "living_room", level: "level_2" },
        ],
        scheduledAt: new Date(Date.now() + 100 * 3_600_000).toISOString(),
      },
      { customerId: null, emergency: false, zipMultiplierPct: 0 },
    );
    expect(out).not.toBeNull();
    expect(out!.result.deepCleanApplied).toBe(true);
    // No separate customer-facing surcharge line for the deep clean.
    expect(out!.lineItems.some((li) => li.label.toLowerCase().includes("deep clean"))).toBe(false);
  });
});
