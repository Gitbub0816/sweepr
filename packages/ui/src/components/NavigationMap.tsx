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
 * Route-preview map for the cleaner day-of-service flow.
 *
 * Mapbox GL JS's web SDK is NOT licensed for turn-by-turn navigation, so this
 * is deliberately a PREVIEW: it shows the destination, the driver's live
 * location, and a route line fetched from the Mapbox Directions API — but NO
 * step-by-step maneuver banner, NO ETA auto-advance, and NO driver-tracking
 * camera. Real turn-by-turn is handed off to the native maps app via the
 * "Open in Maps" button (`openInMapsUrl`).
 *
 * The prop shape is preserved from the old MapKit turn-by-turn version so the
 * cleaner app keeps compiling:
 *   { destination: { lat, lng, label }, currentLat, currentLng }
 * (The old version also geocoded `destination.label`; that is gone — we trust
 *  the lat/lng the caller passes. `label` is now used only for display and the
 *  destination popup.)
 */

import { useEffect, useRef, useState } from "react";
import { Clock, MapPin, Navigation } from "lucide-react";
import {
  mapboxgl,
  createMapboxMap,
  getMapboxToken,
  bindMapTheme,
  openInMapsUrl,
} from "../lib/mapbox";

const SEAFOAM = "#14b8a6";
const ROUTE_SOURCE = "nav-route";
const ROUTE_LAYER = "nav-route-line";

interface RouteResult {
  geometry: GeoJSON.LineString;
  distanceM: number;
  durationS: number;
}

async function fetchRoute(
  origin: [number, number],
  dest: [number, number],
  token: string,
): Promise<RouteResult | null> {
  const coords = `${origin[0]},${origin[1]};${dest[0]},${dest[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ geometry: GeoJSON.LineString; distance: number; duration: number }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    return { geometry: route.geometry, distanceM: route.distance, durationS: route.duration };
  } catch {
    return null;
  }
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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const posMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastFetchRef = useRef<number>(0);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const token = getMapboxToken();
  const destCoords: [number, number] = [destination.lng, destination.lat];

  // Init map once.
  useEffect(() => {
    if (!token) {
      setUnavailable(true);
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    const map = createMapboxMap(containerRef.current, {
      center: destCoords,
      zoom: 13,
    });
    if (!map) {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    const unbindTheme = bindMapTheme(map);

    destMarkerRef.current = new mapboxgl.Marker({ color: SEAFOAM })
      .setLngLat(destCoords)
      .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(destination.label))
      .addTo(map);

    return () => {
      unbindTheme();
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      posMarkerRef.current?.remove();
      posMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.lat, destination.lng, destination.label, token]);

  // Update live position marker + route line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentLat === null || currentLng === null) return;
    const pos: [number, number] = [currentLng, currentLat];

    // Live-location dot.
    if (!posMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#14b8a6;" +
        "border:3px solid #fff;box-shadow:0 0 0 4px rgba(20,184,166,0.35);";
      posMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(pos).addTo(map);
    } else {
      posMarkerRef.current.setLngLat(pos);
    }

    // Throttle route fetches to every 30s.
    const now = Date.now();
    if (now - lastFetchRef.current < 30_000 && route) return;
    lastFetchRef.current = now;

    let cancelled = false;
    fetchRoute(pos, destCoords, token).then((result) => {
      if (cancelled || !result) return;
      setRoute(result);
      const drawLine = () => {
        const feature: GeoJSON.Feature = {
          type: "Feature",
          properties: {},
          geometry: result.geometry,
        };
        const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData(feature);
        } else {
          map.addSource(ROUTE_SOURCE, { type: "geojson", data: feature });
          map.addLayer({
            id: ROUTE_LAYER,
            type: "line",
            source: ROUTE_SOURCE,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": SEAFOAM, "line-width": 5 },
          });
        }
        // Fit both endpoints in view (a preview, not a tracking camera).
        const bounds = new mapboxgl.LngLatBounds(pos, pos).extend(destCoords);
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: true });
      };
      if (map.isStyleLoaded()) drawLine();
      else map.once("load", drawLine);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLat, currentLng, token]);

  const openHref = openInMapsUrl(destination.lat, destination.lng, destination.label);

  if (unavailable) {
    return (
      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex h-48 items-center justify-center bg-seafoam-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300">
          Route preview unavailable
        </div>
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-charcoal text-white px-4 py-3 text-sm font-semibold"
        >
          <Navigation className="h-4 w-4 text-seafoam-400" /> Open in Maps
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Route summary bar (distance + estimated time — NOT live turn-by-turn) */}
      {route && (
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-4 text-sm">
          <Clock className="h-4 w-4 text-seafoam-400 shrink-0" />
          <span className="font-semibold">{fmtDuration(route.durationS)}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-400">{fmtDist(route.distanceM)}</span>
          <span className="ml-auto flex items-center gap-1 text-seafoam-400 font-medium">
            <MapPin className="h-3.5 w-3.5" /> Preview
          </span>
        </div>
      )}

      <div ref={containerRef} className="h-[300px] w-full" role="img" aria-label="Route preview map" />

      {/* Handoff to the native maps app for real navigation. */}
      <a
        href={openHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 bg-charcoal text-white px-4 py-3 text-sm font-semibold hover:bg-slate-800 transition-colors"
      >
        <Navigation className="h-4 w-4 text-seafoam-400" /> Open in Maps
      </a>
    </div>
  );
}
