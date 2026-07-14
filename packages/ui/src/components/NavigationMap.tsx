/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { loadMapkit, bindMapTheme } from "@sweepr/ui";
import { Navigation, ChevronRight, Clock } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** Camera distance (meters) before a live position is known — wide enough to
 *  show the destination while geocoding/routing settles. */
const OVERVIEW_CAMERA_DISTANCE = 1500;
/** Camera distance (meters) once actively navigating — tight, street-level,
 *  tracking the driver the way Apple Maps' own turn-by-turn does, instead of
 *  a wide overview of the whole route. */
const NAV_CAMERA_DISTANCE = 400;

interface Step {
  instruction: string;
  distanceM: number;
  durationS: number;
  coordinate: [number, number] | null; // [lng, lat] of the step's start, for proximity matching
}

interface RouteResult {
  steps: Step[];
  totalDistanceM: number;
  totalDurationS: number;
  path: [number, number][]; // [lng, lat][]
}

async function fetchRoute(
  mapkit: any,
  origin: [number, number],
  dest: [number, number]
): Promise<RouteResult | null> {
  const directions = new mapkit.Directions();
  return new Promise((resolve) => {
    directions.route(
      {
        origin: new mapkit.Coordinate(origin[1], origin[0]),
        destination: new mapkit.Coordinate(dest[1], dest[0]),
      },
      (error: unknown, data: { routes?: Array<{
        distance: number;
        expectedTravelTime: number;
        steps: Array<{ instructions: string; distance: number; transportType: number; path?: Array<{ latitude: number; longitude: number }> }>;
        path: Array<{ latitude: number; longitude: number }>;
      }> }) => {
        if (error || !data.routes?.length) {
          resolve(null);
          return;
        }
        const route = data.routes[0];
        resolve({
          totalDistanceM: route.distance,
          // expectedTravelTime is already in seconds; do not divide again.
          totalDurationS: route.expectedTravelTime,
          path: route.path.map((c) => [c.longitude, c.latitude] as [number, number]),
          steps: route.steps
            .map((s): Step => ({
              instruction: s.instructions,
              distanceM: s.distance,
              durationS: 0,
              coordinate: s.path?.[0] ? [s.path[0].longitude, s.path[0].latitude] : null,
            }))
            // MapKit's leading "depart" step usually carries no instruction
            // text — drop it so the banner always shows a real maneuver.
            .filter((s) => s.instruction && s.instruction.trim().length > 0),
        });
      }
    );
  });
}

function geocodeAddress(mapkit: any, query: string): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    const search = new mapkit.Search();
    search.search(query, (error: unknown, data: { places?: Array<{ coordinate: { latitude: number; longitude: number } }> }) => {
      if (error || !data.places?.length) {
        resolve(null);
        return;
      }
      const { latitude, longitude } = data.places[0].coordinate;
      resolve([longitude, latitude]);
    });
  });
}

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface NavigationMapProps {
  destination: { lat: number; lng: number; label: string };
  currentLat: number | null;
  currentLng: number | null;
}

