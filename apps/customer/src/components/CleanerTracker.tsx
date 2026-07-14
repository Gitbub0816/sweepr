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
import { Clock, Navigation2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

const POLL_INTERVAL_MS = 15_000;

interface Location {
  lat: number;
  lng: number;
  created_at: string;
}

function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  if (m < 1) return "Arriving now";
  if (m < 60) return `${m} min away`;
  return `${Math.floor(m / 60)}h ${m % 60}m away`;
}

function fetchEta(
  mapkit: any,
  cleanerLng: number,
  cleanerLat: number,
  destLng: number,
  destLat: number
): Promise<number | null> {
  const directions = new mapkit.Directions();
  return new Promise((resolve) => {
    directions.route(
      {
        origin: new mapkit.Coordinate(cleanerLat, cleanerLng),
        destination: new mapkit.Coordinate(destLat, destLng),
      },
      (error: unknown, data: { routes?: Array<{ expectedTravelTime: number }> }) => {
        if (error || !data.routes?.length) {
          resolve(null);
          return;
        }
        resolve(data.routes[0].expectedTravelTime / 1000);
      }
    );
  });
}

export interface CleanerTrackerProps {
  bookingId: string;
  token: string;
  apiUrl: string;
  /** Customer's address coordinates for ETA calculation */
  destLat?: number;
  destLng?: number;
  dayStatus: string;
}

export function CleanerTracker({ bookingId, token, apiUrl, destLat, destLng, dayStatus }: CleanerTrackerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapkitRef = useRef<any>(null);
  const cleanerMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLocation = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/jobs/bookings/${bookingId}/live`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { booking: { last_location?: Location } };
      const loc = data.booking.last_location;
      if (loc) {
        setLocation(loc);
        setLastUpdated(new Date());

        if (mapkitRef.current && destLat && destLng) {
          const dur = await fetchEta(mapkitRef.current, loc.lng, loc.lat, destLng, destLat);
          setEtaSec(dur);
        }
      }
    } catch {
      // network errors are silent — we show stale data
    }
  }, [bookingId, token, apiUrl, destLat, destLng]);

  // Start polling when the cleaner is en_route or arrived
  const shouldTrack = dayStatus === "en_route" || dayStatus === "arrived" || dayStatus === "in_progress";

  useEffect(() => {
    if (!shouldTrack) return;
    fetchLocation();
    pollRef.current = setInterval(fetchLocation, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [shouldTrack, fetchLocation]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || destLat == null || destLng == null) return;
    let cancelled = false;

    loadMapkit(API)
      .then((mapkit) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapkitRef.current = mapkit;

        const map = new mapkit.Map(containerRef.current, {
          center: new mapkit.Coordinate(destLat, destLng),
          cameraDistance: 3000,
          showsMapTypeControl: false,
        });
        mapRef.current = map;
        bindMapTheme(mapkit, map);

        // Destination (home) marker
        destMarkerRef.current = new mapkit.MarkerAnnotation(
          new mapkit.Coordinate(destLat, destLng),
          { color: "#14b8a6", title: "Your home", glyphText: "\u{1F3E0}" }
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
  }, []);

  // Update cleaner marker when location changes
  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapkitRef.current;
    if (!map || !mapkit || !location) return;

    const coord = new mapkit.Coordinate(location.lat, location.lng);
    if (!cleanerMarkerRef.current) {
      cleanerMarkerRef.current = new mapkit.MarkerAnnotation(coord, {
        color: "#0f172a",
        title: "Your Sweepr",
        glyphColor: "#14b8a6",
      });
      map.addAnnotation(cleanerMarkerRef.current);
    } else {
      cleanerMarkerRef.current.coordinate = coord;
    }

    // Fit to show both cleaner and destination
    if (destLat !== undefined && destLng !== undefined) {
      const items = [cleanerMarkerRef.current, destMarkerRef.current].filter(Boolean);
      map.showItems(items, { animate: true, padding: new mapkit.Padding(80, 80, 80, 80) });
    }
  }, [location, destLat, destLng]);

  if (unavailable) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-600 dark:border-slate-700">
        Live tracker unavailable
      </div>
    );
  }

  if (!shouldTrack) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Status bar */}
      <div className="bg-charcoal text-white px-4 py-3 flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full bg-seafoam-400 animate-pulse shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {dayStatus === "en_route" ? "Your Sweepr is on the way" :
             dayStatus === "arrived" ? "Your Sweepr has arrived" :
             "Your Sweepr is cleaning"}
          </p>
          {lastUpdated && (
            <p className="text-xs text-slate-600">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {etaSec !== null && dayStatus === "en_route" && (
          <div className="flex items-center gap-1.5 rounded-full bg-seafoam-500/20 border border-seafoam-500/30 px-3 py-1.5">
            <Clock className="h-3.5 w-3.5 text-seafoam-400" />
            <span className="text-sm font-semibold text-seafoam-300">{fmtDuration(etaSec)}</span>
          </div>
        )}
        {dayStatus === "en_route" && !location && (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Navigation2 className="h-4 w-4" />
            <span className="text-xs">Locating…</span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="h-[280px] w-full" role="img" aria-label="Live map showing your cleaner's location" />
    </div>
  );
}
