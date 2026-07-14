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
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapStyle, getMapboxToken, isDarkTheme, bindMapTheme, MAP_3D_PITCH } from "@sweepr/ui";

const TOKEN = getMapboxToken();

export interface AdminMapProps {
  center: [number, number]; // [lng, lat]
  label?: string;
}

/** Compact, non-interactive map preview for the admin detail views. */
export function AdminMap({ center, label }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;
    let unbindTheme: (() => void) | null = null;
    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: getMapStyle(isDarkTheme()).style,
        center,
        zoom: 11,
        pitch: MAP_3D_PITCH,
        interactive: false,
        attributionControl: false,
      });
      mapRef.current = map;
      unbindTheme = bindMapTheme(map);
      new mapboxgl.Marker({ color: "#14b8a6" })
        .setLngLat(center)
        .addTo(map);
    } else {
      mapRef.current.setCenter(center);
    }
    return () => {
      unbindTheme?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center]);

  if (!TOKEN) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700"
        role="img"
        aria-label={label ?? "Map preview unavailable"}
      >
        Map preview (set VITE_MAPBOX_PUBLIC_TOKEN)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
      role="img"
      aria-label={label ?? "Map"}
    />
  );
}
