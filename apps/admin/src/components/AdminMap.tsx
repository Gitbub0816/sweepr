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

export interface AdminMapProps {
  center: [number, number]; // [lng, lat]
  label?: string;
}

/** Compact, non-interactive map preview for the admin detail views. */
export function AdminMap({ center, label }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let unbindTheme: (() => void) | null = null;

    loadMapkit(API)
      .then((mapkit) => {
        if (cancelled || !containerRef.current) return;
        if (!mapRef.current) {
          const map = new mapkit.Map(containerRef.current, {
            center: new mapkit.Coordinate(center[1], center[0]),
            cameraDistance: 6000,
            isRotationEnabled: false,
            isZoomEnabled: false,
            isScrollEnabled: false,
            showsMapTypeControl: false,
            showsZoomControl: false,
            showsCompass: mapkit.FeatureVisibility.Hidden,
          });
          mapRef.current = map;
          unbindTheme = bindMapTheme(mapkit, map);
          markerRef.current = new mapkit.MarkerAnnotation(
            new mapkit.Coordinate(center[1], center[0]),
            { color: "#14b8a6" }
          );
          map.addAnnotation(markerRef.current);
        } else {
          mapRef.current.center = new mapkit.Coordinate(center[1], center[0]);
          markerRef.current.coordinate = new mapkit.Coordinate(center[1], center[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      unbindTheme?.();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  if (unavailable) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700"
        role="img"
        aria-label={label ?? "Map preview unavailable"}
      >
        Map unavailable
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
