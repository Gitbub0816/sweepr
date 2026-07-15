/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createVehicleAnnotation } from "../map/vehicleAnnotation";
import { DEFAULT_VEHICLE_MARKER_CONFIG } from "../types/navigation";

const loadAnimationSpy = vi.fn((_config: unknown) => ({
  play: vi.fn(),
  pause: vi.fn(),
  setSpeed: vi.fn(),
  goToAndStop: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("lottie-web/build/player/lottie_light", () => ({
  default: { loadAnimation: (config: unknown) => loadAnimationSpy(config) },
}));

const originalFetch = global.fetch;

function mockMapkit() {
  return {
    Coordinate: class {
      constructor(public lat: number, public lng: number) {}
    },
    Annotation: class {
      coordinate: unknown;
      selected = true;
      constructor(coordinate: unknown, factory: () => HTMLElement) {
        this.coordinate = coordinate;
        // MapKit calls the factory to build the annotation's DOM element.
        this.element = factory();
      }
      element: HTMLElement;
    },
  };
}

describe("vehicle annotation lifecycle", () => {
  beforeEach(() => {
    loadAnimationSpy.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fake: "lottie-json" }),
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("loads the Lottie animation exactly once and does not remount it across repeated coordinate/heading updates", async () => {
    const mapkit = mockMapkit();
    const handle = createVehicleAnnotation(mapkit, { lat: 40, lng: -74 }, DEFAULT_VEHICLE_MARKER_CONFIG);

    // Allow the async fetch + dynamic import chain inside the annotation
    // factory to resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadAnimationSpy).toHaveBeenCalledTimes(1);
    const rootElement = (handle.annotation as { element: HTMLElement }).element;
    const rotationLayerBefore = rootElement.querySelector(".navigation-vehicle-rotation-layer");

    for (let i = 0; i < 5; i++) {
      handle.setCoordinate({ lat: 40 + i * 0.001, lng: -74 + i * 0.001 });
      handle.setHeading(i * 10);
    }

    // The DOM node identity must be stable — no remount — and lottie must
    // still have been initialized only once.
    const rotationLayerAfter = rootElement.querySelector(".navigation-vehicle-rotation-layer");
    expect(rotationLayerAfter).toBe(rotationLayerBefore);
    expect(loadAnimationSpy).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("applies heading updates as a CSS transform on the rotation layer, not React state", async () => {
    const mapkit = mockMapkit();
    const handle = createVehicleAnnotation(mapkit, { lat: 0, lng: 0 }, DEFAULT_VEHICLE_MARKER_CONFIG);
    const rootElement = (handle.annotation as { element: HTMLElement }).element;
    const rotationLayer = rootElement.querySelector(".navigation-vehicle-rotation-layer") as HTMLElement;

    handle.setHeading(90);
    expect(rotationLayer.style.transform).toContain("rotate(90deg)");

    handle.destroy();
  });

  it("marks the annotation element aria-hidden so it never reaches the accessibility tree", async () => {
    const mapkit = mockMapkit();
    const handle = createVehicleAnnotation(mapkit, { lat: 0, lng: 0 }, DEFAULT_VEHICLE_MARKER_CONFIG);
    const rootElement = (handle.annotation as { element: HTMLElement }).element;
    expect(rootElement.getAttribute("aria-hidden")).toBe("true");
    handle.destroy();
  });
});
