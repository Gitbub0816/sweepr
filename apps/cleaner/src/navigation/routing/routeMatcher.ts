/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { bearingBetween, projectPointOntoRoute } from "./routeGeometry";
import type { Coordinate, NavigationRoute, RouteMatchResult } from "../types/navigation";

/** Beyond this distance from the route, confidence drops to zero regardless
 *  of other factors. */
const MAX_ROUTE_DISTANCE_METERS = 60;

/** GPS accuracy worse than this contributes no confidence — a fix this poor
 *  can't reliably confirm which parallel road the vehicle is on. */
const MAX_USEFUL_ACCURACY_METERS = 50;

/** Below this confidence, we don't force a snap — callers should fall back
 *  to the raw filtered position instead of guessing. */
const MIN_MATCH_CONFIDENCE = 0.35;

/** Small backward tolerance (meters) along the route for GPS drift or a
 *  genuine U-turn, before we reject a match as "behind" the previous one. */
const BACKWARD_TOLERANCE_METERS = 30;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Matches a live location onto the route polyline, using the previous
 * match's segment index as a forward-progress hint so we don't snap
 * backward or onto a parallel/opposite-direction road. Returns
 * `matched: false` when confidence is too low to trust the snap — callers
 * should fall back to the raw filtered position in that case.
 */
export function matchLocationToRoute(
  location: Coordinate,
  route: NavigationRoute,
  previousMatch: RouteMatchResult | null,
  opts: { accuracyMeters: number; headingDegrees: number | null; speedMps: number | null }
): RouteMatchResult {
  const hintSegmentIndex = previousMatch?.segmentIndex;
  const projection = projectPointOntoRoute(location, route, hintSegmentIndex);

  if (!projection) {
    return {
      matched: false,
      coordinate: location,
      segmentIndex: previousMatch?.segmentIndex ?? 0,
      distanceFromRouteMeters: Infinity,
      cumulativeDistanceMeters: previousMatch?.cumulativeDistanceMeters ?? 0,
      confidence: 0,
    };
  }

  // Forward-progress enforcement: reject (low confidence) a projection that
  // falls meaningfully behind the previous match, unless within tolerance
  // (GPS drift / a genuine U-turn we'll pick up again on the next fix).
  if (previousMatch && previousMatch.matched) {
    const backwardDelta = previousMatch.cumulativeDistanceMeters - projection.cumulativeDistanceMeters;
    if (backwardDelta > BACKWARD_TOLERANCE_METERS) {
      return {
        matched: false,
        coordinate: projection.closest,
        segmentIndex: previousMatch.segmentIndex,
        distanceFromRouteMeters: projection.distanceFromRouteMeters,
        cumulativeDistanceMeters: previousMatch.cumulativeDistanceMeters,
        confidence: 0,
      };
    }
  }

  const distanceScore = clamp01(1 - projection.distanceFromRouteMeters / MAX_ROUTE_DISTANCE_METERS);
  const accuracyScore = clamp01(1 - opts.accuracyMeters / MAX_USEFUL_ACCURACY_METERS);

  let headingScore = 1;
  if (opts.headingDegrees != null) {
    const { path } = route;
    const segStart = path[projection.segmentIndex];
    const segEnd = path[Math.min(projection.segmentIndex + 1, path.length - 1)];
    const segmentBearing = bearingBetween(segStart, segEnd);
    let delta = Math.abs(opts.headingDegrees - segmentBearing) % 360;
    if (delta > 180) delta = 360 - delta;
    // 0 delta => aligned (score 1); 180 delta (opposite direction road) => 0.
    headingScore = clamp01(1 - delta / 180);
  }

  const confidence = clamp01(distanceScore * 0.5 + accuracyScore * 0.2 + headingScore * 0.3);

  if (confidence < MIN_MATCH_CONFIDENCE) {
    return {
      matched: false,
      coordinate: projection.closest,
      segmentIndex: projection.segmentIndex,
      distanceFromRouteMeters: projection.distanceFromRouteMeters,
      cumulativeDistanceMeters: projection.cumulativeDistanceMeters,
      confidence,
    };
  }

  return {
    matched: true,
    coordinate: projection.closest,
    segmentIndex: projection.segmentIndex,
    distanceFromRouteMeters: projection.distanceFromRouteMeters,
    cumulativeDistanceMeters: projection.cumulativeDistanceMeters,
    confidence,
  };
}
