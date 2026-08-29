/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef } from "react";
import type { Feature } from "geojson";
import {
  mapboxgl,
  createMapboxMap,
  getMapboxToken,
  bindMapTheme,
} from "../lib/mapbox";

export interface MapboxMarker {
  /** [lng, lat] */
  lngLat: [number, number];
  /** CSS color for the marker pin (defaults to Sweepr seafoam). */
  color?: string;
  /** Accessible label / popup text. */
  label?: string;
}

export interface MapboxMapProps {
  /** Initial center as [lng, lat]. Ignored when `fitTo` is provided. */
  center?: [number, number];
  zoom?: number;
  markers?: MapboxMarker[];
  /** A GeoJSON LineString/Feature to draw as a route line, or null. */
  routeGeoJSON?: Feature | null;
  /** A pulsing live-location dot at [lng, lat], or null. */
  liveLocation?: [number, number] | null;
  /** Whether the map responds to drag/zoom. Defaults to true. */
  interactive?: boolean;
  /** Fit the viewport to these [lng, lat] points (overrides center/zoom). */
  fitTo?: [number, number][];
  className?: string;
  /** Called once with the map instance after it loads, for custom control. */
  onMap?: (map: mapboxgl.Map) => void;
}

const SEAFOAM = "#14b8a6";
const ROUTE_SOURCE = "sweepr-route";
const ROUTE_LAYER = "sweepr-route-line";

/**
 * Generic reusable Mapbox map. Handles markers, a route line, a live-location
 * dot, and bounds fitting, and cleans everything up on unmount. When no Mapbox
 * token is configured it renders a graceful styled fallback box showing the
 * first marker's label / the address, mirroring the old missing-token UX.
 */
export function MapboxMap({
  center,
  zoom = 12,
  markers,
  routeGeoJSON,
  liveLocation,
  interactive = true,
  fitTo,
  className,
  onMap,
}: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerObjsRef = useRef<mapboxgl.Marker[]>([]);
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const loadedRef = useRef(false);

  const hasToken = !!getMapboxToken();

  // Create the map once.
  useEffect(() => {
    if (!hasToken || !containerRef.current || mapRef.current) return;
    const map = createMapboxMap(containerRef.current, {
      center: center ?? [-122.15, 37.75],
      zoom,
      interactive,
    });
    if (!map) return;
    mapRef.current = map;

    const unbindTheme = bindMapTheme(map);

    map.on("load", () => {
      loadedRef.current = true;
      onMap?.(map);
    });

    return () => {
      unbindTheme();
      markerObjsRef.current.forEach((m) => m.remove());
      markerObjsRef.current = [];
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  // Sync markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerObjsRef.current.forEach((m) => m.remove());
    markerObjsRef.current = (markers ?? []).map((mk) => {
      const marker = new mapboxgl.Marker({ color: mk.color ?? SEAFOAM })
        .setLngLat(mk.lngLat)
        .addTo(map);
      if (mk.label) marker.setPopup(new mapboxgl.Popup({ offset: 24 }).setText(mk.label));
      return marker;
    });
  }, [markers]);

  // Sync live-location dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!liveLocation) {
      liveMarkerRef.current?.remove();
      liveMarkerRef.current = null;
      return;
    }
    if (!liveMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#14b8a6;" +
        "border:3px solid #fff;box-shadow:0 0 0 4px rgba(20,184,166,0.35);";
      liveMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(liveLocation)
        .addTo(map);
    } else {
      liveMarkerRef.current.setLngLat(liveLocation);
    }
  }, [liveLocation]);

  // Sync route line (waits for style load).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      const existing = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (!routeGeoJSON) {
        if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
        if (existing) map.removeSource(ROUTE_SOURCE);
        return;
      }
      if (existing) {
        existing.setData(routeGeoJSON as Feature);
        return;
      }
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeGeoJSON });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": SEAFOAM, "line-width": 5 },
      });
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [routeGeoJSON]);

  // Fit bounds when requested.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = fitTo && fitTo.length ? fitTo : undefined;
    const apply = () => {
      if (pts) {
        const bounds = new mapboxgl.LngLatBounds(pts[0], pts[0]);
        pts.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, animate: true });
      } else if (center) {
        map.easeTo({ center, zoom });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fitTo), JSON.stringify(center), zoom]);

  if (!hasToken) {
    const label = markers?.[0]?.label;
    return (
      <div
        className={
          className ??
          "flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 p-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        }
      >
        {label ?? "Map unavailable"}
      </div>
    );
  }

  return <div ref={containerRef} className={className ?? "h-64 w-full"} role="img" aria-label="Map" />;
}
