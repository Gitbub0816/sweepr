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
  type FilteredLocation,
  type NavigationCameraMode,
  type NavigationRoute,
  type NavigationSessionState,
  type NavigationTheme,
  type RouteMatchResult,
  type VehicleMarkerConfig,
} from "../types/navigation";
import { bearingBetween, haversineDistanceMeters } from "../routing/routeGeometry";
import { useMapKit } from "./useMapKit";
import { createBrowserLocationService } from "../location/browserLocationService";
import { filterLocation } from "../location/locationFilter";
import { matchLocationToRoute } from "../routing/routeMatcher";
import { computeRouteProgress } from "../routing/routeProgress";
import { evaluateOffRoute, createRerouteRateLimiter } from "../routing/reroutingController";
import { evaluateArrival } from "../guidance/arrivalController";
import { classifyAnnouncementStage, AnnouncementDeduper } from "../guidance/maneuverController";
import { createVoiceGuidance } from "../guidance/voiceGuidance";
import { createMapKitDirectionsService } from "../routing/mapKitDirectionsService";
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
  destination: { coordinate: Coordinate; label: string } | null;
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
 * The composing hook for the navigation screen. Wires together:
 *  - the MapKit map, route overlays, destination + vehicle annotations, and
 *    the imperative navigation camera (packages/ui `bindMapTheme` pattern),
 *  - real browser geolocation via `createBrowserLocationService`,
 *  - location filtering, MapKit-route calculation, route matching, progress,
 *    off-route/rerouting, arrival detection, and voice guidance.
 *
 * Owns `NavigationSessionState` in React state for UI-relevant fields, but
 * keeps high-frequency fields (raw location, bearing, cumulative distance,
 * route-match state) in refs, only committing to React state at
 * STATE_COMMIT_THROTTLE_MS cadence, so the navigation screen doesn't
 * re-render on every GPS tick. Route calculation, atomic route replacement on
 * reroute, and per-sample off-route/arrival hysteresis run on every fix
 * regardless of the UI commit throttle, since they need every sample to
 * count consecutive occurrences correctly.
 */
