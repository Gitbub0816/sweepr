/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import type { GeolocationPermissionState, RawLocation } from "../types/navigation";

// TODO: wire to location/browserLocationService.ts once merged — that module
// (owned by the parallel navigation agent) will add accuracy/staleness
// filtering, movement heuristics, and permission-state polling via the
// Permissions API. This hook is a minimal, directly-functional stand-in built
// against the same RawLocation/GeolocationPermissionState contract so the
// rest of the navigation UI can be built and tested against it today.

export interface UseBrowserLocationResult {
  location: RawLocation | null;
  permissionState: GeolocationPermissionState;
  error: GeolocationPositionError | null;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};

export function useBrowserLocation(enabled: boolean): UseBrowserLocationResult {
  const [location, setLocation] = useState<RawLocation | null>(null);
  const [permissionState, setPermissionState] = useState<GeolocationPermissionState>("unknown");
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermissionState("unsupported");
      return;
    }

    // Best-effort permission-state read; not all browsers support the
    // Permissions API for "geolocation" (notably older Safari), so this is
    // wrapped defensively and never blocks the actual watchPosition call.
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          setPermissionState(status.state as GeolocationPermissionState);
          status.onchange = () => setPermissionState(status.state as GeolocationPermissionState);
        })
        .catch(() => {
          // Permissions API unsupported for this name — state will still
          // resolve to granted/denied once watchPosition succeeds/fails.
        });
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setPermissionState("granted");
        setError(null);
        setLocation({
          coordinate: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
          headingDegrees: position.coords.heading ?? null,
          speedMps: position.coords.speed ?? null,
          timestamp: position.timestamp,
        });
      },
      (err) => {
        setError(err);
        if (err.code === err.PERMISSION_DENIED) setPermissionState("denied");
      },
      WATCH_OPTIONS
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled]);

  return { location, permissionState, error };
}
