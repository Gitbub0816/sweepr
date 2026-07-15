/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NAVIGATION_THEME,
  DEFAULT_VEHICLE_MARKER_CONFIG,
  INITIAL_NAVIGATION_SESSION_STATE,
  type Coordinate,
  type NavigationCameraMode,
  type NavigationRoute,
  type NavigationSessionState,
  type NavigationTheme,
  type VehicleMarkerConfig,
} from "../types/navigation";
import { bearingBetween } from "../routing/routeGeometry";
import { useMapKit } from "./useMapKit";
import { useBrowserLocation } from "./useBrowserLocation";
import { createRouteOverlayManager, type RouteOverlayManager } from "../map/routeOverlayManager";
import { createDestinationAnnotation, type DestinationAnnotationHandle } from "../map/destinationAnnotation";
import { createVehicleAnnotation, type VehicleAnnotationHandle } from "../map/vehicleAnnotation";
import { createNavigationCamera, type NavigationCameraHandle } from "../map/navigationCamera";

/** How often (ms) high-frequency refs (raw GPS, bearing, distance) are
 *  allowed to flow into React state. GPS/animation updates can arrive many
 *  times a second; committing every one to React state would re-render the
 *  whole navigation screen at that rate. 500ms keeps UI text (ETA, distance
 *  remaining, maneuver banner) feeling live without doing that. */
const STATE_COMMIT_THROTTLE_MS = 500;

/** Below this speed (m/s) the vehicle marker is considered stationary for
 *  `pauseWhenStationary` purposes — a GPS fix drifting slightly while parked
 *  should not read as "moving". */
const STATIONARY_SPEED_THRESHOLD_MPS = 0.5;

export interface UseNavigationSessionOptions {
  route: NavigationRoute | null;
  destination: Coordinate | null;
  theme?: NavigationTheme;
  vehicleMarkerConfig?: VehicleMarkerConfig;
  /** Whether the browser Geolocation watch should be active. */
  enabled: boolean;
}

export interface UseNavigationSessionResult {
  containerRef: React.RefObject<HTMLDivElement>;
  mapStatus: "loading" | "ready" | "error";
  state: NavigationSessionState;
  cameraRef: React.RefObject<NavigationCameraHandle | null>;
  setCameraMode(mode: NavigationCameraMode): void;
  resumeFollowing(): void;
  setVoiceGuidanceEnabled(enabled: boolean): void;
}

/**
 * The composing hook for the navigation screen: wires together the MapKit
 * map, browser geolocation, route overlays, destination + vehicle
 * annotations, and the imperative navigation camera. Owns
 * `NavigationSessionState` in React state for UI-relevant fields, but keeps
 * high-frequency fields (raw location, bearing, cumulative distance) in refs
 * and only commits them to React state at STATE_COMMIT_THROTTLE_MS cadence,
 * via a requestAnimationFrame loop, so the navigation screen doesn't
 * re-render on every GPS tick.
 *
 * Route matching / progress / rerouting / arrival detection are NOT computed
 * here — those come from the parallel agent's routing/guidance modules. This
 * hook currently uses the raw filtered location directly as the vehicle's
 * displayed position (documented below) until those modules are merged.
 */
