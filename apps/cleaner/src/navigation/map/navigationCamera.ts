/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Coordinate, NavigationCameraMode, NavigationRoute, NavigationTheme } from "../types/navigation";
import { interpolateAngleDegrees, interpolateCoordinate, lookAheadPoint } from "../routing/routeGeometry";

/** Minimum time between animated camera calls (`setCenterAnimated`,
 *  `cameraDistance` writes, `rotation` writes) while following. MapKit's
 *  animated setters restart their own transition if called again mid-flight,
 *  so calling every GPS tick (which can arrive faster than 1/s) would make
 *  the camera visibly stutter instead of smoothly tracking. 1s matches
 *  typical GPS update cadence and is fast enough to feel responsive. */
const CAMERA_UPDATE_THROTTLE_MS = 1000;

/** Meters to look ahead of the vehicle's actual position when blending the
 *  camera center toward the road ahead, while following at typical
 *  city/suburban speed. */
const BASE_LOOK_AHEAD_METERS = 60;
/** Additional look-ahead meters added per m/s of current speed, so a
 *  faster-moving vehicle gets proportionally more road revealed ahead. */
const LOOK_AHEAD_SPEED_FACTOR = 6;

/** How much of the blend goes toward the look-ahead point vs. the vehicle's
 *  actual position (0 = center exactly on vehicle, 1 = center exactly on the
 *  look-ahead point). Kept well under 1 so the vehicle marker stays clearly
 *  on-screen instead of drifting to the edge. */
const LOOK_AHEAD_BLEND = 0.35;

const FOLLOWING_MIN_DISTANCE = 250;
const FOLLOWING_MAX_DISTANCE = 900;
/** Speed (m/s) at/above which the following camera uses its widest
 *  distance — roughly highway speed (~55mph). */
const HIGHWAY_SPEED_MPS = 24;

const MANEUVER_PREVIEW_DISTANCE = 550;
/** Time-to-maneuver (seconds) at which the maneuver-preview blend begins
 *  biasing the camera toward the upcoming turn; the blend factor scales
 *  linearly to 1 at 0 seconds. */
const MANEUVER_PREVIEW_LEAD_SECONDS = 12;

export interface NavigationCameraContext {
  route?: NavigationRoute | null;
  /** Required for maneuver-preview: seconds until the next maneuver, from
   *  the OTHER agent's routeProgress.ts — this module never computes it. */
  timeToManeuverSeconds?: number;
  upcomingManeuverCoordinate?: Coordinate;
  outgoingSegmentHeadingDegrees?: number;
  destination?: Coordinate;
}

export interface NavigationCameraHandle {
  setMode(mode: NavigationCameraMode, context?: NavigationCameraContext): void;
  /** Feeds current vehicle state into the active camera mode. Call every
   *  animation frame; internal throttling decides how often MapKit is
   *  actually touched. */
  update(vehicleCoordinate: Coordinate, bearingDegrees: number, cumulativeDistanceMeters: number, speedMps: number): void;
  /** Resumes auto-following after a user gesture put the camera into
   *  user-controlled mode. */
  resume(): void;
  destroy(): void;
}

function supportsRotation(map: any): boolean {
  return typeof map.rotation === "number" || "rotation" in map;
}

function supportsCameraDistance(map: any): boolean {
  return "cameraDistance" in map;
}

/**
 * Imperative camera state machine driving MapKit's map from navigation
 * state. Kept fully outside React (closures only) so it can be driven from a
 * requestAnimationFrame loop without causing re-renders.
 *
 * Honest capability notes (verified by feature-detection, not assumed):
 *  - `map.rotation` (settable degrees, 0 = north up) exists on MapKit JS's
 *    `Map` instances in the currently loaded runtime (`cdn.apple-mapkit.com
 *    /mk/5.x.x/mapkit.js`) — this module still feature-detects it at
 *    runtime via `supportsRotation` and no-ops rotation writes if absent,
 *    rather than assuming every future MapKit version keeps it.
 *  - `map.cameraDistance` is a plain settable property (already used by the
 *    existing packages/ui NavigationMap.tsx) — there is no dedicated
 *    "animate distance" API distinct from `setCenterAnimated`, so distance
 *    changes are applied as a direct property write alongside an animated
 *    center change; MapKit does not guarantee the distance write itself
 *    animates smoothly (it does in practice in current WebKit/Blink, but
 *    this is not a documented contract).
 *  - There is no MapKit JS API for arbitrary camera pitch/tilt (see
 *    packages/ui/src/lib/mapStyles.ts's MAP_3D_PITCH comment) — this module
 *    does not attempt it.
 */
