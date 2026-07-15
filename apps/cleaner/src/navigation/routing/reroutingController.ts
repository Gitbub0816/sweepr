/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { FilteredLocation, OffRouteState, RouteMatchResult } from "../types/navigation";

/** Distance from route (meters) beyond which a single sample counts as a
 *  possible deviation. */
const OFF_ROUTE_DISTANCE_METERS = 45;

/** GPS accuracy worse than this can't reliably confirm a deviation — a
 *  single noisy fix should never flip us into "confirmed-deviation". */
const MAX_TRUSTED_ACCURACY_METERS = 50;

/** Consecutive off-route samples required before escalating from
 *  "possible-deviation" to "confirmed-deviation" — hysteresis against a
 *  single noisy point or a momentary parallel-road blip. */
const CONFIRM_DEVIATION_SAMPLE_COUNT = 4;

/**
 * Evaluates off-route state for the current sample given the running count
 * of consecutive off-route samples. Callers own the counter — pass the
 * value from the previous call's `consecutiveOffRouteCount` output (this
 * function is pure, it does not persist anything itself).
 */
export function evaluateOffRoute(
  match: RouteMatchResult | null,
  filtered: FilteredLocation,
  consecutiveOffRouteCount: number,
  _msSinceLastOffRoute: number
): { state: OffRouteState; consecutiveOffRouteCount: number } {
  const distanceFromRoute = match?.distanceFromRouteMeters ?? Infinity;
  const trustedFix = filtered.accuracyMeters <= MAX_TRUSTED_ACCURACY_METERS;
  const isOffRouteSample = trustedFix && (!match?.matched || distanceFromRoute > OFF_ROUTE_DISTANCE_METERS);

  if (!isOffRouteSample) {
    return { state: "on-route", consecutiveOffRouteCount: 0 };
  }

  const nextCount = consecutiveOffRouteCount + 1;
  if (nextCount >= CONFIRM_DEVIATION_SAMPLE_COUNT) {
    return { state: "confirmed-deviation", consecutiveOffRouteCount: nextCount };
  }
  return { state: "possible-deviation", consecutiveOffRouteCount: nextCount };
}

const MIN_REROUTE_INTERVAL_MS = 15_000;
/** Safety valve — if a pending reroute request never resolves (e.g. network
 *  hang), stop blocking new attempts after this long. */
const PENDING_TIMEOUT_MS = 20_000;

export interface RerouteRateLimiter {
  shouldReroute(): boolean;
  markRerouteStarted(): void;
  markRerouteFinished(): void;
}

/**
 * Enforces a minimum interval between reroute requests and prevents
 * overlapping in-flight directions requests — a new reroute request while
 * one is pending is a no-op until it resolves (or the safety timeout hits).
 */
export function createRerouteRateLimiter(now: () => number = () => Date.now()): RerouteRateLimiter {
  let lastRerouteAt = -Infinity;
  let pending = false;
  let pendingStartedAt = 0;

  return {
    shouldReroute() {
      if (pending && now() - pendingStartedAt < PENDING_TIMEOUT_MS) return false;
      if (pending) pending = false; // safety timeout elapsed — unstick
      return now() - lastRerouteAt >= MIN_REROUTE_INTERVAL_MS;
    },
    markRerouteStarted() {
      pending = true;
      pendingStartedAt = now();
      lastRerouteAt = now();
    },
    markRerouteFinished() {
      pending = false;
    },
  };
}
