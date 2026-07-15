/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { bearingBetween, interpolateCoordinate } from "../routing/routeGeometry";
import type { Coordinate, NavigationRoute, SimulatedLocationSample, SimulationScenario } from "../types/navigation";

const NORMAL_SPEED_MPS = 12;
const HIGHWAY_SPEED_MPS = 25;
const URBAN_SPEED_MPS = 10;
const SAMPLE_INTERVAL_MS = 1000;

function speedForScenario(scenario: SimulationScenario): number {
  switch (scenario) {
    case "highway-speed":
      return HIGHWAY_SPEED_MPS;
    case "urban-driving":
    case "wrong-turn":
    case "off-route":
    case "parallel-road":
    case "reroute":
      return URBAN_SPEED_MPS;
    default:
      return NORMAL_SPEED_MPS;
  }
}

/** Walks `distanceMeters` along the route path starting from `fromMeters`,
 *  returning the coordinate and the segment bearing at that point. */
function pointAtDistance(route: NavigationRoute, distanceMeters: number): { coordinate: Coordinate; headingDegrees: number } {
  const { path, cumulativeDistances } = route;
  const total = cumulativeDistances[cumulativeDistances.length - 1];
  const clamped = Math.max(0, Math.min(distanceMeters, total));

  for (let i = 0; i < cumulativeDistances.length - 1; i++) {
    if (cumulativeDistances[i + 1] >= clamped) {
      const segStart = cumulativeDistances[i];
      const segEnd = cumulativeDistances[i + 1];
      const t = segEnd === segStart ? 0 : (clamped - segStart) / (segEnd - segStart);
      return {
        coordinate: interpolateCoordinate(path[i], path[i + 1], t),
        headingDegrees: bearingBetween(path[i], path[i + 1]),
      };
    }
  }
  const last = path.length >= 2 ? path.length - 2 : 0;
  return {
    coordinate: path[path.length - 1],
    headingDegrees: bearingBetween(path[last], path[path.length - 1]),
  };
}

/** Offsets a coordinate perpendicular to `headingDegrees` by roughly
 *  `offsetMeters` — used to simulate diverging from the route (wrong turns,
 *  parallel roads) without needing a second real road geometry. */
