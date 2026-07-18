/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Shared type contract for the in-browser navigation module. This is a web
 * approximation of turn-by-turn navigation built on MapKit JS 6 — it does
 * NOT have access to native MKMapView, CoreLocation, native lane guidance,
 * native junction rendering, or CarPlay. Every type here reflects only what
 * MapKit JS's directions/annotation/overlay APIs and the browser Geolocation
 * API actually expose. See ../README.md for the full list of browser
 * limitations this module deliberately does not paper over.
 */

export type NavigationStatus =
  | "idle"
  | "requesting-location"
  | "calculating-route"
  | "route-preview"
  | "navigating"
  | "rerouting"
  | "arrived"
  | "paused"
  | "error";

export type NavigationCameraMode =
  | "following"
  | "maneuver-preview"
  | "overview"
  | "user-controlled"
  | "arrival";

export interface Coordinate {
  lat: number;
  lng: number;
}

/** Normalized route step — only fields MapKit JS's directions response
 *  actually returns. No lane arrows, exit signage, or junction imagery. */
export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  /** [lng, lat] path points for this step, when MapKit provides them. */
  geometry: Coordinate[];
  /** Cumulative distance (meters) from route start to this step's start. */
  cumulativeDistanceMeters: number;
}

/** App-owned route model — the rest of the app depends on this, never on
 *  MapKit's raw response shape. */
export interface NavigationRoute {
  id: string;
  name: string;
  totalDistanceMeters: number;
  expectedTravelTimeSeconds: number;
  steps: RouteStep[];
  /** Full route polyline, densified for matching/interpolation. */
  path: Coordinate[];
  /** Cumulative distance (meters) at each `path` index — same length as `path`. */
  cumulativeDistances: number[];
}

export interface RawLocation {
  coordinate: Coordinate;
  accuracyMeters: number;
  headingDegrees: number | null;
  speedMps: number | null;
  timestamp: number;
}

/** Result of location filtering — same shape as RawLocation, plus a flag for
 *  why an update was accepted/rejected (useful for tests + debugging). */
export interface FilteredLocation extends RawLocation {
  rejected: boolean;
  rejectReason?: "accuracy" | "implausible-speed" | "stale" | "no-movement";
}

/** Result of projecting a location onto the route polyline. */
export interface RouteMatchResult {
  matched: boolean;
  coordinate: Coordinate;
  segmentIndex: number;
  distanceFromRouteMeters: number;
  cumulativeDistanceMeters: number;
  confidence: number; // 0..1
}

export interface NavigationTheme {
  activeRouteColor: string;
  routeCasingColor: string;
  completedRouteColor: string;
  alternateRouteColor: string;
  upcomingManeuverColor: string;
}

export const DEFAULT_NAVIGATION_THEME: NavigationTheme = {
  activeRouteColor: "#14b8a6",
  routeCasingColor: "#0f172a",
  completedRouteColor: "#94a3b8",
  alternateRouteColor: "#cbd5e1",
  upcomingManeuverColor: "#f59e0b",
};

export interface VehicleMarkerConfig {
  animationPath: string;
  width: number;
  height: number;
  headingOffsetDegrees: number;
  animationSpeed: number;
  loop: boolean;
  pauseWhenStationary: boolean;
}

export const DEFAULT_VEHICLE_MARKER_CONFIG: VehicleMarkerConfig = {
  animationPath: "https://objects.getsweepr.com/site_assets/public/broom-loading.json",
  width: 56,
  height: 56,
  headingOffsetDegrees: 0,
  animationSpeed: 1,
  loop: true,
  pauseWhenStationary: true,
};

export interface AnimatedVehicleState {
  displayedCoordinate: Coordinate;
  targetCoordinate: Coordinate;
  displayedHeading: number;
  targetHeading: number;
  lastFrameTime: number;
}

export type GeolocationPermissionState = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export type OffRouteState = "on-route" | "possible-deviation" | "confirmed-deviation" | "rerouting";

/** Full navigation session state. UI-facing fields (status, distances, ETA,
 *  camera mode, flags) belong in React state. High-frequency fields
 *  (rawLocation, filteredLocation, bearing) should live in refs and only
 *  surface to React at a throttled cadence — see useNavigationSession. */
export interface NavigationSessionState {
  status: NavigationStatus;
  route: NavigationRoute | null;
  alternateRoutes: NavigationRoute[];
  routeVersion: number;

  rawLocation: RawLocation | null;
  filteredLocation: FilteredLocation | null;
  routeMatchedLocation: RouteMatchResult | null;
  currentBearing: number;
  lastReliableBearing: number;

  currentStepIndex: number;
  distanceToNextManeuverMeters: number;
  distanceTraveledMeters: number;
  distanceRemainingMeters: number;
  remainingDurationSeconds: number;
  estimatedArrival: Date | null;

  cameraMode: NavigationCameraMode;
  userMovedMap: boolean;
  voiceGuidanceEnabled: boolean;

  offRouteState: OffRouteState;
  isRerouting: boolean;

  documentVisible: boolean;
  permissionState: GeolocationPermissionState;
  gpsAccuracyMeters: number | null;
  lastValidLocationTimestamp: number | null;
}

export const INITIAL_NAVIGATION_SESSION_STATE: NavigationSessionState = {
  status: "idle",
  route: null,
  alternateRoutes: [],
  routeVersion: 0,
  rawLocation: null,
  filteredLocation: null,
  routeMatchedLocation: null,
  currentBearing: 0,
  lastReliableBearing: 0,
  currentStepIndex: 0,
  distanceToNextManeuverMeters: 0,
  distanceTraveledMeters: 0,
  distanceRemainingMeters: 0,
  remainingDurationSeconds: 0,
  estimatedArrival: null,
  cameraMode: "following",
  userMovedMap: false,
  voiceGuidanceEnabled: true,
  offRouteState: "on-route",
  isRerouting: false,
  documentVisible: true,
  permissionState: "unknown",
  gpsAccuracyMeters: null,
  lastValidLocationTimestamp: null,
};

export type VoiceAnnouncementStage = "early-warning" | "approaching" | "final" | "rerouting" | "arrival";

export interface VoiceAnnouncementKey {
  routeVersion: number;
  stepIndex: number;
  stage: VoiceAnnouncementStage;
}