export function useNavigationSession(options: UseNavigationSessionOptions): UseNavigationSessionResult {
  const { route, destination, enabled } = options;
  const theme = options.theme ?? DEFAULT_NAVIGATION_THEME;
  const vehicleConfig = options.vehicleMarkerConfig ?? DEFAULT_VEHICLE_MARKER_CONFIG;

  const initialCenter = destination ?? { lat: 0, lng: 0 };
  const { containerRef, status: mapStatus, handleRef } = useMapKit(initialCenter);
  const { location, permissionState } = useBrowserLocation(enabled);

  const [state, setState] = useState<NavigationSessionState>(INITIAL_NAVIGATION_SESSION_STATE);

  const overlayManagerRef = useRef<RouteOverlayManager | null>(null);
  const destinationAnnotationRef = useRef<DestinationAnnotationHandle | null>(null);
  const vehicleAnnotationRef = useRef<VehicleAnnotationHandle | null>(null);
  const cameraRef = useRef<NavigationCameraHandle | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const lastCoordinateRef = useRef<Coordinate | null>(null);
  const lastBearingRef = useRef(0);
  const lastStateCommitRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const cameraModeRef = useRef<NavigationCameraMode>("following");

  // --- Set up map-dependent objects once the map is ready and a route/dest exist.
  useEffect(() => {
    const handle = handleRef.current;
    if (mapStatus !== "ready" || !handle) return;

    if (destination && !destinationAnnotationRef.current) {
      destinationAnnotationRef.current = createDestinationAnnotation(handle.mapkit, handle.map, destination);
    }
    if (!vehicleAnnotationRef.current) {
      const startCoordinate = lastCoordinateRef.current ?? destination ?? initialCenter;
      vehicleAnnotationRef.current = createVehicleAnnotation(handle.mapkit, startCoordinate, vehicleConfig);
      handle.map.addAnnotation(vehicleAnnotationRef.current.annotation);
    }
    if (!cameraRef.current) {
      cameraRef.current = createNavigationCamera(handle.map, handle.mapkit, theme);
    }
    if (route && !overlayManagerRef.current) {
      overlayManagerRef.current = createRouteOverlayManager({ map: handle.map, mapkit: handle.mapkit, route, theme });
    } else if (route && overlayManagerRef.current) {
      overlayManagerRef.current.setRoute(route);
    }

    return () => {
      // Cleanup happens in the unmount effect below, not here, since this
      // effect legitimately re-runs when `route` changes.
    };
  }, [mapStatus, destination, route, theme, vehicleConfig, initialCenter, handleRef]);

  // --- Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      overlayManagerRef.current?.destroy();
      destinationAnnotationRef.current?.destroy();
      vehicleAnnotationRef.current?.destroy();
      cameraRef.current?.destroy();
      wakeLockRef.current?.release().catch(() => {});
      overlayManagerRef.current = null;
      destinationAnnotationRef.current = null;
      vehicleAnnotationRef.current = null;
      cameraRef.current = null;
      wakeLockRef.current = null;
    };
  }, []);

  // --- Screen Wake Lock: feature-detected, never assumed. Re-acquired on
  // visibilitychange since the OS/browser releases it automatically when the
  // tab is hidden and does not auto-reacquire it.
  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) return;

    let cancelled = false;
    async function acquire() {
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch {
        // Wake lock request can fail (e.g. low battery, denied) — navigation
        // continues normally without it.
      }
    }

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled]);

  // --- Feed each new geolocation fix into refs + the imperative map layer.
  useEffect(() => {
    if (!location) return;

    const prevCoordinate = lastCoordinateRef.current;
    const bearing =
      location.headingDegrees ??
      (prevCoordinate ? bearingBetween(prevCoordinate, location.coordinate) : lastBearingRef.current);

    lastCoordinateRef.current = location.coordinate;
    lastBearingRef.current = bearing;

    vehicleAnnotationRef.current?.setCoordinate(location.coordinate);
    vehicleAnnotationRef.current?.setHeading(bearing);

    const speed = location.speedMps ?? 0;
    vehicleAnnotationRef.current?.setMoving(speed > STATIONARY_SPEED_THRESHOLD_MPS);

    // NOTE: cumulativeDistanceMeters is a placeholder (0) until the parallel
    // agent's routeProgress.ts is merged and wired in here — route-matched
    // progress driving the completed/active overlay split and camera
    // look-ahead will replace this once available.
    const cumulativeDistanceMeters = 0;
    overlayManagerRef.current?.updateProgress(cumulativeDistanceMeters);
    cameraRef.current?.update(location.coordinate, bearing, cumulativeDistanceMeters, speed);

    const now = Date.now();
    if (now - lastStateCommitRef.current >= STATE_COMMIT_THROTTLE_MS) {
      lastStateCommitRef.current = now;
      setState((prev) => ({
        ...prev,
        rawLocation: location,
        filteredLocation: { ...location, rejected: false },
        currentBearing: bearing,
        lastReliableBearing: location.headingDegrees != null ? bearing : prev.lastReliableBearing,
        permissionState,
        gpsAccuracyMeters: location.accuracyMeters,
        lastValidLocationTimestamp: location.timestamp,
        route,
      }));
    }
  }, [location, permissionState, route]);

  useEffect(() => {
    setState((prev) => ({ ...prev, permissionState }));
  }, [permissionState]);

  const setCameraMode = useCallback((mode: NavigationCameraMode) => {
    cameraModeRef.current = mode;
    cameraRef.current?.setMode(mode, {
      route: route ?? undefined,
      destination: destination ?? undefined,
    });
    setState((prev) => ({ ...prev, cameraMode: mode, userMovedMap: mode === "user-controlled" }));
  }, [route, destination]);

  const resumeFollowing = useCallback(() => {
    cameraRef.current?.resume();
    cameraModeRef.current = "following";
    setState((prev) => ({ ...prev, cameraMode: "following", userMovedMap: false }));
  }, []);

  const setVoiceGuidanceEnabled = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, voiceGuidanceEnabled: value }));
  }, []);

  return {
    containerRef,
    mapStatus,
    state,
    cameraRef,
    setCameraMode,
    resumeFollowing,
    setVoiceGuidanceEnabled,
  };
}
