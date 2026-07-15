/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Coordinate } from "../types/navigation";

export interface DestinationAnnotationHandle {
  annotation: any;
  setCoordinate(coordinate: Coordinate): void;
  destroy(): void;
}

/**
 * Destination pin — a standard MapKit MarkerAnnotation (same pattern as the
 * existing packages/ui NavigationMap.tsx), not a custom DOM annotation, since
 * the destination doesn't need to rotate or animate the way the vehicle
 * marker does.
 */
export function createDestinationAnnotation(
  mapkit: any,
  map: any,
  coordinate: Coordinate
): DestinationAnnotationHandle {
  const annotation = new mapkit.MarkerAnnotation(new mapkit.Coordinate(coordinate.lat, coordinate.lng), {
    color: "#14b8a6",
    glyphText: "\u{1F3E0}",
    title: "Destination",
  });
  map.addAnnotation(annotation);

  return {
    annotation,
    setCoordinate(next: Coordinate) {
      annotation.coordinate = new mapkit.Coordinate(next.lat, next.lng);
    },
    destroy() {
      try {
        map.removeAnnotation(annotation);
      } catch {
        // already removed
      }
    },
  };
}
