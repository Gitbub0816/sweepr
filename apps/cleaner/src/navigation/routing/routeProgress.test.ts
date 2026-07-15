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
import { buildCumulativeDistances } from "./routeGeometry";
import { computeRouteProgress } from "./routeProgress";
import type { NavigationRoute } from "../types/navigation";

function makeRoute(): NavigationRoute {
  const path = Array.from({ length: 11 }, (_, i) => ({ lat: 0, lng: i * 0.001 }));
  const cumulativeDistances = buildCumulativeDistances(path);
  const total = cumulativeDistances[cumulativeDistances.length - 1];
  return {
    id: "test",
    name: "test",
    totalDistanceMeters: total,
    expectedTravelTimeSeconds: 1000,
    steps: [
      { instruction: "Start", distanceMeters: 0, geometry: [], cumulativeDistanceMeters: 0 },
      { instruction: "Turn left", distanceMeters: 0, geometry: [], cumulativeDistanceMeters: cumulativeDistances[5] },
      { instruction: "Arrive", distanceMeters: 0, geometry: [], cumulativeDistanceMeters: cumulativeDistances[9] },
    ],
    path,
    cumulativeDistances,
  };
}

describe("computeRouteProgress", () => {
  it("computes distance traveled and remaining", () => {
    const route = makeRoute();
    const progress = computeRouteProgress(route, route.cumulativeDistances[5]);
    expect(progress.distanceTraveledMeters).toBeCloseTo(route.cumulativeDistances[5], 3);
    expect(progress.distanceRemainingMeters).toBeCloseTo(route.totalDistanceMeters - route.cumulativeDistances[5], 3);
  });

  it("resolves the current step index for the given distance", () => {
    const route = makeRoute();
    const progress = computeRouteProgress(route, route.cumulativeDistances[6]);
    expect(progress.currentStepIndex).toBe(1);
  });

  it("computes distance to the next maneuver as distance to the next step start", () => {
    const route = makeRoute();
    const progress = computeRouteProgress(route, route.cumulativeDistances[3]);
    expect(progress.distanceToNextManeuverMeters).toBeCloseTo(route.cumulativeDistances[5] - route.cumulativeDistances[3], 3);
  });

  it("computes ETA proportionally to distance remaining", () => {
    const route = makeRoute();
    const halfway = route.totalDistanceMeters / 2;
    const progress = computeRouteProgress(route, halfway);
    expect(progress.remainingDurationSeconds).toBeCloseTo(500, 0);
    expect(progress.estimatedArrival.getTime()).toBeGreaterThan(Date.now());
  });

  it("guards against divide-by-zero when total distance is zero", () => {
    const route = makeRoute();
    route.totalDistanceMeters = 0;
    const progress = computeRouteProgress(route, 0);
    expect(progress.remainingDurationSeconds).toBe(0);
    expect(Number.isFinite(progress.remainingDurationSeconds)).toBe(true);
  });
});
