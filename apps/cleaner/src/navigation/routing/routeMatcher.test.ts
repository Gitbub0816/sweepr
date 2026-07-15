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
import { buildCumulativeDistances, interpolateCoordinate } from "./routeGeometry";
import { matchLocationToRoute } from "./routeMatcher";
import type { NavigationRoute } from "../types/navigation";

function makeStraightRoute(points = 50, spacingDeg = 0.0005): NavigationRoute {
  // Runs due east along lat=0.
  const path = Array.from({ length: points }, (_, i) => ({ lat: 0, lng: i * spacingDeg }));
  const cumulativeDistances = buildCumulativeDistances(path);
  return {
    id: "test",
    name: "test",
    totalDistanceMeters: cumulativeDistances[cumulativeDistances.length - 1],
    expectedTravelTimeSeconds: 600,
    steps: [{ instruction: "Start", distanceMeters: 0, geometry: [], cumulativeDistanceMeters: 0 }],
    path,
    cumulativeDistances,
  };
}

describe("matchLocationToRoute", () => {
  it("matches a point directly on the route with high confidence", () => {
    const route = makeStraightRoute();
    const point = route.path[25];
    const result = matchLocationToRoute(point, route, null, { accuracyMeters: 5, headingDegrees: 90, speedMps: 10 });
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("does not snap backward past the forward-progress hint without cause", () => {
    const route = makeStraightRoute();
    const previousMatch = {
      matched: true,
      coordinate: route.path[30],
      segmentIndex: 30,
      distanceFromRouteMeters: 2,
      cumulativeDistanceMeters: route.cumulativeDistances[30],
      confidence: 0.9,
    };
    // A point far behind (near the route start) shouldn't be accepted as a
    // forward match given the previous match was near index 30.
    const behindPoint = route.path[2];
    const result = matchLocationToRoute(behindPoint, route, previousMatch, {
      accuracyMeters: 5,
      headingDegrees: 90,
      speedMps: 10,
    });
    expect(result.matched).toBe(false);
  });

  it("allows a small backward tolerance for genuine GPS drift", () => {
    const route = makeStraightRoute();
    const previousMatch = {
      matched: true,
      coordinate: route.path[30],
      segmentIndex: 30,
      distanceFromRouteMeters: 2,
      cumulativeDistanceMeters: route.cumulativeDistances[30],
      confidence: 0.9,
    };
    // A point just slightly behind (a few meters) — within drift tolerance.
    const nearbyBehind = interpolateCoordinate(route.path[29], route.path[30], 0.7);
    const result = matchLocationToRoute(nearbyBehind, route, previousMatch, {
      accuracyMeters: 5,
      headingDegrees: 90,
      speedMps: 5,
    });
    expect(result.matched).toBe(true);
  });

  it("rejects (low confidence) a point on a clearly parallel/opposite-direction road", () => {
    const route = makeStraightRoute();
    // Slightly off the route (parallel road) with a heading opposite the
    // route's direction of travel (route runs east/90deg; this "vehicle" is
    // heading west/270deg, as if on a parallel road going the other way).
    const parallelPoint = { lat: 0.00055, lng: route.path[25].lng };
    const result = matchLocationToRoute(parallelPoint, route, null, {
      accuracyMeters: 5,
      headingDegrees: 270,
      speedMps: 10,
    });
    expect(result.matched).toBe(false);
  });
});
