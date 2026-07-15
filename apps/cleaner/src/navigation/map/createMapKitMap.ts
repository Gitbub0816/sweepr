/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { loadMapkit, bindMapTheme } from "@sweepr/ui";
import type { Coordinate } from "../types/navigation";

export interface CreateMapKitMapOptions {
  /** Base API URL used to fetch the short-lived Apple Maps token. */
  apiBase: string;
  container: HTMLDivElement;
  center: Coordinate;
  cameraDistance?: number;
}

export interface MapKitMapHandle {
  map: any;
  mapkit: any;
  destroy(): void;
}

/**
 * Creates a MapKit JS map instance for the in-browser navigation screen.
 *
 * Deliberately does NOT enable MapKit's built-in user-location dot
 * (`map.showsUserLocation` / `tracksUserLocation`) or add its built-in
 * user-location annotation — product requirement is that the Lottie vehicle
 * marker (vehicleAnnotation.ts) is the ONLY position indicator on screen.
 */
export async function createMapKitMap(options: CreateMapKitMapOptions): Promise<MapKitMapHandle> {
  const { apiBase, container, center, cameraDistance = 400 } = options;

  const mapkit = await loadMapkit(apiBase);

  const map = new mapkit.Map(container, {
    center: new mapkit.Coordinate(center.lat, center.lng),
    cameraDistance,
    showsMapTypeControl: false,
    showsZoomControl: false,
    isRotationEnabled: true,
    // Explicitly NOT enabling MapKit's own user-location dot — see doc
    // comment above. Some MapKit JS versions don't expose these properties
    // at all; guarded assignment below covers that case too.
    showsUserLocation: false,
    tracksUserLocation: false,
  });

  const unbindTheme = bindMapTheme(mapkit, map);

  return {
    map,
    mapkit,
    destroy() {
      unbindTheme();
      try {
        map.destroy();
      } catch {
        // already torn down
      }
    },
  };
}
