/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Coordinate, NavigationRoute } from "../types/navigation";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance in meters (haversine). Accurate enough for
 *  route-matching / progress at street/city scale. */
export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing (degrees, 0..360, 0 = north) from a to b. */
export function bearingBetween(a: Coordinate, b: Coordinate): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeAngleDegrees(toDeg(Math.atan2(y, x)));
}

/** Normalizes any angle (degrees) into [0, 360). */
export function normalizeAngleDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Shortest signed delta (degrees) from `from` to `to`, in (-180, 180].
 * Positive = clockwise. Correctly handles the 359°→1° and 1°→359° wraps
 * instead of rotating almost a full circle.
 */
export function shortestAngleDelta(from: number, to: number): number {
  const diff = normalizeAngleDegrees(to - from);
  return diff > 180 ? diff - 360 : diff;
}

/** Interpolates the shortest way from `from` toward `to` by fraction t (0..1). */
export function interpolateAngleDegrees(from: number, to: number, t: number): number {
  return normalizeAngleDegrees(from + shortestAngleDelta(from, to) * t);
}

/** Linear interpolation between two coordinates. Adequate at the scale of
 *  animation frames between consecutive GPS fixes (never more than a few
 *  hundred meters apart), where the spherical-vs-planar error is negligible. */
export function interpolateCoordinate(a: Coordinate, b: Coordinate, t: number): Coordinate {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Projects `point` onto the segment a→b. Returns the closest point on the
 *  segment, the fractional position along it (0..1), and the distance from
 *  `point` to that closest point. */
export function projectPointOntoSegment(
  point: Coordinate,
  a: Coordinate,
  b: Coordinate
): { closest: Coordinate; t: number; distanceMeters: number } {
  // Equirectangular-ish local projection: adequate at street scale and much
  // cheaper than full great-circle segment projection.
  const cosLat = Math.cos(toRad((a.lat + b.lat) / 2));
  const ax = a.lng * cosLat, ay = a.lat;
  const bx = b.lng * cosLat, by = b.lat;
  const px = point.lng * cosLat, py = point.lat;

  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = interpolateCoordinate(a, b, t);
  return { closest, t, distanceMeters: haversineDistanceMeters(point, closest) };
}

/** Builds the cumulative-distance array for a path (same length as `path`,
 *  cumulativeDistances[0] === 0). */
export function buildCumulativeDistances(path: Coordinate[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineDistanceMeters(path[i - 1], path[i]));
  }
  return cumulative;
}

export interface SegmentProjection {
  segmentIndex: number;
  closest: Coordinate;
  cumulativeDistanceMeters: number;
  distanceFromRouteMeters: number;
}

/**
 * Projects `point` onto the full route polyline, searching only within a
 * window around `hintSegmentIndex` when provided (forward-progress hint from
 * the previous match) to avoid an O(n) scan every GPS update and to avoid
 * snapping backward onto an earlier, geometrically-closer segment (e.g. a
 * parallel road the route also passes near).
 */
export function projectPointOntoRoute(
  point: Coordinate,
  route: NavigationRoute,
  hintSegmentIndex?: number,
  windowSize = 40
): SegmentProjection | null {
  const { path, cumulativeDistances } = route;
  if (path.length < 2) return null;

  let start = 0;
  let end = path.length - 2;
  if (hintSegmentIndex != null) {
    start = Math.max(0, hintSegmentIndex - 5);
    end = Math.min(path.length - 2, hintSegmentIndex + windowSize);
  }

  let best: SegmentProjection | null = null;
  for (let i = start; i <= end; i++) {
    const { closest, t, distanceMeters } = projectPointOntoSegment(point, path[i], path[i + 1]);
    if (!best || distanceMeters < best.distanceFromRouteMeters) {
      const segLen = cumulativeDistances[i + 1] - cumulativeDistances[i];
      best = {
        segmentIndex: i,
        closest,
        cumulativeDistanceMeters: cumulativeDistances[i] + segLen * t,
        distanceFromRouteMeters: distanceMeters,
      };
    }
  }
  return best;
}

/**
 * Finds the coordinate `lookAheadMeters` further along the route from
 * `fromCumulativeMeters`, for use as a navigation-camera look-ahead target
 * (so the visible map naturally places more roadway ahead of the vehicle
 * than behind it). Clamps to the route end.
 */
export function lookAheadPoint(route: NavigationRoute, fromCumulativeMeters: number, lookAheadMeters: number): Coordinate {
  const { path, cumulativeDistances } = route;
  const target = fromCumulativeMeters + lookAheadMeters;
  const total = cumulativeDistances[cumulativeDistances.length - 1];
  if (target >= total) return path[path.length - 1];

  for (let i = 0; i < cumulativeDistances.length - 1; i++) {
    if (cumulativeDistances[i + 1] >= target) {
      const segStart = cumulativeDistances[i];
      const segEnd = cumulativeDistances[i + 1];
      const t = segEnd === segStart ? 0 : (target - segStart) / (segEnd - segStart);
      return interpolateCoordinate(path[i], path[i + 1], t);
    }
  }
  return path[path.length - 1];
}

/** Index of the route step whose cumulative start distance is the last one
 *  at or before `cumulativeDistanceMeters` — i.e. the step currently active. */
export function stepIndexForCumulativeDistance(route: NavigationRoute, cumulativeDistanceMeters: number): number {
  let idx = 0;
  for (let i = 0; i < route.steps.length; i++) {
    if (route.steps[i].cumulativeDistanceMeters <= cumulativeDistanceMeters) idx = i;
    else break;
  }
  return idx;
}
