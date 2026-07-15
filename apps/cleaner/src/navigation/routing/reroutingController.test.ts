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
import { createRerouteRateLimiter, evaluateOffRoute } from "./reroutingController";
import type { FilteredLocation, RouteMatchResult } from "../types/navigation";

function filtered(overrides: Partial<FilteredLocation> = {}): FilteredLocation {
  return {
    coordinate: { lat: 0, lng: 0 },
    accuracyMeters: 10,
    headingDegrees: null,
    speedMps: 5,
    timestamp: Date.now(),
    rejected: false,
    ...overrides,
  };
}

function offRouteMatch(distanceFromRouteMeters: number): RouteMatchResult {
  return {
    matched: false,
    coordinate: { lat: 0, lng: 0 },
    segmentIndex: 0,
    distanceFromRouteMeters,
    cumulativeDistanceMeters: 0,
    confidence: 0.1,
  };
}

describe("evaluateOffRoute", () => {
  it("requires multiple consecutive samples before confirming deviation", () => {
    let count = 0;
    let state = evaluateOffRoute(offRouteMatch(100), filtered(), count, 0);
    expect(state.state).toBe("possible-deviation");
    count = state.consecutiveOffRouteCount;

    state = evaluateOffRoute(offRouteMatch(100), filtered(), count, 0);
    expect(state.state).toBe("possible-deviation");
    count = state.consecutiveOffRouteCount;

    state = evaluateOffRoute(offRouteMatch(100), filtered(), count, 0);
    count = state.consecutiveOffRouteCount;

    state = evaluateOffRoute(offRouteMatch(100), filtered(), count, 0);
    expect(state.state).toBe("confirmed-deviation");
  });

  it("does not confirm deviation from a single noisy off-route sample", () => {
    const state = evaluateOffRoute(offRouteMatch(100), filtered(), 0, 0);
    expect(state.state).not.toBe("confirmed-deviation");
  });

  it("resets to on-route when the sample matches the route again", () => {
    const onRouteMatch: RouteMatchResult = {
      matched: true,
      coordinate: { lat: 0, lng: 0 },
      segmentIndex: 0,
      distanceFromRouteMeters: 2,
      cumulativeDistanceMeters: 10,
      confidence: 0.9,
    };
    const state = evaluateOffRoute(onRouteMatch, filtered(), 3, 0);
    expect(state.state).toBe("on-route");
    expect(state.consecutiveOffRouteCount).toBe(0);
  });

  it("does not flag deviation off a low-accuracy fix", () => {
    const state = evaluateOffRoute(offRouteMatch(200), filtered({ accuracyMeters: 200 }), 0, 0);
    expect(state.state).toBe("on-route");
  });
});

describe("createRerouteRateLimiter", () => {
  it("blocks overlapping reroute requests while one is pending", () => {
    let now = 0;
    const limiter = createRerouteRateLimiter(() => now);
    expect(limiter.shouldReroute()).toBe(true);
    limiter.markRerouteStarted();
    now += 1000;
    expect(limiter.shouldReroute()).toBe(false);
  });

  it("enforces the minimum interval between reroute requests", () => {
    let now = 0;
    const limiter = createRerouteRateLimiter(() => now);
    limiter.markRerouteStarted();
    limiter.markRerouteFinished();
    now += 5000; // well under the 15s minimum interval
    expect(limiter.shouldReroute()).toBe(false);
    now += 11_000; // now 16s since last reroute
    expect(limiter.shouldReroute()).toBe(true);
  });

  it("allows a new reroute once the previous one finishes and the interval has passed", () => {
    let now = 0;
    const limiter = createRerouteRateLimiter(() => now);
    limiter.markRerouteStarted();
    limiter.markRerouteFinished();
    now += 20_000;
    expect(limiter.shouldReroute()).toBe(true);
  });
});
