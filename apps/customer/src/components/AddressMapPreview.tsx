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

export interface AddressMapPreviewProps {
  lat: number;
  lng: number;
}

/**
 * Small, control-free map preview with a seafoam marker at the selected
 * address. Falls back to a placeholder when no Mapbox token is configured.
 */
export function AddressMapPreview({ lat, lng }: AddressMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const themeUnbindRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: getMapStyle(isDarkTheme()).style,
        center: [lng, lat],
        zoom: 14,
        pitch: MAP_3D_PITCH,
        interactive: true,
        attributionControl: false,
      });
      mapRef.current = map;
      themeUnbindRef.current = bindMapTheme(map);
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    } else {
      mapRef.current.setCenter([lng, lat]);
    }

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new mapboxgl.Marker({ color: "#14b8a6" })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    return () => {
      markerRef.current?.remove();
    };
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      themeUnbindRef.current?.();
      themeUnbindRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (!TOKEN) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700"
        role="img"
        aria-label="Map preview unavailable"
      >
        Map preview (set VITE_MAPBOX_PUBLIC_TOKEN)
      </div>
    );
  }

  return (
    <div className="relative h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Map showing selected address"
      />
    </div>
  );
}

export default AddressMapPreview;
