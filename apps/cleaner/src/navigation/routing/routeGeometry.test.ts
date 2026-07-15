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
import {
  bearingBetween,
  buildCumulativeDistances,
  haversineDistanceMeters,
  interpolateAngleDegrees,
  interpolateCoordinate,
  lookAheadPoint,
  normalizeAngleDegrees,
  projectPointOntoRoute,
  projectPointOntoSegment,
  shortestAngleDelta,
  stepIndexForCumulativeDistance,
} from "./routeGeometry";
import type { NavigationRoute } from "../types/navigation";

describe("bearingBetween", () => {
  it("computes due north as 0 degrees", () => {
    const bearing = bearingBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(bearing).toBeCloseTo(0, 0);
  });

  it("computes due east as 90 degrees", () => {
    const bearing = bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(bearing).toBeCloseTo(90, 0);
  });
});

describe("normalizeAngleDegrees", () => {
  it("wraps negative angles into [0, 360)", () => {
    expect(normalizeAngleDegrees(-10)).toBeCloseTo(350, 5);
  });

  it("wraps angles above 360 into [0, 360)", () => {
    expect(normalizeAngleDegrees(370)).toBeCloseTo(10, 5);
  });
});

describe("shortestAngleDelta", () => {
  it("handles the 359 -> 1 wrap as +2, not -358", () => {
    expect(shortestAngleDelta(359, 1)).toBeCloseTo(2, 5);
  });

  it("handles the 1 -> 359 wrap as -2, not +358", () => {
    expect(shortestAngleDelta(1, 359)).toBeCloseTo(-2, 5);
  });

  it("returns 0 for identical angles", () => {
    expect(shortestAngleDelta(45, 45)).toBeCloseTo(0, 5);
  });
});

describe("interpolateAngleDegrees", () => {
  it("interpolates the short way across the wrap", () => {
    const result = interpolateAngleDegrees(359, 1, 0.5);
    expect(normalizeAngleDegrees(result)).toBeCloseTo(0, 0);
  });

  it("interpolates halfway between two normal angles", () => {
    expect(interpolateAngleDegrees(10, 30, 0.5)).toBeCloseTo(20, 5);
  });
});

describe("interpolateCoordinate", () => {
  it("returns the start point at t=0 and end point at t=1", () => {
    const a = { lat: 10, lng: 20 };
    const b = { lat: 12, lng: 24 };
    expect(interpolateCoordinate(a, b, 0)).toEqual(a);
    expect(interpolateCoordinate(a, b, 1)).toEqual(b);
  });

  it("interpolates the midpoint at t=0.5", () => {
    const result = interpolateCoordinate({ lat: 0, lng: 0 }, { lat: 2, lng: 4 }, 0.5);
    expect(result).toEqual({ lat: 1, lng: 2 });
  });
});

describe("projectPointOntoSegment", () => {
  it("projects a point directly onto the middle of a segment", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 0.01 };
    const point = { lat: 0.0001, lng: 0.005 };
    const result = projectPointOntoSegment(point, a, b);
    expect(result.t).toBeCloseTo(0.5, 1);
    expect(result.distanceMeters).toBeGreaterThan(0);
  });

  it("clamps to the segment endpoints when the point projects outside", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 0.01 };
    const beforeA = { lat: 0, lng: -0.01 };
    expect(projectPointOntoSegment(beforeA, a, b).t).toBe(0);
  });
});

describe("buildCumulativeDistances", () => {
  it("starts at zero and monotonically increases", () => {
    const path = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
    ];
    const cumulative = buildCumulativeDistances(path);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[1]).toBeGreaterThan(0);
    expect(cumulative[2]).toBeGreaterThan(cumulative[1]);
  });
});

function makeStraightRoute(points: number, spacingDeg = 0.001): NavigationRoute {
  const path = Array.from({ length: points }, (_, i) => ({ lat: 0, lng: i * spacingDeg }));
  const cumulativeDistances = buildCumulativeDistances(path);
  return {
    id: "test",
    name: "test",
    totalDistanceMeters: cumulativeDistances[cumulativeDistances.length - 1],
    expectedTravelTimeSeconds: 600,
    steps: [
      { instruction: "Start", distanceMeters: 0, geometry: [], cumulativeDistanceMeters: 0 },
      {
        instruction: "Continue",
        distanceMeters: 0,
        geometry: [],
        cumulativeDistanceMeters: cumulativeDistances[Math.floor(points / 2)],
      },
    ],
    path,
    cumulativeDistances,
  };
}

describe("projectPointOntoRoute", () => {
  it("projects onto the nearest segment using a forward-progress hint", () => {
    const route = makeStraightRoute(50);
    const point = { lat: 0.00005, lng: route.path[25].lng };
    const result = projectPointOntoRoute(point, route, 24);
    expect(result).not.toBeNull();
    expect(result!.segmentIndex).toBeGreaterThanOrEqual(20);
    expect(result!.segmentIndex).toBeLessThanOrEqual(30);
  });

  it("returns null for a degenerate single-point path", () => {
    const route = makeStraightRoute(1);
    expect(projectPointOntoRoute({ lat: 0, lng: 0 }, route)).toBeNull();
  });
});

describe("lookAheadPoint", () => {
  it("returns a point further along the route", () => {
    const route = makeStraightRoute(50);
    const point = lookAheadPoint(route, 0, 50);
    expect(point.lng).toBeGreaterThan(route.path[0].lng);
  });

  it("clamps to the route end when look-ahead exceeds remaining distance", () => {
    const route = makeStraightRoute(50);
    const total = route.cumulativeDistances[route.cumulativeDistances.length - 1];
    const point = lookAheadPoint(route, total - 1, 10_000);
    expect(point).toEqual(route.path[route.path.length - 1]);
  });
});

describe("stepIndexForCumulativeDistance", () => {
  it("returns the last step whose start is at or before the given distance", () => {
    const route = makeStraightRoute(50);
    const midStart = route.steps[1].cumulativeDistanceMeters;
    expect(stepIndexForCumulativeDistance(route, midStart + 1)).toBe(1);
    expect(stepIndexForCumulativeDistance(route, midStart - 1)).toBe(0);
  });
});

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });
});
