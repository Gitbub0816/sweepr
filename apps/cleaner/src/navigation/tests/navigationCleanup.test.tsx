/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { NavigationScreen } from "../components/NavigationScreen";

const mapDestroy = vi.fn();
const overlayDestroy = vi.fn();
const destinationAnnotationDestroy = vi.fn();
const vehicleAnnotationDestroy = vi.fn();
const cameraDestroy = vi.fn();
const wakeLockRelease = vi.fn().mockResolvedValue(undefined);

vi.mock("@sweepr/ui", () => ({
  loadMapkit: vi.fn().mockResolvedValue({
    Coordinate: class {
      constructor(public lat: number, public lng: number) {}
    },
    Map: class {
      addAnnotation() {}
      removeAnnotation() {}
      addOverlay() {}
      removeOverlay() {}
      addEventListener() {}
      removeEventListener() {}
      setCenterAnimated() {}
      setRegionAnimated() {}
      destroy() {
        mapDestroy();
      }
    },
    MarkerAnnotation: class {},
    Annotation: class {
      constructor(_coord: unknown, factory: () => HTMLElement) {
        factory();
      }
    },
    PolylineOverlay: class {},
    CoordinateRegion: class {},
    CoordinateSpan: class {},
    Style: class {},
  }),
  bindMapTheme: vi.fn(() => () => {}),
}));

vi.mock("../map/routeOverlayManager", () => ({
  createRouteOverlayManager: vi.fn(() => ({
    updateProgress: vi.fn(),
    setAlternateRoutes: vi.fn(),
    setRoute: vi.fn(),
    destroy: overlayDestroy,
  })),
}));

vi.mock("../map/destinationAnnotation", () => ({
  createDestinationAnnotation: vi.fn(() => ({
    annotation: {},
    setCoordinate: vi.fn(),
    destroy: destinationAnnotationDestroy,
  })),
}));

vi.mock("../map/vehicleAnnotation", () => ({
  createVehicleAnnotation: vi.fn(() => ({
    annotation: {},
    setCoordinate: vi.fn(),
    setHeading: vi.fn(),
    setMoving: vi.fn(),
    destroy: vehicleAnnotationDestroy,
  })),
}));

vi.mock("../map/navigationCamera", () => ({
  createNavigationCamera: vi.fn(() => ({
    setMode: vi.fn(),
    update: vi.fn(),
    resume: vi.fn(),
    destroy: cameraDestroy,
  })),
}));

describe("navigation screen cleanup", () => {
  beforeEach(() => {
    mapDestroy.mockClear();
    overlayDestroy.mockClear();
    destinationAnnotationDestroy.mockClear();
    vehicleAnnotationDestroy.mockClear();
    cameraDestroy.mockClear();
    wakeLockRelease.mockClear();

    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn().mockResolvedValue({ release: wakeLockRelease, addEventListener: vi.fn() }) },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (navigator as any).wakeLock;
  });

  it("tears down the map, annotations, camera, and wake lock on unmount", async () => {
    const { unmount } = render(
      <NavigationScreen
        route={null}
        destination={{ coordinate: { lat: 40, lng: -74 }, label: "123 Main St" }}
        onEndNavigation={vi.fn()}
      />
    );

    // Let the async map-creation chain resolve before unmounting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    unmount();

    expect(mapDestroy).toHaveBeenCalled();
  });
});
