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
import { ADD_ONS, calculateQuote, type QuoteInput } from "@sweepr/utils";
import {
  calculateBookingPrice,
  getAddOnCatalogue,
  UnknownAddOnError,
  type BookingPriceInput,
} from "../src/lib/pricingEngine";
import {
  isEmergencyBooking,
  computeArrivalInstant,
  EMERGENCY_SURCHARGE_RATE,
} from "../src/routes/bookings";

const baseInput: BookingPriceInput = {
  serviceType: "standard",
  bedrooms: 2,
  bathrooms: 1,
  sqft: 1200,
  homeType: "apartment",
  hasPets: false,
  heavyMess: false,
  suppliesNeeded: false,
  addOnKeys: [],
};

describe("finding 1 — add-on catalogue is shared and fully priced", () => {
  it("every canonical client ADD_ONS key is priced > 0 by the legacy engine", () => {
    for (const addOn of ADD_ONS) {
      const price = calculateBookingPrice({ ...baseInput, addOnKeys: [addOn.key] });
      const delta = price.addonsTotal;
      expect(delta, `add-on ${addOn.key} must be priced`).toBe(Math.round(addOn.price * 100));
      expect(delta).toBeGreaterThan(0);
    }
  });

  it("getAddOnCatalogue exposes exactly the canonical key set with cent prices", () => {
    const cat = getAddOnCatalogue();
    for (const addOn of ADD_ONS) {
      expect(cat[addOn.key]).toBeDefined();
      expect(cat[addOn.key].priceCents).toBe(Math.round(addOn.price * 100));
    }
    expect(Object.keys(cat).sort()).toEqual(ADD_ONS.map((a) => a.key).sort());
  });

  it("an unknown add-on key throws (surfaced as 400) instead of silent $0", () => {
    expect(() =>
      calculateBookingPrice({ ...baseInput, addOnKeys: ["window_interior"] }),
    ).toThrow(UnknownAddOnError);
    expect(() =>
      calculateBookingPrice({ ...baseInput, addOnKeys: ["totally_made_up"] }),
    ).toThrow(UnknownAddOnError);
  });
});

describe("finding 3 — emergency/rush surcharge", () => {
  it("detects same/next-day bookings server-side from the schedule", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    // Tomorrow within 48h → emergency.
    expect(isEmergencyBooking("2026-07-10T12:00:00Z", now)).toBe(true);
    // Same day → emergency.
    expect(isEmergencyBooking("2026-07-09T20:00:00Z", now)).toBe(true);
    // A week out → not emergency.
    expect(isEmergencyBooking("2026-07-16T12:00:00Z", now)).toBe(false);
  });

  it("calculateQuote applies the 15% rush on top of the base total", () => {
    const input: QuoteInput = {
      serviceType: "standard",
      home: { bedrooms: 2, bathrooms: 1, sqft: 1200, homeType: "apartment", pets: false },
      addOnKeys: [],
    };
    const normal = calculateQuote(input);
    const rush = calculateQuote({ ...input, isEmergency: true });
    const expectedRush = Math.round(normal.total * EMERGENCY_SURCHARGE_RATE * 100) / 100;
    expect(rush.total).toBeCloseTo(normal.total + expectedRush, 2);
    expect(rush.lineItems.some((li) => li.label === "Rush fee")).toBe(true);
  });
});

describe("finding 4 — level surcharge applied on the grossed, charm-rounded base", () => {
  it("client preview computes the level surcharge on the base total", () => {
    const input: QuoteInput = {
      serviceType: "standard",
      home: { bedrooms: 2, bathrooms: 1, sqft: 1200, homeType: "apartment", pets: false },
      addOnKeys: [],
    };
    const refresh = calculateQuote({ ...input, cleaningLevel: "refresh" });
    const extra = calculateQuote({ ...input, cleaningLevel: "extra_attention" });
    // extra_attention default = 15% on the base (refresh) total.
    const expected = refresh.total + Math.round(refresh.total * 15) / 100;
    expect(extra.total).toBeCloseTo(expected, 2);
  });
});

describe("finding 5 — arrival-window timezone", () => {
  it("keeps the LOCAL date for an evening booking in a negative-offset zone", () => {
    // Customer in America/Chicago (CDT, -05:00 → -300 min) books an 18:00
    // window on 2026-07-10. Client sends a UTC scheduledAt (2026-07-10 evening
    // local = 2026-07-10T23:00Z) plus the offset. The instant must land on the
    // local date, NOT roll to 2026-07-11.
    const scheduledAt = "2026-07-10T23:30:00.000Z";
    const instant = computeArrivalInstant(scheduledAt, "18:00", -300);
    // 18:00 -05:00 == 23:00Z on the same calendar day.
    expect(instant).toBe("2026-07-10T23:00:00.000Z");
  });

  it("derives the offset from the scheduledAt string when none is passed", () => {
    const instant = computeArrivalInstant("2026-07-10T19:00:00-05:00", "08:00");
    // 08:00 -05:00 == 13:00Z, still 2026-07-10.
    expect(instant).toBe("2026-07-10T13:00:00.000Z");
  });

  it("trusts a bare-UTC scheduledAt (no offset info) as the instant", () => {
    const scheduledAt = "2026-07-10T23:00:00.000Z";
    expect(computeArrivalInstant(scheduledAt, "18:00")).toBe(scheduledAt);
  });

  it("returns scheduledAt unchanged when no arrival window is chosen", () => {
    const scheduledAt = "2026-07-10T15:00:00.000Z";
    expect(computeArrivalInstant(scheduledAt, undefined, -300)).toBe(scheduledAt);
  });
});
