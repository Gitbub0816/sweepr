/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { GeolocationPermissionState, RawLocation } from "../types/navigation";

/** Options passed straight through to `navigator.geolocation.watchPosition`. */
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
};

export type LocationServiceErrorReason =
  | "permission-denied"
  | "position-unavailable"
  | "timeout"
  | "unsupported"
  | "insecure-context";

export interface LocationServiceError {
  reason: LocationServiceErrorReason;
  message: string;
}

export interface BrowserLocationService {
  /** Begins watching position. Safe to call even when geolocation is
   *  unsupported or the context is insecure — `onError` fires immediately
   *  in that case instead of throwing. */
  start(onUpdate: (loc: RawLocation) => void, onError: (err: LocationServiceError) => void): void;
  stop(): void;
  /** Best-effort permission state. Resolves via the Permissions API when
   *  available; falls back to "unknown" on browsers that don't implement it
   *  (e.g. Safari) rather than pretending to know. */
  getPermissionState(): Promise<GeolocationPermissionState>;
}

function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function isSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

function toRawLocation(position: GeolocationPosition): RawLocation {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  return {
    coordinate: { lat: latitude, lng: longitude },
    accuracyMeters: accuracy,
    headingDegrees: heading != null && !Number.isNaN(heading) ? heading : null,
    speedMps: speed != null && !Number.isNaN(speed) ? speed : null,
    timestamp: position.timestamp,
  };
}

function toLocationServiceError(err: GeolocationPositionError): LocationServiceError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return { reason: "permission-denied", message: "Location permission was denied." };
    case err.POSITION_UNAVAILABLE:
      return { reason: "position-unavailable", message: "Location is currently unavailable." };
    case err.TIMEOUT:
      return { reason: "timeout", message: "Timed out waiting for a location fix." };
    default:
      return { reason: "position-unavailable", message: err.message || "Unknown geolocation error." };
  }
}

/** Wraps `navigator.geolocation.watchPosition` with honest capability
 *  detection. Does not promise background operation — the browser suspends
 *  or throttles geolocation callbacks when the tab is backgrounded, and this
 *  service does not attempt to paper over that. */
export function createBrowserLocationService(): BrowserLocationService {
  let watchId: number | null = null;

  return {
    start(onUpdate, onError) {
      if (!isSecureContext()) {
        onError({ reason: "insecure-context", message: "Geolocation requires a secure (HTTPS) context." });
        return;
      }
      if (!isGeolocationSupported()) {
        onError({ reason: "unsupported", message: "This browser does not support geolocation." });
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (position) => onUpdate(toRawLocation(position)),
        (err) => onError(toLocationServiceError(err)),
        WATCH_OPTIONS
      );
    },

    stop() {
      if (watchId != null && isGeolocationSupported()) {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
    },

    async getPermissionState(): Promise<GeolocationPermissionState> {
      if (!isSecureContext()) return "unsupported";
      if (!isGeolocationSupported()) return "unsupported";
      const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
      if (!permissions || typeof permissions.query !== "function") return "unknown";
      try {
        const status = await permissions.query({ name: "geolocation" as PermissionName });
        if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
          return status.state;
        }
        return "unknown";
      } catch {
        return "unknown";
      }
    },
  };
}
