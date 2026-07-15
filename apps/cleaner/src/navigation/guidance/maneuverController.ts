/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { computeRouteProgress } from "../routing/routeProgress";
import type { NavigationRoute, RouteStep, VoiceAnnouncementKey, VoiceAnnouncementStage } from "../types/navigation";

/** Distance-to-maneuver thresholds (meters) that gate each announcement
 *  stage. Named constants — never inline these as magic numbers. */
export const EARLY_WARNING_DISTANCE_METERS = 800;
export const APPROACHING_DISTANCE_METERS = 200;
export const FINAL_DISTANCE_METERS = 50;

/** The subset of `VoiceAnnouncementStage` this classifier can produce —
 *  "rerouting" and "arrival" are driven by other controllers, not distance
 *  to the next maneuver. */
export type ManeuverAnnouncementStage = Extract<VoiceAnnouncementStage, "early-warning" | "approaching" | "final">;

export interface CurrentManeuver {
  currentStep: RouteStep | null;
  nextStep: RouteStep | null;
  distanceToManeuverMeters: number;
}

/** Resolves the current/next step and distance-to-maneuver from a route and
 *  the current cumulative distance, reusing `computeRouteProgress` so this
 *  stays consistent with the ETA/distance-remaining math. */
export function getCurrentManeuver(route: NavigationRoute, currentCumulativeDistanceMeters: number): CurrentManeuver {
  const progress = computeRouteProgress(route, currentCumulativeDistanceMeters);
  const currentStep = route.steps[progress.currentStepIndex] ?? null;
  const nextStep = route.steps[progress.currentStepIndex + 1] ?? null;
  return {
    currentStep,
    nextStep,
    distanceToManeuverMeters: progress.distanceToNextManeuverMeters,
  };
}

/**
 * Classifies which voice-announcement stage (if any) is due for the current
 * distance to the next maneuver. Returns `null` when no announcement should
 * fire yet — callers should not speak anything in that case.
 */
export function classifyAnnouncementStage(distanceToManeuverMeters: number): ManeuverAnnouncementStage | null {
  if (distanceToManeuverMeters <= FINAL_DISTANCE_METERS) return "final";
  if (distanceToManeuverMeters <= APPROACHING_DISTANCE_METERS) return "approaching";
  if (distanceToManeuverMeters <= EARLY_WARNING_DISTANCE_METERS) return "early-warning";
  return null;
}

function serializeKey(key: VoiceAnnouncementKey): string {
  return `${key.routeVersion}:${key.stepIndex}:${key.stage}`;
}

/**
 * Tracks which announcement keys (routeVersion + stepIndex + stage) have
 * already fired, so repeated distance updates within the same stage don't
 * re-announce. Clears automatically when `routeVersion` changes (a reroute
 * invalidates all prior announcement state).
 */
export class AnnouncementDeduper {
  private announced = new Set<string>();
  private currentRouteVersion: number | null = null;

  /** Returns true if this exact key has already been announced (and should
   *  NOT fire again); false if it's new (and the caller should announce and
   *  record it via `markAnnounced`). */
  hasAnnounced(key: VoiceAnnouncementKey): boolean {
    this.maybeResetForRouteVersion(key.routeVersion);
    return this.announced.has(serializeKey(key));
  }

  markAnnounced(key: VoiceAnnouncementKey): void {
    this.maybeResetForRouteVersion(key.routeVersion);
    this.announced.add(serializeKey(key));
  }

  reset(): void {
    this.announced.clear();
    this.currentRouteVersion = null;
  }

  private maybeResetForRouteVersion(routeVersion: number): void {
    if (this.currentRouteVersion !== routeVersion) {
      this.announced.clear();
      this.currentRouteVersion = routeVersion;
    }
  }
}
