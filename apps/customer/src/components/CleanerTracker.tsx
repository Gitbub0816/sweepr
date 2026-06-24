import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapStyle } from "@sweepr/ui";
import { Clock, Navigation2 } from "lucide-react";

function isDarkTheme() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return true;
  try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
}

const TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

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

async function fetchEta(cleanerLng: number, cleanerLat: number, destLng: number, destLat: number): Promise<number | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${cleanerLng},${cleanerLat};${destLng},${destLat}?overview=false&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ duration: number }> };
    return data.routes?.[0]?.duration ?? null;
  } catch {
    return null;
  }
}

export interface CleanerTrackerProps {
  bookingId: string;
  token: string;
  apiUrl: string;
  /** Customer's address coordinates for ETA calculation */
  destLat: number;
  destLng: number;
  dayStatus: string;
}

export function CleanerTracker({ bookingId, token, apiUrl, destLat, destLng, dayStatus }: CleanerTrackerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cleanerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);
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

        if (TOKEN && destLat && destLng) {
          const dur = await fetchEta(loc.lng, loc.lat, destLng, destLat);
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
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const dark = isDarkTheme();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(dark).style,
      center: [destLng, destLat],
      zoom: 13,
      pitch: 30,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("style.load", () => {
      map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
    });

    // Destination (home) marker
    const homeEl = document.createElement("div");
    homeEl.innerHTML = `<div style="width:36px;height:36px;border-radius:50%;background:#14b8a6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>`;
    destMarkerRef.current = new mapboxgl.Marker({ element: homeEl })
      .setLngLat([destLng, destLat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setText("Your home"))
      .addTo(map);

    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update cleaner marker when location changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;

    if (!cleanerMarkerRef.current) {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:40px;height:40px;border-radius:50%;background:#0f172a;border:3px solid #14b8a6;box-shadow:0 2px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#14b8a6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg></div>`;
      const style = document.createElement("style");
      style.textContent = `@keyframes pulse { 0%,100%{box-shadow:0 2px 10px rgba(20,184,166,0.4)} 50%{box-shadow:0 2px 20px rgba(20,184,166,0.8)} }`;
      document.head.appendChild(style);
      cleanerMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([location.lng, location.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText("Your Sweepr"))
        .addTo(map);
    } else {
      cleanerMarkerRef.current.setLngLat([location.lng, location.lat]);
    }

    // Fit bounds to show both cleaner and destination
    const bounds = new mapboxgl.LngLatBounds()
      .extend([location.lng, location.lat])
      .extend([destLng, destLat]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
  }, [location, destLat, destLng]);

  if (!TOKEN) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-400 dark:border-slate-700">
        Live tracker (set VITE_MAPBOX_TOKEN)
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
            <p className="text-xs text-slate-400">
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
          <div className="flex items-center gap-1.5 text-slate-400">
            <Navigation2 className="h-4 w-4" />
            <span className="text-xs">Locating…</span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="h-[280px] w-full" role="img" aria-label="Live map showing your cleaner's location" />
    </div>
  );
}
