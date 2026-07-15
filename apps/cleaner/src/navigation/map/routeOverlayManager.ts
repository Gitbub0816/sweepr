/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { NavigationRoute, NavigationTheme, RouteStep } from "../types/navigation";
import { DEFAULT_NAVIGATION_THEME } from "../types/navigation";

/**
 * Minimum forward movement (meters) along the route since the last split
 * before `updateProgress` is allowed to re-split/redraw the completed vs.
 * active overlays. Re-splitting on every animation frame (dozens of times a
 * second while the vehicle marker is animating between GPS fixes) would
 * recreate MapKit overlays far more often than the visible line position
 * could possibly need — a human can't perceive a completed/active split
 * moving by less than this. 15m keeps the seam visually tight without
 * thrashing MapKit's overlay list.
 */
const PROGRESS_SPLIT_MIN_DELTA_METERS = 15;

/** How far (meters) around the next maneuver's cumulative distance to draw
 *  the "upcoming maneuver" emphasis segment — half before, half after. */
const UPCOMING_MANEUVER_WINDOW_METERS = 60;

const ROUTE_CASING_WIDTH = 11;
const ROUTE_ACTIVE_WIDTH = 6;
const ROUTE_COMPLETED_WIDTH = 6;
const ROUTE_ALTERNATE_WIDTH = 5;
const ROUTE_UPCOMING_WIDTH = 7;

function toMapkitPath(mapkit: any, path: { lat: number; lng: number }[]) {
  return path.map((c) => new mapkit.Coordinate(c.lat, c.lng));
}

/** Splits a route's `path` (with parallel `cumulativeDistances`) into
 *  [beforeCumulative, atOrAfterCumulative] sub-paths, interpolating a seam
 *  point exactly at `cumulativeMeters` so the two halves share an endpoint
 *  and the line looks continuous. */
function splitPathAtDistance(
  path: { lat: number; lng: number }[],
  cumulativeDistances: number[],
  cumulativeMeters: number
): { before: { lat: number; lng: number }[]; after: { lat: number; lng: number }[] } {
  if (path.length === 0) return { before: [], after: [] };
  const total = cumulativeDistances[cumulativeDistances.length - 1];
  const clamped = Math.max(0, Math.min(total, cumulativeMeters));

  if (clamped <= 0) return { before: [], after: path.slice() };
  if (clamped >= total) return { before: path.slice(), after: [] };

  for (let i = 0; i < cumulativeDistances.length - 1; i++) {
    const d0 = cumulativeDistances[i];
    const d1 = cumulativeDistances[i + 1];
    if (clamped >= d0 && clamped <= d1) {
      const t = d1 === d0 ? 0 : (clamped - d0) / (d1 - d0);
      const seam = {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      };
      return {
        before: [...path.slice(0, i + 1), seam],
        after: [seam, ...path.slice(i + 1)],
      };
    }
  }
  return { before: path.slice(), after: [] };
}

export interface RouteOverlayManagerOptions {
  map: any;
  mapkit: any;
  route: NavigationRoute;
  theme?: NavigationTheme;
}

export interface RouteOverlayManager {
  /** Re-splits completed/active overlays at the given cumulative distance,
   *  and refreshes the upcoming-maneuver emphasis segment. Throttled
   *  internally — see PROGRESS_SPLIT_MIN_DELTA_METERS. */
  updateProgress(cumulativeDistanceMeters: number): void;
  setAlternateRoutes(routes: NavigationRoute[]): void;
  setRoute(route: NavigationRoute): void;
  destroy(): void;
}

/**
 * Manages the layered MapKit polyline rendering for the active navigation
 * route:
 *   1. wide casing (bottom)
 *   2. muted completed segment
 *   3. branded active segment
 *   4. upcoming-maneuver emphasis segment (top, only near the next turn)
 * plus subdued alternate-route lines drawn beneath everything.
 *
 * `updateProgress` is the hot path — called from the navigation session's
 * animation loop — so it's guarded to only actually touch MapKit overlays
 * when the vehicle has moved at least PROGRESS_SPLIT_MIN_DELTA_METERS since
 * the last redraw, instead of recreating overlays every call.
 */
