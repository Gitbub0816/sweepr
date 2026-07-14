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

const METERS_PER_MILE = 1609.34;

export interface ServiceAreaMapProps {
  center: [number, number]; // [lng, lat]
  radiusMi: number;
}

export function ServiceAreaMap({ center, radiusMi }: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapkitRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const themeUnbindRef = useRef<(() => void) | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapkit(API)
      .then((mapkit) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapkitRef.current = mapkit;

        const map = new mapkit.Map(containerRef.current, {
          center: new mapkit.Coordinate(center[1], center[0]),
          cameraDistance: 70000,
          showsMapTypeControl: false,
        });
        mapRef.current = map;
        themeUnbindRef.current = bindMapTheme(mapkit, map);

        circleRef.current = new mapkit.CircleOverlay(
          new mapkit.Coordinate(center[1], center[0]),
          radiusMi * METERS_PER_MILE,
          {
            style: new mapkit.Style({
              fillColor: "#14b8a6",
              fillOpacity: 0.18,
              strokeColor: "#0d9488",
              lineWidth: 2,
            }),
          }
        );
        map.addOverlay(circleRef.current);

        markerRef.current = new mapkit.MarkerAnnotation(
          new mapkit.Coordinate(center[1], center[0]),
          { color: "#14b8a6" }
        );
        map.addAnnotation(markerRef.current);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update circle + marker when center/radius change.
  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapkitRef.current;
    if (!map || !mapkit) return;
    const coord = new mapkit.Coordinate(center[1], center[0]);
    markerRef.current.coordinate = coord;
    if (circleRef.current) {
      const style = circleRef.current.style;
      map.removeOverlay(circleRef.current);
      circleRef.current = new mapkit.CircleOverlay(coord, radiusMi * METERS_PER_MILE, { style });
      map.addOverlay(circleRef.current);
    }
    map.setCenterAnimated(coord, true);
  }, [center, radiusMi]);

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
        className="flex h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700"
        role="img"
        aria-label="Service area map unavailable"
      >
        Service area map unavailable
      </div>
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