export function useNavigationSession(options: UseNavigationSessionOptions): UseNavigationSessionResult {
  const { destination, enabled } = options;
  const theme = options.theme ?? DEFAULT_NAVIGATION_THEME;
  const vehicleConfig = options.vehicleMarkerConfig ?? DEFAULT_VEHICLE_MARKER_CONFIG;

  const initialCenter = destination?.coordinate ?? { lat: 0, lng: 0 };
  const { containerRef, status: mapStatus, handleRef } = useMapKit(initialCenter);

  const [state, setState] = useState<NavigationSessionState>(INITIAL_NAVIGATION_SESSION_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const overlayManagerRef = useRef<RouteOverlayManager | null>(null);
  const destinationAnnotationRef = useRef<DestinationAnnotationHandle | null>(null);
  const vehicleAnnotationRef = useRef<VehicleAnnotationHandle | null>(null);
  const cameraRef = useRef<NavigationCameraHandle | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const locationServiceRef = useRef<ReturnType<typeof createBrowserLocationService> | null>(null);
  const voiceGuidanceRef = useRef<ReturnType<typeof createVoiceGuidance> | null>(null);
  const rerouteLimiterRef = useRef(createRerouteRateLimiter());
  const announcementDeduperRef = useRef(new AnnouncementDeduper());

  const lastCoordinateRef = useRef<Coordinate | null>(null);
  const lastBearingRef = useRef(0);
  const lastStateCommitRef = useRef(0);
  const cameraModeRef = useRef<NavigationCameraMode>("following");

  const filteredLocationRef = useRef<FilteredLocation | null>(null);
  const routeMatchRef = useRef<RouteMatchResult | null>(null);
  const routeRef = useRef<NavigationRoute | null>(null);
  const routeVersionRef = useRef(0);
  const offRouteCountRef = useRef(0);
  const arrivalCountRef = useRef(0);
  const arrivedRef = useRef(false);
  const requestingRouteRef = useRef(false);

  // --- Set up map-dependent objects once the map is ready.
  useEffect(() => {
    const handle = handleRef.current;
    if (mapStatus !== "ready" || !handle) return;

    if (destination && !destinationAnnotationRef.current) {
      destinationAnnotationRef.current = createDestinationAnnotation(handle.mapkit, handle.map, destination.coordinate);
    }
    if (!vehicleAnnotationRef.current) {
      const startCoordinate = lastCoordinateRef.current ?? destination?.coordinate ?? initialCenter;
      vehicleAnnotationRef.current = createVehicleAnnotation(handle.mapkit, startCoordinate, vehicleConfig);
      handle.map.addAnnotation(vehicleAnnotationRef.current.annotation);
    }
    if (!cameraRef.current) {
      cameraRef.current = createNavigationCamera(handle.map, handle.mapkit, theme);
    }
    if (!voiceGuidanceRef.current) {
      voiceGuidanceRef.current = createVoiceGuidance();
    }
  }, [mapStatus, destination, theme, vehicleConfig, initialCenter, handleRef]);

  // --- Full teardown on unmount.
  useEffect(() => {
    return () => {
      locationServiceRef.current?.stop();
      overlayManagerRef.current?.destroy();
      destinationAnnotationRef.current?.destroy();
      vehicleAnnotationRef.current?.destroy();
      cameraRef.current?.destroy();
      voiceGuidanceRef.current?.destroy();
      wakeLockRef.current?.release().catch(() => {});
      overlayManagerRef.current = null;
      destinationAnnotationRef.current = null;
      vehicleAnnotationRef.current = null;
      cameraRef.current = null;
      voiceGuidanceRef.current = null;
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
      setState((prev) => ({ ...prev, documentVisible: document.visibilityState === "visible" }));
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

  /** Requests a fresh MapKit route from `origin` to `destination` and
   *  installs it (initial route or an atomic reroute replacement — the route
   *  overlay manager's `setRoute` swaps geometry without a destroy/recreate
   *  flash). Guards against overlapping requests via `requestingRouteRef`. */
  const requestRoute = useCallback(
    async (origin: Coordinate, isReroute: boolean) => {
      const handle = handleRef.current;
      if (!handle || !destination || requestingRouteRef.current) return;
      requestingRouteRef.current = true;
      if (isReroute) {
        rerouteLimiterRef.current.markRerouteStarted();
        setState((prev) => ({ ...prev, status: "rerouting", isRerouting: true }));
        voiceGuidanceRef.current?.announce("rerouting", null);
      } else {
        setState((prev) => ({ ...prev, status: "calculating-route" }));
      }

      try {
        const directionsService = createMapKitDirectionsService(handle.mapkit);
        const result = await directionsService.requestRoute(origin, destination.coordinate);
        if (!result.routes.length) {
          setState((prev) => ({ ...prev, status: isReroute ? "navigating" : "error" }));
          return;
        }
        const [primary, ...alternates] = result.routes;
        routeRef.current = primary;
        routeVersionRef.current += 1;
        routeMatchRef.current = null;
        offRouteCountRef.current = 0;
        announcementDeduperRef.current.reset();

        if (!overlayManagerRef.current && handle) {
          overlayManagerRef.current = createRouteOverlayManager({
            map: handle.map,
            mapkit: handle.mapkit,
            route: primary,
            theme,
          });
        } else {
          overlayManagerRef.current?.setRoute(primary);
        }
        overlayManagerRef.current?.setAlternateRoutes(alternates);

        setState((prev) => ({
          ...prev,
          status: "navigating",
          route: primary,
          alternateRoutes: alternates,
          routeVersion: routeVersionRef.current,
          offRouteState: "on-route",
          isRerouting: false,
        }));
      } finally {
        requestingRouteRef.current = false;
        rerouteLimiterRef.current.markRerouteFinished();
      }
    },
    [destination, handleRef, theme]
  );

  // --- Start the real browser geolocation watch once the map is ready.
  useEffect(() => {
    if (!enabled || mapStatus !== "ready") return;

    const service = createBrowserLocationService();
    locationServiceRef.current = service;

    service.getPermissionState().then((permissionState) => {
      setState((prev) => ({ ...prev, permissionState }));
    });

    setState((prev) => ({ ...prev, status: prev.route ? prev.status : "requesting-location" }));

    service.start(
      (raw) => {
        const previousFiltered = filteredLocationRef.current;
        const filtered = filterLocation(raw, previousFiltered);
        if (filtered.rejected) return; // keep using the last good state
        filteredLocationRef.current = filtered;

        const prevCoordinate = lastCoordinateRef.current;
        const bearing =
          filtered.headingDegrees ??
          (prevCoordinate ? bearingBetween(prevCoordinate, filtered.coordinate) : lastBearingRef.current);
        lastCoordinateRef.current = filtered.coordinate;
        lastBearingRef.current = bearing;

        const route = routeRef.current;

        // Kick off the initial route calculation from the first good fix.
        if (!route && destination && !requestingRouteRef.current) {
          requestRoute(filtered.coordinate, false);
        }

        let displayCoordinate = filtered.coordinate;
        let cumulativeDistanceMeters = 0;

        if (route) {
          const match = matchLocationToRoute(filtered.coordinate, route, routeMatchRef.current, {
            accuracyMeters: filtered.accuracyMeters,
            headingDegrees: filtered.headingDegrees,
            speedMps: filtered.speedMps,
          });
          routeMatchRef.current = match;

          // Per product requirement: route-matched coordinates while
          // confidently on route, filtered raw coordinates while off route.
          displayCoordinate = match.matched ? match.coordinate : filtered.coordinate;
          cumulativeDistanceMeters = match.cumulativeDistanceMeters;

          const { state: offRouteState, consecutiveOffRouteCount } = evaluateOffRoute(
            match,
            filtered,
            offRouteCountRef.current,
            0
          );
          offRouteCountRef.current = consecutiveOffRouteCount;

          if (
            offRouteState === "confirmed-deviation" &&
            !requestingRouteRef.current &&
            rerouteLimiterRef.current.shouldReroute()
          ) {
            requestRoute(filtered.coordinate, true);
          }

          const progress = computeRouteProgress(route, cumulativeDistanceMeters);
          const straightLineToDestMeters = destination
            ? haversineDistanceMeters(filtered.coordinate, destination.coordinate)
            : Infinity;
          const arrival = evaluateArrival(
            progress.distanceRemainingMeters,
            straightLineToDestMeters,
            filtered.speedMps,
            arrivalCountRef.current
          );
          arrivalCountRef.current = arrival.nextConsecutiveCount;
          if (arrival.arrived && !arrivedRef.current) {
            arrivedRef.current = true;
            locationServiceRef.current?.stop();
            cameraRef.current?.setMode("arrival", { route, destination: destination?.coordinate });
            cameraModeRef.current = "arrival";
            voiceGuidanceRef.current?.announce("arrival", null);
          }

          if (!arrivedRef.current && stateRef.current.voiceGuidanceEnabled) {
            const stage = classifyAnnouncementStage(progress.distanceToNextManeuverMeters);
            if (stage) {
              const key = { routeVersion: routeVersionRef.current, stepIndex: progress.currentStepIndex, stage };
              if (!announcementDeduperRef.current.hasAnnounced(key)) {
                announcementDeduperRef.current.markAnnounced(key);
                voiceGuidanceRef.current?.announce(stage, route.steps[progress.currentStepIndex] ?? null);
              }
            }
          }

          overlayManagerRef.current?.updateProgress(cumulativeDistanceMeters);
          if (!arrivedRef.current) {
            cameraRef.current?.setMode(cameraModeRef.current, {
              route,
              destination: destination?.coordinate,
            });
          }

          const now = Date.now();
          if (now - lastStateCommitRef.current >= STATE_COMMIT_THROTTLE_MS) {
            lastStateCommitRef.current = now;
            setState((prev) => ({
              ...prev,
              status: arrivedRef.current ? "arrived" : prev.status === "calculating-route" ? prev.status : "navigating",
              rawLocation: raw,
              filteredLocation: filtered,
              routeMatchedLocation: match,
              currentBearing: bearing,
              lastReliableBearing: filtered.headingDegrees != null ? bearing : prev.lastReliableBearing,
              currentStepIndex: progress.currentStepIndex,
              distanceToNextManeuverMeters: progress.distanceToNextManeuverMeters,
              distanceTraveledMeters: progress.distanceTraveledMeters,
              distanceRemainingMeters: progress.distanceRemainingMeters,
              remainingDurationSeconds: progress.remainingDurationSeconds,
              estimatedArrival: progress.estimatedArrival,
              offRouteState,
              gpsAccuracyMeters: filtered.accuracyMeters,
              lastValidLocationTimestamp: filtered.timestamp,
            }));
          }
        } else {
          const now = Date.now();
          if (now - lastStateCommitRef.current >= STATE_COMMIT_THROTTLE_MS) {
            lastStateCommitRef.current = now;
            setState((prev) => ({
              ...prev,
              rawLocation: raw,
              filteredLocation: filtered,
              currentBearing: bearing,
              lastReliableBearing: filtered.headingDegrees != null ? bearing : prev.lastReliableBearing,
              gpsAccuracyMeters: filtered.accuracyMeters,
              lastValidLocationTimestamp: filtered.timestamp,
            }));
          }
        }

        vehicleAnnotationRef.current?.setCoordinate(displayCoordinate);
        vehicleAnnotationRef.current?.setHeading(bearing);
        const speed = filtered.speedMps ?? 0;
        vehicleAnnotationRef.current?.setMoving(speed > STATIONARY_SPEED_THRESHOLD_MPS);
        if (!arrivedRef.current) {
          cameraRef.current?.update(displayCoordinate, bearing, cumulativeDistanceMeters, speed);
        }
      },
      (err) => {
        const permissionState = err.reason === "permission-denied" ? "denied" : err.reason === "unsupported" ? "unsupported" : stateRef.current.permissionState;
        setState((prev) => ({
          ...prev,
          permissionState,
          status: prev.route ? prev.status : "error",
        }));
      }
    );

    return () => {
      service.stop();
      locationServiceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mapStatus, destination, requestRoute]);

  const setCameraMode = useCallback((mode: NavigationCameraMode) => {
    cameraModeRef.current = mode;
    cameraRef.current?.setMode(mode, {
      route: routeRef.current ?? undefined,
      destination: destination?.coordinate ?? undefined,
    });
    setState((prev) => ({ ...prev, cameraMode: mode, userMovedMap: mode === "user-controlled" }));
  }, [destination]);

  const resumeFollowing = useCallback(() => {
    cameraRef.current?.resume();
    cameraModeRef.current = "following";
    setState((prev) => ({ ...prev, cameraMode: "following", userMovedMap: false }));
  }, []);

  const setVoiceGuidanceEnabled = useCallback((value: boolean) => {
    voiceGuidanceRef.current?.setMuted(!value);
    if (!value) voiceGuidanceRef.current?.cancel();
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