export function NavigationMap({ destination, currentLat, currentLng }: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapkitRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const posMarkerRef = useRef<any>(null);
  const routeOverlayRef = useRef<any>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const routeRef = useRef<RouteResult | null>(null);
  const lastFetchRef = useRef<number>(0);

  // Geocode destination address to coordinates
  const geocodeCache = useRef<{ label: string; coords: [number, number] } | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);

  // Init map + geocode once mapkit is ready
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapkit(API)
      .then(async (mapkit) => {
        if (cancelled) return;
        mapkitRef.current = mapkit;

        let coords: [number, number] = [destination.lng, destination.lat];
        if (geocodeCache.current?.label === destination.label) {
          coords = geocodeCache.current.coords;
        } else {
          const geocoded = await geocodeAddress(mapkit, destination.label);
          if (geocoded) {
            geocodeCache.current = { label: destination.label, coords: geocoded };
            coords = geocoded;
          }
        }
        if (cancelled) return;
        setDestCoords(coords);

        if (!containerRef.current || mapRef.current) return;
        const map = new mapkit.Map(containerRef.current, {
          center: new mapkit.Coordinate(coords[1], coords[0]),
          cameraDistance: OVERVIEW_CAMERA_DISTANCE,
          showsMapTypeControl: false,
        });
        mapRef.current = map;
        bindMapTheme(mapkit, map);

        destMarkerRef.current = new mapkit.MarkerAnnotation(
          new mapkit.Coordinate(coords[1], coords[0]),
          { color: "#14b8a6", glyphText: "\u{1F3E0}" }
        );
        map.addAnnotation(destMarkerRef.current);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.label]);

  // Update route line + fetch route
  const updateRoute = useCallback(
    async (lng: number, lat: number) => {
      const map = mapRef.current;
      const mapkit = mapkitRef.current;
      if (!map || !mapkit) return;

      const coord = new mapkit.Coordinate(lat, lng);
      if (!posMarkerRef.current) {
        posMarkerRef.current = new mapkit.MarkerAnnotation(coord, {
          color: "#14b8a6",
          glyphText: "\u{1F9F9}",
        });
        map.addAnnotation(posMarkerRef.current);
      } else {
        posMarkerRef.current.coordinate = coord;
      }

      // Track the driver tightly, like Apple Maps' own turn-by-turn, instead
      // of zooming out to fit the whole route on every update.
      map.setCenterAnimated(coord, true);
      map.cameraDistance = NAV_CAMERA_DISTANCE;

      // Throttle route fetches to every 30s
      const now = Date.now();
      if (now - lastFetchRef.current < 30_000 && routeRef.current) return;
      if (!destCoords) return;
      lastFetchRef.current = now;

      const result = await fetchRoute(mapkit, [lng, lat], destCoords);
      if (!result) return;
      routeRef.current = result;
      setRoute(result);

      // Update route line on map
      if (routeOverlayRef.current) map.removeOverlay(routeOverlayRef.current);
      const pathCoords = result.path.map(([plng, plat]) => new mapkit.Coordinate(plat, plng));
      routeOverlayRef.current = new mapkit.PolylineOverlay(pathCoords, {
        style: new mapkit.Style({ strokeColor: "#14b8a6", lineWidth: 5, lineJoin: "round", lineCap: "round" }),
      });
      map.addOverlay(routeOverlayRef.current);

      // Determine current step based on proximity
      const closestStep = result.steps.findIndex((s) => {
        if (!s.coordinate) return false;
        const dLng = s.coordinate[0] - lng;
        const dLat = s.coordinate[1] - lat;
        return Math.sqrt(dLng * dLng + dLat * dLat) < 0.005;
      });
      if (closestStep >= 0) setCurrentStepIdx(closestStep);
    },
    [destCoords]
  );

  useEffect(() => {
    if (currentLat === null || currentLng === null) return;
    updateRoute(currentLng, currentLat);
  }, [currentLat, currentLng, updateRoute]);

  const currentStep = route?.steps[currentStepIdx];
  const nextStep = route?.steps[currentStepIdx + 1];

  if (unavailable) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600">
        Navigation map unavailable
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Turn-by-turn instruction banner */}
      {currentStep && (
        <div className="bg-charcoal text-white px-4 py-3 flex items-start gap-3">
          <Navigation className="h-5 w-5 text-seafoam-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug truncate">{currentStep.instruction}</p>
            {nextStep && (
              <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                then: {nextStep.instruction}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-seafoam-400 font-medium">{fmtDist(currentStep.distanceM)}</p>
          </div>
        </div>
      )}

      {/* ETA bar */}
      {route && (
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-4 text-sm">
          <Clock className="h-4 w-4 text-seafoam-400 shrink-0" />
          <span className="font-semibold">{fmtDuration(route.totalDurationS)}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-600">{fmtDist(route.totalDistanceM)}</span>
          <span className="ml-auto text-seafoam-400 font-medium">
            ETA {new Date(Date.now() + route.totalDurationS * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      <div ref={containerRef} className="h-[300px] w-full" role="img" aria-label="Navigation map" />
    </div>
  );
}
