/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { bearingBetween, haversineDistanceMeters } from "../routing/routeGeometry";
import type { FilteredLocation, RawLocation } from "../types/navigation";

/** Fixes worse than this are rejected outright when a better recent fix
 *  exists (but never on the very first fix — we have nothing better yet). */
const MAX_ACCEPTABLE_ACCURACY_METERS = 100;

/** A home-cleaning cleaner's vehicle will never legitimately move faster
 *  than this (~215 kph). Anything above is a GPS glitch, not real motion. */
const MAX_PLAUSIBLE_SPEED_MPS = 60;

/** Movement below this (meters) between consecutive filtered fixes is GPS
 *  jitter, not real motion — don't derive a heading from it. */
const MIN_MOVEMENT_FOR_HEADING_METERS = 8;

/**
 * Filters a raw GPS fix against the previously accepted fix. Never throws —
 * a rejected update comes back with `rejected: true` and a reason so callers
 * can keep using the last good location instead of jumping the map around.
 */
export function filterLocation(raw: RawLocation, previous: FilteredLocation | null): FilteredLocation {
  if (!previous) {
    // Nothing to compare against yet — accept the first fix even if its
    // accuracy is mediocre; we have no better alternative.
    return { ...raw, rejected: false };
  }

  if (raw.timestamp < previous.timestamp) {
    return { ...raw, rejected: true, rejectReason: "stale" };
  }

  if (raw.accuracyMeters > MAX_ACCEPTABLE_ACCURACY_METERS && raw.accuracyMeters > previous.accuracyMeters) {
    return { ...raw, rejected: true, rejectReason: "accuracy" };
  }

  const dtSeconds = (raw.timestamp - previous.timestamp) / 1000;
  if (dtSeconds > 0) {
    const distanceMeters = haversineDistanceMeters(previous.coordinate, raw.coordinate);
    const impliedSpeedMps = distanceMeters / dtSeconds;
    if (impliedSpeedMps > MAX_PLAUSIBLE_SPEED_MPS) {
      return { ...raw, rejected: true, rejectReason: "implausible-speed" };
    }
  }

  const derivedHeading = deriveHeading(raw, previous);
  return {
    ...raw,
    headingDegrees: raw.headingDegrees ?? derivedHeading ?? previous.headingDegrees,
    rejected: false,
  };
}

/**
 * Derives a heading from two consecutive accepted fixes when the device
 * didn't supply a reliable one. Only derives direction when the movement
 * between the points clears `MIN_MOVEMENT_FOR_HEADING_METERS` — deriving a
 * bearing from near-identical points (stationary / jitter) produces noise,
 * not signal.
 */
function deriveHeading(current: RawLocation, previous: FilteredLocation): number | null {
  if (current.headingDegrees != null) return null;
  const distanceMeters = haversineDistanceMeters(previous.coordinate, current.coordinate);
  if (distanceMeters < MIN_MOVEMENT_FOR_HEADING_METERS) return null;
  return bearingBetween(previous.coordinate, current.coordinate);
}
