/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Coordinate, VehicleMarkerConfig } from "../types/navigation";

/**
 * Fetches and caches the broom Lottie JSON module-wide (once, no matter how
 * many vehicle annotations get created/destroyed across the app's lifetime)
 * — same pattern as packages/ui/src/components/SweeprLoader.tsx.
 */
let lottieDataPromise: Promise<object | null> | null = null;
function loadLottieData(animationPath: string): Promise<object | null> {
  if (!lottieDataPromise) {
    lottieDataPromise = fetch(animationPath)
      .then((r) => (r.ok ? (r.json() as Promise<object>) : null))
      .catch(() => null);
  }
  return lottieDataPromise;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface VehicleAnnotationHandle {
  annotation: any;
  setCoordinate(coordinate: Coordinate): void;
  setHeading(degrees: number): void;
  setMoving(isMoving: boolean): void;
  destroy(): void;
}

/**
 * Creates the custom MapKit DOM annotation used as the ONLY on-map position
 * indicator during navigation (product requirement: MapKit's own
 * user-location dot is never enabled — see createMapKitMap.ts).
 *
 * Uses `mapkit.Annotation(coordinate, factory)` — MapKit JS's constructor
 * for arbitrary-DOM annotations (verified against the MapKit JS 5.x
 * reference: `mapkit.MarkerAnnotation` only supports MapKit's built-in
 * pin/glyph styling, it cannot host arbitrary child DOM like a Lottie
 * canvas/SVG; `mapkit.Annotation` is the one that takes a factory function
 * returning an HTMLElement). The factory element's outer position is fully
 * owned by MapKit; only the inner `.navigation-vehicle-rotation-layer`
 * transform is touched by this module, imperatively, once per update — never
 * via React state — since heading updates can fire on every animation frame.
 *
 * The Lottie instance is created once per annotation and never torn down on
 * coordinate/heading updates — only `annotation.coordinate` and the rotation
 * layer's CSS transform change per frame.
 */
export function createVehicleAnnotation(
  mapkit: any,
  initialCoordinate: Coordinate,
  config: VehicleMarkerConfig
): VehicleAnnotationHandle {
  let lottieAnim: { play(): void; pause(): void; setSpeed(s: number): void; goToAndStop(f: number, isFrame?: boolean): void; destroy(): void } | null = null;
  let rotationLayer: HTMLDivElement | null = null;
  let destroyed = false;
  let pendingHeadingDegrees = 0;
  let isMoving = true;

  const reducedMotion = prefersReducedMotion();

  function factory(): HTMLElement {
    const root = document.createElement("div");
    root.className = "navigation-vehicle-annotation";
    root.setAttribute("aria-hidden", "true");
    root.style.width = `${config.width}px`;
    root.style.height = `${config.height}px`;
    root.style.pointerEvents = "none";

    const rotation = document.createElement("div");
    rotation.className = "navigation-vehicle-rotation-layer";
    rotation.style.width = "100%";
    rotation.style.height = "100%";
    rotation.style.pointerEvents = "none";
    rotation.style.transformOrigin = "center";
    rotation.style.willChange = "transform";
    rotation.style.transform = `rotate(${pendingHeadingDegrees + config.headingOffsetDegrees}deg)`;
    rotationLayer = rotation;

    const lottieContainer = document.createElement("div");
    lottieContainer.className = "navigation-vehicle-lottie";
    lottieContainer.style.width = "100%";
    lottieContainer.style.height = "100%";
    lottieContainer.style.pointerEvents = "none";

    rotation.appendChild(lottieContainer);
    root.appendChild(rotation);

    Promise.all([loadLottieData(config.animationPath), import("lottie-web/build/player/lottie_light")])
      .then(([data, mod]) => {
        if (destroyed || !data) return;
        lottieAnim = mod.default.loadAnimation({
          container: lottieContainer,
          renderer: "svg",
          loop: config.loop,
          autoplay: !reducedMotion,
          animationData: data,
        });
        lottieAnim.setSpeed(config.animationSpeed);
        if (reducedMotion) {
          lottieAnim.goToAndStop(0, true);
        } else if (config.pauseWhenStationary && !isMoving) {
          lottieAnim.pause();
        }
      })
      .catch(() => null);

    return root;
  }

  const annotation = new mapkit.Annotation(
    new mapkit.Coordinate(initialCoordinate.lat, initialCoordinate.lng),
    factory
  );
  // MapKit ignores clicks/taps for annotations flagged non-selectable — the
  // vehicle marker is purely informational.
  annotation.selected = false;
  if ("clickable" in annotation) annotation.clickable = false;

  return {
    annotation,

    setCoordinate(coordinate: Coordinate) {
      if (destroyed) return;
      annotation.coordinate = new mapkit.Coordinate(coordinate.lat, coordinate.lng);
    },

    setHeading(degrees: number) {
      if (destroyed) return;
      pendingHeadingDegrees = degrees;
      if (rotationLayer) {
        rotationLayer.style.transform = `rotate(${degrees + config.headingOffsetDegrees}deg)`;
      }
    },

    setMoving(nextIsMoving: boolean) {
      if (destroyed) return;
      isMoving = nextIsMoving;
      if (!config.pauseWhenStationary || !lottieAnim || reducedMotion) return;
      if (isMoving) lottieAnim.play();
      else lottieAnim.pause();
    },

    destroy() {
      destroyed = true;
      lottieAnim?.destroy();
      lottieAnim = null;
      rotationLayer = null;
    },
  };
}
