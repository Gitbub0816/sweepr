/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { stepIndexForCumulativeDistance } from "./routeGeometry";
import type { NavigationRoute } from "../types/navigation";

export interface RouteProgress {
  distanceTraveledMeters: number;
  distanceRemainingMeters: number;
  currentStepIndex: number;
  distanceToNextManeuverMeters: number;
  remainingDurationSeconds: number;
  estimatedArrival: Date;
}

/**
 * Computes trip progress from a route and the current cumulative distance
 * along it (from a route match). All distances are clamped to sane ranges
 * so noisy inputs (e.g. a cumulative distance slightly past the route end)
 * can't produce negative progress.
 */
export function computeRouteProgress(route: NavigationRoute, currentCumulativeDistanceMeters: number): RouteProgress {
  const total = route.totalDistanceMeters;
  const distanceTraveledMeters = Math.max(0, Math.min(currentCumulativeDistanceMeters, total));
  const distanceRemainingMeters = Math.max(0, total - distanceTraveledMeters);

  const currentStepIndex = stepIndexForCumulativeDistance(route, distanceTraveledMeters);
  const nextStep = route.steps[currentStepIndex + 1];
  const distanceToNextManeuverMeters = nextStep
    ? Math.max(0, nextStep.cumulativeDistanceMeters - distanceTraveledMeters)
    : distanceRemainingMeters;

  const remainingDurationSeconds =
    total > 0 ? route.expectedTravelTimeSeconds * (distanceRemainingMeters / total) : 0;

  const estimatedArrival = new Date(Date.now() + remainingDurationSeconds * 1000);

  return {
    distanceTraveledMeters,
    distanceRemainingMeters,
    currentStepIndex,
    distanceToNextManeuverMeters,
    remainingDurationSeconds,
    estimatedArrival,
  };
}
