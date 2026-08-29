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
import { MapboxMap, getMapboxToken, type MapboxMarker } from "@sweepr/ui";
import { Clock, Navigation2 } from "lucide-react";

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

interface RouteResult {
  durationSec: number;
  geometry: GeoJSON.Geometry;
}

/**
 * Fetch a driving route + ETA from the Mapbox Directions API. Returns the
 * duration in seconds and the route geometry (GeoJSON) so the caller can both
 * show the ETA and draw the line. Resolves null on any error — the tracker just
 * shows the moving dot without a line in that case.
 */
async function fetchRoute(
  cleanerLng: number,
  cleanerLat: number,
  destLng: number,
  destLat: number,
): Promise<RouteResult | null> {
  const token = getMapboxToken();
  if (!token) return null;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${cleanerLng},${cleanerLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ duration: number; geometry: GeoJSON.Geometry }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    return { durationSec: route.duration, geometry: route.geometry };
  } catch {
    return null;
  }
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
  const [location, setLocation] = useState<Location | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.Feature | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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

        if (destLat != null && destLng != null) {
          const route = await fetchRoute(loc.lng, loc.lat, destLng, destLat);
          if (route) {
            setEtaSec(route.durationSec);
            setRouteGeoJSON({ type: "Feature", properties: {}, geometry: route.geometry });
          } else {
            setEtaSec(null);
            setRouteGeoJSON(null);
          }
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

  if (!shouldTrack) return null;
  if (destLat == null || destLng == null) return null;

  // Destination (home) marker; the cleaner is the pulsing live dot.
  const markers: MapboxMarker[] = [
    { lngLat: [destLng, destLat], color: "#14b8a6", label: "Your home" },
  ];
  const liveLocation: [number, number] | null = location ? [location.lng, location.lat] : null;
  const fitTo: [number, number][] = location
    ? [[location.lng, location.lat], [destLng, destLat]]
    : [[destLng, destLat]];

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

      <MapboxMap
        className="h-[280px] w-full"
        center={[destLng, destLat]}
        zoom={13}
        markers={markers}
        liveLocation={liveLocation}
        routeGeoJSON={dayStatus === "en_route" ? routeGeoJSON : null}
        fitTo={fitTo}
      />
    </div>
  );
}