export function createRouteOverlayManager(options: RouteOverlayManagerOptions): RouteOverlayManager {
  const { map, mapkit } = options;
  const theme = options.theme ?? DEFAULT_NAVIGATION_THEME;
  let route = options.route;

  let casingOverlay: any = null;
  let completedOverlay: any = null;
  let activeOverlay: any = null;
  let upcomingOverlay: any = null;
  let alternateOverlays: any[] = [];

  let lastSplitMeters = -Infinity;

  function style(color: string, width: number) {
    return new mapkit.Style({
      strokeColor: color,
      lineWidth: width,
      lineJoin: "round",
      lineCap: "round",
    });
  }

  function removeOverlay(overlay: any) {
    if (overlay) {
      try {
        map.removeOverlay(overlay);
      } catch {
        // already removed
      }
    }
  }

  function drawCasing() {
    removeOverlay(casingOverlay);
    casingOverlay = new mapkit.PolylineOverlay(toMapkitPath(mapkit, route.path), {
      style: style(theme.routeCasingColor, ROUTE_CASING_WIDTH),
    });
    map.addOverlay(casingOverlay);
  }

  function upcomingManeuverSegment(cumulativeMeters: number): { lat: number; lng: number }[] {
    const nextStep: RouteStep | undefined = route.steps.find(
      (s) => s.cumulativeDistanceMeters > cumulativeMeters
    );
    if (!nextStep) return [];
    const center = nextStep.cumulativeDistanceMeters;
    const from = center - UPCOMING_MANEUVER_WINDOW_METERS / 2;
    const to = center + UPCOMING_MANEUVER_WINDOW_METERS / 2;
    const { after: fromSplit } = splitPathAtDistance(route.path, route.cumulativeDistances, Math.max(0, from));
    const { before: segment } = splitPathAtDistance(
      fromSplit,
      buildLocalCumulative(fromSplit),
      Math.max(0, to - Math.max(0, from))
    );
    return segment;
  }

  function buildLocalCumulative(path: { lat: number; lng: number }[]): number[] {
    // Re-derive cumulative distances for a sub-path using the haversine-free
    // planar approximation is unnecessary here since we only need relative
    // spacing for a short ~60m window; reuse the parent route's spacing by
    // proportional index mapping instead of recomputing haversine (cheap and
    // accurate enough at this scale).
    const cumulative: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      const dLat = path[i].lat - path[i - 1].lat;
      const dLng = path[i].lng - path[i - 1].lng;
      // Rough planar meters/degree approximation, fine for a ~60m window.
      const metersPerDegLat = 111_320;
      const metersPerDegLng = 111_320 * Math.cos((path[i].lat * Math.PI) / 180);
      const dy = dLat * metersPerDegLat;
      const dx = dLng * metersPerDegLng;
      cumulative.push(cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return cumulative;
  }

  function redrawProgressOverlays(cumulativeMeters: number) {
    const { before, after } = splitPathAtDistance(route.path, route.cumulativeDistances, cumulativeMeters);

    removeOverlay(completedOverlay);
    completedOverlay =
      before.length > 1
        ? new mapkit.PolylineOverlay(toMapkitPath(mapkit, before), {
            style: style(theme.completedRouteColor, ROUTE_COMPLETED_WIDTH),
          })
        : null;
    if (completedOverlay) map.addOverlay(completedOverlay);

    removeOverlay(activeOverlay);
    activeOverlay =
      after.length > 1
        ? new mapkit.PolylineOverlay(toMapkitPath(mapkit, after), {
            style: style(theme.activeRouteColor, ROUTE_ACTIVE_WIDTH),
          })
        : null;
    if (activeOverlay) map.addOverlay(activeOverlay);

    removeOverlay(upcomingOverlay);
    const upcoming = upcomingManeuverSegment(cumulativeMeters);
    upcomingOverlay =
      upcoming.length > 1
        ? new mapkit.PolylineOverlay(toMapkitPath(mapkit, upcoming), {
            style: style(theme.upcomingManeuverColor, ROUTE_UPCOMING_WIDTH),
          })
        : null;
    if (upcomingOverlay) map.addOverlay(upcomingOverlay);

    lastSplitMeters = cumulativeMeters;
  }

  function drawAll(cumulativeMeters: number) {
    drawCasing();
    redrawProgressOverlays(cumulativeMeters);
  }

  drawAll(0);

  return {
    updateProgress(cumulativeDistanceMeters: number) {
      if (Math.abs(cumulativeDistanceMeters - lastSplitMeters) < PROGRESS_SPLIT_MIN_DELTA_METERS) {
        return;
      }
      redrawProgressOverlays(cumulativeDistanceMeters);
    },

    setAlternateRoutes(routes: NavigationRoute[]) {
      alternateOverlays.forEach(removeOverlay);
      alternateOverlays = routes.map((r) => {
        const overlay = new mapkit.PolylineOverlay(toMapkitPath(mapkit, r.path), {
          style: style(theme.alternateRouteColor, ROUTE_ALTERNATE_WIDTH),
        });
        map.addOverlay(overlay);
        return overlay;
      });
    },

    setRoute(newRoute: NavigationRoute) {
      route = newRoute;
      lastSplitMeters = -Infinity;
      drawAll(0);
    },

    destroy() {
      removeOverlay(casingOverlay);
      removeOverlay(completedOverlay);
      removeOverlay(activeOverlay);
      removeOverlay(upcomingOverlay);
      alternateOverlays.forEach(removeOverlay);
      casingOverlay = completedOverlay = activeOverlay = upcomingOverlay = null;
      alternateOverlays = [];
    },
  };
}
