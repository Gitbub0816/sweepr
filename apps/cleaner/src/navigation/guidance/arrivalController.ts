/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/** Both the remaining-route-distance and straight-line-distance checks must
 *  clear this threshold (meters) before arrival is even considered —
 *  protects against a noisy route-distance calculation near complex
 *  intersections that could otherwise under-report distance remaining. */
const ARRIVAL_DISTANCE_THRESHOLD_METERS = 30;

/** Consecutive qualifying samples required before declaring arrival —
 *  mirrors the off-route hysteresis pattern so one noisy point can't
 *  falsely end navigation. */
const ARRIVAL_CONFIRM_SAMPLE_COUNT = 3;

export interface ArrivalEvaluation {
  arrived: boolean;
  nextConsecutiveCount: number;
}

/**
 * Evaluates whether the cleaner has arrived at the destination. Requires
 * BOTH the route-relative remaining distance and the straight-line
 * (haversine) distance to the destination to be under the threshold — using
 * only one of the two is unreliable near complex intersections or when the
 * route match itself is uncertain — and requires several consecutive
 * qualifying samples, not a single reading.
 */
export function evaluateArrival(
  distanceRemainingMeters: number,
  straightLineDistanceToDestMeters: number,
  _speedMps: number | null,
  consecutiveNearDestinationCount: number
): ArrivalEvaluation {
  const qualifies =
    distanceRemainingMeters <= ARRIVAL_DISTANCE_THRESHOLD_METERS &&
    straightLineDistanceToDestMeters <= ARRIVAL_DISTANCE_THRESHOLD_METERS;

  if (!qualifies) {
    return { arrived: false, nextConsecutiveCount: 0 };
  }

  const nextConsecutiveCount = consecutiveNearDestinationCount + 1;
  return {
    arrived: nextConsecutiveCount >= ARRIVAL_CONFIRM_SAMPLE_COUNT,
    nextConsecutiveCount,
  };
}
