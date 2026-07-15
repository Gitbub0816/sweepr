/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { buildCumulativeDistances } from "./routeGeometry";
import type { Coordinate, NavigationRoute, RouteStep } from "../types/navigation";

/** Raw shape returned by `mapkit.Directions.route()` — see
 *  packages/ui/src/components/NavigationMap.tsx's `fetchRoute` for the
 *  MapKit response this mirrors. Kept file-local; the rest of the app must
 *  never depend on this shape, only on `NavigationRoute`. */
export interface MapKitRawRoute {
  distance: number;
  /** Already in seconds — do not divide by 1000 (a real bug once shipped
   *  here; see NavigationMap.tsx's comment on the same field). */
  expectedTravelTime: number;
  steps: Array<{
    instructions: string;
    distance: number;
    path?: Array<{ latitude: number; longitude: number }>;
  }>;
  path: Array<{ latitude: number; longitude: number }>;
}

function toCoordinate(p: { latitude: number; longitude: number }): Coordinate {
  return { lat: p.latitude, lng: p.longitude };
}

/**
 * Normalizes a raw MapKit route into the app-owned `NavigationRoute` model.
 * Computes each step's `cumulativeDistanceMeters` by locating the step's
 * start coordinate within the route's own cumulative-distance array, so
 * step distances stay consistent with the densified route path used for
 * matching/interpolation.
 */
export function normalizeRoute(mapkitRoute: MapKitRawRoute, id: string): NavigationRoute {
  const path = mapkitRoute.path.map(toCoordinate);
  const cumulativeDistances = buildCumulativeDistances(path);

  const steps: RouteStep[] = mapkitRoute.steps
    .map((step): RouteStep | null => {
      const instruction = step.instructions?.trim() ?? "";
      // MapKit's leading "depart" step usually carries no instruction text —
      // drop it so downstream guidance never announces an empty maneuver.
      if (!instruction) return null;

      const startCoordinate = step.path?.[0] ? toCoordinate(step.path[0]) : path[0];
      const cumulativeDistanceMeters = nearestCumulativeDistance(path, cumulativeDistances, startCoordinate);

      return {
        instruction,
        distanceMeters: step.distance,
        geometry: step.path?.map(toCoordinate) ?? [],
        cumulativeDistanceMeters,
      };
    })
    .filter((s): s is RouteStep => s !== null);

  return {
    id,
    name: `Route ${id}`,
    totalDistanceMeters: mapkitRoute.distance,
    expectedTravelTimeSeconds: mapkitRoute.expectedTravelTime,
    steps,
    path,
    cumulativeDistances,
  };
}

/** Finds the cumulative distance of the route-path point closest to
 *  `target`, by simple nearest-index scan — step start points come directly
 *  from MapKit's own path array, so an exact or near-exact match is typical. */
function nearestCumulativeDistance(path: Coordinate[], cumulativeDistances: number[], target: Coordinate): number {
  let bestIndex = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < path.length; i++) {
    const dLat = path[i].lat - target.lat;
    const dLng = path[i].lng - target.lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }
  return cumulativeDistances[bestIndex];
}