function offsetPerpendicular(coordinate: Coordinate, headingDegrees: number, offsetMeters: number): Coordinate {
  const perpendicularRad = ((headingDegrees + 90) * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((coordinate.lat * Math.PI) / 180) || 1;
  return {
    lat: coordinate.lat + (Math.sin(perpendicularRad) * offsetMeters) / metersPerDegLat,
    lng: coordinate.lng + (Math.cos(perpendicularRad) * offsetMeters) / metersPerDegLng,
  };
}

/**
 * Generates a full sample sequence for a scenario by walking `route.path`
 * at a scenario-appropriate speed and injecting the scenario's specific
 * perturbation. Returns an array (not a lazy generator) so tests and the
 * simulator controller can both consume it deterministically.
 */
export function generateSimulationSamples(
  route: NavigationRoute,
  scenario: SimulationScenario,
  startTimestamp: number = Date.now()
): SimulatedLocationSample[] {
  const speed = speedForScenario(scenario);
  const total = route.totalDistanceMeters;
  const distancePerSample = speed * (SAMPLE_INTERVAL_MS / 1000);
  const sampleCount = Math.max(1, Math.ceil(total / distancePerSample) + 1);

  const samples: SimulatedLocationSample[] = [];
  let stoppedUntilIndex = -1;

  for (let i = 0; i < sampleCount; i++) {
    const nominalDistance = Math.min(i * distancePerSample, total);
    const timestamp = startTimestamp + i * SAMPLE_INTERVAL_MS;
    let { coordinate, headingDegrees } = pointAtDistance(route, nominalDistance);
    let accuracyMeters = 8;
    let sampleSpeed = speed;

    if (scenario === "stop-and-resume" && i > 0 && i % 12 === 0) {
      stoppedUntilIndex = i + 4;
    }
    if (i <= stoppedUntilIndex) {
      sampleSpeed = 0;
      const held = pointAtDistance(route, Math.min((stoppedUntilIndex - 4) * distancePerSample, total));
      coordinate = held.coordinate;
      headingDegrees = held.headingDegrees;
    }

    if (scenario === "poor-accuracy") {
      accuracyMeters = 80 + Math.random() * 60;
    }

    if ((scenario === "off-route" || scenario === "wrong-turn" || scenario === "reroute") && i > 3 && i < sampleCount - 3) {
      coordinate = offsetPerpendicular(coordinate, headingDegrees, 70);
    }

    if (scenario === "parallel-road") {
      // A consistent, smaller offset the whole way — close enough to look
      // plausibly on-route by distance alone, but on a different heading
      // once the road curves, and never converges back to the real path.
      coordinate = offsetPerpendicular(coordinate, headingDegrees, 25);
    }

    if (scenario === "gps-jump" && i > 0 && i % 15 === 0) {
      coordinate = offsetPerpendicular(coordinate, headingDegrees, 400);
      accuracyMeters = 15;
    }

    samples.push({
      coordinate,
      headingDegrees,
      speedMps: sampleSpeed,
      accuracyMeters,
      timestamp,
    });
  }

  return samples;
}

export interface NavigationSimulatorController {
  start(onUpdate: (sample: SimulatedLocationSample) => void): void;
  pause(): void;
  resume(): void;
  reset(): void;
  setSpeedMultiplier(multiplier: number): void;
  /** Forces the next several emitted samples to diverge from the route,
   *  regardless of the configured scenario — for manually triggering
   *  off-route/reroute UI during a demo. */
  forceOffRoute(): void;
}

/**
 * Drives a pre-generated sample sequence on an interval, gated by a speed
 * multiplier, emitting samples through the SAME callback signature
 * `browserLocationService` uses (mapped into a `RawLocation`-shaped object
 * by the caller) so the rest of the pipeline can't tell simulated samples
 * from real geolocation updates.
 */
export function createNavigationSimulatorController(
  route: NavigationRoute,
  scenario: SimulationScenario
): NavigationSimulatorController {
  let samples = generateSimulationSamples(route, scenario);
  let index = 0;
  let speedMultiplier = 1;
  let paused = true;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let forcedOffRoute = false;
  let onUpdate: ((sample: SimulatedLocationSample) => void) | null = null;

  function tick() {
    if (paused || !onUpdate) return;
    if (index >= samples.length) {
      if (intervalId != null) clearInterval(intervalId);
      intervalId = null;
      return;
    }
    let sample = samples[index];
    if (forcedOffRoute) {
      sample = {
        ...sample,
        coordinate: offsetPerpendicular(sample.coordinate, sample.headingDegrees ?? 0, 100),
      };
    }
    onUpdate(sample);
    index += 1;
  }

  function restartInterval() {
    if (intervalId != null) clearInterval(intervalId);
    if (paused) return;
    intervalId = setInterval(tick, SAMPLE_INTERVAL_MS / Math.max(0.1, speedMultiplier));
  }

  return {
    start(cb) {
      onUpdate = cb;
      paused = false;
      index = 0;
      restartInterval();
    },
    pause() {
      paused = true;
      if (intervalId != null) clearInterval(intervalId);
      intervalId = null;
    },
    resume() {
      if (!paused) return;
      paused = false;
      restartInterval();
    },
    reset() {
      index = 0;
      forcedOffRoute = false;
      samples = generateSimulationSamples(route, scenario);
    },
    setSpeedMultiplier(multiplier: number) {
      speedMultiplier = multiplier;
      restartInterval();
    },
    forceOffRoute() {
      forcedOffRoute = true;
    },
  };
}
