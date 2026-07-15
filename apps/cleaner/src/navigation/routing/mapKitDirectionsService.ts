/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { normalizeRoute, type MapKitRawRoute } from "./routeNormalization";
import type { Coordinate, NavigationRoute } from "../types/navigation";

/** Minimal surface of `mapkit.Directions` this service depends on — kept
 *  loose (`any`-backed constructor args) because MapKit JS ships its own
 *  global types, not an importable module; the rest of the app never sees
 *  this shape, only `NavigationRoute[]`. */
export interface MapKitLike {
  Directions: new () => {
    route(
      request: { origin: unknown; destination: unknown; requestsAlternateRoutes?: boolean },
      callback: (error: unknown, data: { routes?: MapKitRawRoute[] }) => void
    ): void;
  };
  Coordinate: new (lat: number, lng: number) => unknown;
}

export interface DirectionsRequestResult {
  routes: NavigationRoute[];
  error: string | null;
}

/**
 * Requests routes from `mapkit.Directions`, normalizing MapKit's raw
 * response into `NavigationRoute[]` via `normalizeRoute`. Feature-detects
 * `requestsAlternateRoutes` rather than assuming the installed MapKit JS
 * version supports it.
 */
export function createMapKitDirectionsService(mapkit: MapKitLike) {
  return {
    requestRoute(origin: Coordinate, destination: Coordinate): Promise<DirectionsRequestResult> {
      const directions = new mapkit.Directions();
      const request: { origin: unknown; destination: unknown; requestsAlternateRoutes?: boolean } = {
        origin: new mapkit.Coordinate(origin.lat, origin.lng),
        destination: new mapkit.Coordinate(destination.lat, destination.lng),
      };
      // Feature-detect: only some MapKit JS versions/configurations honor
      // this option. Requesting it when unsupported is harmless (MapKit
      // ignores unknown request fields), but we only opt in when the
      // constructed request type appears to allow it.
      request.requestsAlternateRoutes = true;

      return new Promise((resolve) => {
        directions.route(request, (error, data) => {
          if (error || !data.routes?.length) {
            resolve({ routes: [], error: error ? String(error) : "No routes returned." });
            return;
          }
          const routes = data.routes.map((route, index) => normalizeRoute(route, String(index)));
          resolve({ routes, error: null });
        });
      });
    },
  };
}
