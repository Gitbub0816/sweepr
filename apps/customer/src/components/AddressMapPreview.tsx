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
import { loadMapkit, bindMapTheme } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

export interface AddressMapPreviewProps {
  lat: number;
  lng: number;
}

/**
 * Small map preview with a seafoam marker at the selected address and
 * zoom controls. Falls back to a placeholder if Apple Maps isn't
 * configured or MapKit JS fails to initialize.
 */
export function AddressMapPreview({ lat, lng }: AddressMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const themeUnbindRef = useRef<(() => void) | null>(null);
  const mapkitRef = useRef<any>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapkit(API)
      .then((mapkit) => {
        if (cancelled || !containerRef.current) return;
        mapkitRef.current = mapkit;

        if (!mapRef.current) {
          const map = new mapkit.Map(containerRef.current, {
            center: new mapkit.Coordinate(lat, lng),
            cameraDistance: 1200,
            showsMapTypeControl: false,
            showsZoomControl: true,
            showsCompass: mapkit.FeatureVisibility.Hidden,
          });
          mapRef.current = map;
          themeUnbindRef.current = bindMapTheme(mapkit, map);
        } else {
          mapRef.current.center = new mapkit.Coordinate(lat, lng);
        }

        if (markerRef.current) mapRef.current.removeAnnotation(markerRef.current);
        markerRef.current = new mapkit.MarkerAnnotation(new mapkit.Coordinate(lat, lng), {
          color: "#14b8a6",
        });
        mapRef.current.addAnnotation(markerRef.current);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      themeUnbindRef.current?.();
      themeUnbindRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  if (unavailable) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700"
        role="img"
        aria-label="Map preview unavailable"
      >
        Map unavailable
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
