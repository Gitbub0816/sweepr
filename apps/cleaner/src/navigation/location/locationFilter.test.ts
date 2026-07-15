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
import { filterLocation } from "./locationFilter";
import type { RawLocation } from "../types/navigation";

function raw(overrides: Partial<RawLocation>): RawLocation {
  return {
    coordinate: { lat: 37.7749, lng: -122.4194 },
    accuracyMeters: 10,
    headingDegrees: null,
    speedMps: null,
    timestamp: 1_000_000,
    ...overrides,
  };
}

describe("filterLocation", () => {
  it("accepts the first fix even with mediocre accuracy", () => {
    const result = filterLocation(raw({ accuracyMeters: 90 }), null);
    expect(result.rejected).toBe(false);
  });

  it("accepts a good, plausible fix following a previous one", () => {
    const previous = { ...raw({ timestamp: 1_000_000 }), rejected: false };
    const next = raw({
      coordinate: { lat: 37.775, lng: -122.4194 },
      timestamp: 1_005_000,
    });
    const result = filterLocation(next, previous);
    expect(result.rejected).toBe(false);
  });

  it("rejects an impossibly fast implied-speed jump", () => {
    const previous = { ...raw({ timestamp: 1_000_000 }), rejected: false };
    // ~1.1km jump in 1 second => ~1100 m/s, far beyond plausible.
    const next = raw({
      coordinate: { lat: 37.7849, lng: -122.4194 },
      timestamp: 1_001_000,
    });
    const result = filterLocation(next, previous);
    expect(result.rejected).toBe(true);
    expect(result.rejectReason).toBe("implausible-speed");
  });

  it("rejects a stale timestamp older than the previous fix", () => {
    const previous = { ...raw({ timestamp: 1_000_000 }), rejected: false };
    const next = raw({ timestamp: 999_000 });
    const result = filterLocation(next, previous);
    expect(result.rejected).toBe(true);
    expect(result.rejectReason).toBe("stale");
  });

  it("rejects a poor-accuracy fix when a better recent fix already exists", () => {
    const previous = { ...raw({ timestamp: 1_000_000, accuracyMeters: 5 }), rejected: false };
    const next = raw({ timestamp: 1_001_000, accuracyMeters: 150 });
    const result = filterLocation(next, previous);
    expect(result.rejected).toBe(true);
    expect(result.rejectReason).toBe("accuracy");
  });

  it("derives heading from two points when raw heading is null and movement is real", () => {
    const previous = { ...raw({ timestamp: 1_000_000, headingDegrees: null }), rejected: false };
    // ~55m north of previous — well above the jitter threshold.
    const next = raw({
      coordinate: { lat: 37.7754, lng: -122.4194 },
      timestamp: 1_010_000,
      headingDegrees: null,
    });
    const result = filterLocation(next, previous);
    expect(result.headingDegrees).not.toBeNull();
    expect(result.headingDegrees!).toBeCloseTo(0, 0);
  });

  it("does not derive heading from near-identical points (stationary jitter)", () => {
    const previous = { ...raw({ timestamp: 1_000_000, headingDegrees: null }), rejected: false };
    // Sub-meter jitter, not real movement.
    const next = raw({
      coordinate: { lat: 37.77490001, lng: -122.4194 },
      timestamp: 1_010_000,
      headingDegrees: null,
    });
    const result = filterLocation(next, previous);
    expect(result.headingDegrees).toBeNull();
  });
});