export function createNavigationCamera(map: any, mapkit: any, _theme?: NavigationTheme): NavigationCameraHandle {
  let mode: NavigationCameraMode = "following";
  let context: NavigationCameraContext = {};
  let lastCameraUpdateMs = 0;
  let programmaticChange = false;
  let userGestureHandler: (() => void) | null = null;
  let destroyed = false;

  const rotationSupported = supportsRotation(map);
  const distanceSupported = supportsCameraDistance(map);

  function markProgrammatic(fn: () => void) {
    programmaticChange = true;
    try {
      fn();
    } finally {
      // MapKit's region-change-start fires synchronously off these calls in
      // practice; clear the flag on the next tick so a genuinely-concurrent
      // user gesture right after isn't mistakenly swallowed.
      setTimeout(() => {
        programmaticChange = false;
      }, 0);
    }
  }

  function attachUserGestureListener() {
    if (!map.addEventListener) return;
    userGestureHandler = () => {
      if (programmaticChange || destroyed) return;
      if (mode !== "user-controlled") {
        mode = "user-controlled";
      }
    };
    map.addEventListener("region-change-start", userGestureHandler);
  }
  attachUserGestureListener();

  function throttled(): boolean {
    const now = Date.now();
    if (now - lastCameraUpdateMs < CAMERA_UPDATE_THROTTLE_MS) return false;
    lastCameraUpdateMs = now;
    return true;
  }

  function applyFollowing(vehicle: Coordinate, bearing: number, cumulativeDistanceMeters: number, speedMps: number) {
    if (!throttled()) return;
    const route = context.route;
    let center = vehicle;
    if (route) {
      const lookAheadMeters = BASE_LOOK_AHEAD_METERS + speedMps * LOOK_AHEAD_SPEED_FACTOR;
      const ahead = lookAheadPoint(route, cumulativeDistanceMeters, lookAheadMeters);
      center = interpolateCoordinate(vehicle, ahead, LOOK_AHEAD_BLEND);
    }

    markProgrammatic(() => {
      map.setCenterAnimated(new mapkit.Coordinate(center.lat, center.lng), true);
      if (distanceSupported) {
        const speedFrac = Math.max(0, Math.min(1, speedMps / HIGHWAY_SPEED_MPS));
        map.cameraDistance = FOLLOWING_MIN_DISTANCE + (FOLLOWING_MAX_DISTANCE - FOLLOWING_MIN_DISTANCE) * speedFrac;
      }
      if (rotationSupported) {
        map.rotation = bearing;
      }
    });
  }

  function applyManeuverPreview(vehicle: Coordinate, bearing: number) {
    if (!throttled()) return;
    const target = context.upcomingManeuverCoordinate ?? vehicle;
    const leadSeconds = context.timeToManeuverSeconds ?? MANEUVER_PREVIEW_LEAD_SECONDS;
    const blend = Math.max(0, Math.min(1, 1 - leadSeconds / MANEUVER_PREVIEW_LEAD_SECONDS));
    const center = interpolateCoordinate(vehicle, target, 0.3 + 0.4 * blend);
    const blendedHeading =
      context.outgoingSegmentHeadingDegrees != null
        ? interpolateAngleDegrees(bearing, context.outgoingSegmentHeadingDegrees, blend)
        : bearing;

    markProgrammatic(() => {
      map.setCenterAnimated(new mapkit.Coordinate(center.lat, center.lng), true);
      if (distanceSupported) map.cameraDistance = MANEUVER_PREVIEW_DISTANCE;
      if (rotationSupported) map.rotation = blendedHeading;
    });
  }

  function regionForPath(path: Coordinate[]): { center: any; span: any } | null {
    if (path.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of path) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }
    const paddingFactor = 1.4;
    const centerCoord = new mapkit.Coordinate((minLat + maxLat) / 2, (minLng + maxLng) / 2);
    const span = new mapkit.CoordinateSpan(
      Math.max((maxLat - minLat) * paddingFactor, 0.003),
      Math.max((maxLng - minLng) * paddingFactor, 0.003)
    );
    return { center: centerCoord, span };
  }

  function applyOverview() {
    const route = context.route;
    if (!route) return;
    const region = regionForPath(route.path);
    if (!region) return;
    markProgrammatic(() => {
      map.setRegionAnimated(new mapkit.CoordinateRegion(region.center, region.span), true);
      if (rotationSupported) map.rotation = 0;
    });
  }

  function applyArrival(vehicle: Coordinate) {
    const destination = context.destination;
    const route = context.route;
    const tailPath = route ? route.path.slice(Math.max(0, route.path.length - 20)) : [];
    const points = [vehicle, ...(destination ? [destination] : []), ...tailPath];
    const region = regionForPath(points);
    if (!region) return;
    markProgrammatic(() => {
      map.setRegionAnimated(new mapkit.CoordinateRegion(region.center, region.span), true);
      if (rotationSupported) map.rotation = 0;
    });
  }

  return {
    setMode(nextMode, nextContext) {
      mode = nextMode;
      if (nextContext) context = { ...context, ...nextContext };
      if (mode === "overview") applyOverview();
    },

    update(vehicleCoordinate, bearingDegrees, cumulativeDistanceMeters, speedMps) {
      if (destroyed) return;
      switch (mode) {
        case "following":
          applyFollowing(vehicleCoordinate, bearingDegrees, cumulativeDistanceMeters, speedMps);
          break;
        case "maneuver-preview":
          applyManeuverPreview(vehicleCoordinate, bearingDegrees);
          break;
        case "arrival":
          applyArrival(vehicleCoordinate);
          break;
        case "overview":
        case "user-controlled":
          // No auto-camera movement in these modes.
          break;
      }
    },

    resume() {
      mode = "following";
    },

    destroy() {
      destroyed = true;
      if (userGestureHandler && map.removeEventListener) {
        map.removeEventListener("region-change-start", userGestureHandler);
      }
      userGestureHandler = null;
    },
  };
}
