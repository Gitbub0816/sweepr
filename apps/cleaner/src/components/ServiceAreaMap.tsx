/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { mapboxgl, createMapboxMap, bindMapTheme, MapUnavailableFallback } from "@sweepr/ui";

const METERS_PER_MILE = 1609.34;
const SEAFOAM_FILL = "#14b8a6";
const SEAFOAM_LINE = "#0d9488";
const CIRCLE_SOURCE = "service-area-circle";
const CIRCLE_FILL_LAYER = "service-area-circle-fill";
const CIRCLE_LINE_LAYER = "service-area-circle-line";

export interface ServiceAreaMapProps {
  center: [number, number]; // [lng, lat]
  radiusMi: number;
  /** Human label for the area (e.g. the address the cleaner entered), shown
   *  in the static fallback when the interactive map can't render. */
  areaLabel?: string;
}

/**
 * Approximate a geographic circle as a GeoJSON polygon. Radius is in meters;
 * the longitude delta is scaled by cos(latitude) so the circle stays round at
 * the map's latitude.
 */
function circlePolygon(
  center: [number, number],
  radiusM: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLat = (radiusM / 6378137) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(latRad), 1e-6);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function ServiceAreaMap({ center, radiusMi, areaLabel }: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const themeUnbindRef = useRef<(() => void) | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Keep the latest center/radius available to the style.load handler without
  // re-initializing the map.
  const stateRef = useRef({ center, radiusMi });
  stateRef.current = { center, radiusMi };

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = createMapboxMap(containerRef.current, {
      center,
      zoom: 9,
      attributionControl: false,
    });
    if (!map) {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;

    // (Re)draw the radius circle + center marker. Called on first load and
    // again after every theme-driven setStyle (which drops sources/layers).
    const drawOverlays = () => {
      const { center: c, radiusMi: r } = stateRef.current;
      const feature = circlePolygon(c, r * METERS_PER_MILE);
      const src = map.getSource(CIRCLE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(feature);
      } else {
        map.addSource(CIRCLE_SOURCE, { type: "geojson", data: feature });
        map.addLayer({
          id: CIRCLE_FILL_LAYER,
          type: "fill",
          source: CIRCLE_SOURCE,
          paint: { "fill-color": SEAFOAM_FILL, "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: CIRCLE_LINE_LAYER,
          type: "line",
          source: CIRCLE_SOURCE,
          paint: { "line-color": SEAFOAM_LINE, "line-width": 2 },
        });
      }
    };

    map.on("load", drawOverlays);
    // setStyle (theme swap) reloads the base style and drops our layers, so
    // re-add them on every style.load.
    map.on("style.load", drawOverlays);

    markerRef.current = new mapboxgl.Marker({ color: SEAFOAM_FILL })
      .setLngLat(center)
      .addTo(map);

    themeUnbindRef.current = bindMapTheme(map);

    return () => {
      themeUnbindRef.current?.();
      themeUnbindRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update circle + marker + camera when center/radius change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.setLngLat(center);
    const apply = () => {
      const src = map.getSource(CIRCLE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(circlePolygon(center, radiusMi * METERS_PER_MILE));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    map.easeTo({ center, duration: 500 });
  }, [center, radiusMi]);

  if (unavailable) {
    return (
      <MapUnavailableFallback
        areaName={areaLabel}
        className="flex h-[260px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-seafoam-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800"
      />
    );
  }

  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Map showing your service area"
      />
    </div>
  );
}
