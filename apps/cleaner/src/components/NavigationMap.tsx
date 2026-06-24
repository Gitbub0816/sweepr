import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapStyle } from "@sweepr/ui";
import { Navigation, ChevronRight, Clock } from "lucide-react";

function isDarkTheme() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return true;
  try { return localStorage.getItem("theme") === "dark"; } catch { return false; }
}

const TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

interface Step {
  instruction: string;
  distanceM: number;
  durationS: number;
}

interface RouteResult {
  steps: Step[];
  totalDistanceM: number;
  totalDurationS: number;
  geometry: GeoJSON.LineString;
}

async function fetchRoute(
  origin: [number, number],
  dest: [number, number]
): Promise<RouteResult | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?steps=true&geometries=geojson&overview=full&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: GeoJSON.LineString;
        legs: Array<{ steps: Array<{ maneuver: { instruction: string }; distance: number; duration: number }> }>;
      }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    return {
      totalDistanceM: route.distance,
      totalDurationS: route.duration,
      geometry: route.geometry,
      steps: route.legs[0]?.steps.map((s) => ({
        instruction: s.maneuver.instruction,
        distanceM: s.distance,
        durationS: s.duration,
      })) ?? [],
    };
  } catch {
    return null;
  }
}

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface NavigationMapProps {
  destination: { lat: number; lng: number; label: string };
  currentLat: number | null;
  currentLng: number | null;
}

export function NavigationMap({ destination, currentLat, currentLng }: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const posMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const routeRef = useRef<RouteResult | null>(null);
  const lastFetchRef = useRef<number>(0);

  // Geocode destination address to coordinates
  const geocodeCache = useRef<{ label: string; coords: [number, number] } | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!TOKEN) return;
    if (geocodeCache.current?.label === destination.label) {
      setDestCoords(geocodeCache.current.coords);
      return;
    }
    const encoded = encodeURIComponent(destination.label);
    fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&access_token=${TOKEN}`)
      .then((r) => r.json())
      .then((data: { features?: Array<{ center: [number, number] }> }) => {
        const coords = data.features?.[0]?.center;
        if (coords) {
          geocodeCache.current = { label: destination.label, coords };
          setDestCoords(coords);
        }
      })
      .catch(() => {});
  }, [destination.label]);

  // Init map
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const dark = isDarkTheme();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(dark).style,
      zoom: 14,
      center: destCoords ?? [destination.lng, destination.lat],
      pitch: 45,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
    });

    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#14b8a6", "line-width": 5, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line-outline",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0d9488", "line-width": 8, "line-opacity": 0.3 },
      });
    });

    // Destination marker
    const destEl = document.createElement("div");
    destEl.className = "flex items-center justify-center w-8 h-8 rounded-full bg-seafoam-500 shadow-lg border-2 border-white";
    destEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
    destMarkerRef.current = new mapboxgl.Marker({ element: destEl })
      .setLngLat(destCoords ?? [destination.lng, destination.lat])
      .addTo(map);

    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update destination marker when coords resolved
  useEffect(() => {
    if (!destCoords) return;
    destMarkerRef.current?.setLngLat(destCoords);
  }, [destCoords]);

  // Update position marker + fetch route
  const updateRoute = useCallback(async (lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;

    // Update cleaner position marker
    const el = posMarkerRef.current?.getElement();
    if (!posMarkerRef.current) {
      const posEl = document.createElement("div");
      posEl.className = "w-4 h-4 rounded-full bg-seafoam-500 border-2 border-white shadow-md";
      posMarkerRef.current = new mapboxgl.Marker({ element: posEl })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      posMarkerRef.current.setLngLat([lng, lat]);
    }
    if (el) el.style.transform += " scale(1.2)";

    // Throttle route fetches to every 30s
    const now = Date.now();
    if (now - lastFetchRef.current < 30_000 && routeRef.current) return;
    if (!destCoords) return;
    lastFetchRef.current = now;

    const result = await fetchRoute([lng, lat], destCoords);
    if (!result) return;
    routeRef.current = result;
    setRoute(result);

    // Update route line on map
    const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "Feature", properties: {}, geometry: result.geometry });
    }

    // Fit map to route
    const coords = result.geometry.coordinates as [number, number][];
    if (coords.length > 1) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
    }

    // Determine current step based on proximity
    const closestStep = result.steps.findIndex((_, i) => {
      const stepCoord = result.geometry.coordinates[i] as [number, number] | undefined;
      if (!stepCoord) return false;
      const dLng = stepCoord[0] - lng;
      const dLat = stepCoord[1] - lat;
      return Math.sqrt(dLng * dLng + dLat * dLat) < 0.005;
    });
    if (closestStep >= 0) setCurrentStepIdx(closestStep);
  }, [destCoords]);

  useEffect(() => {
    if (currentLat === null || currentLng === null) return;
    updateRoute(currentLng, currentLat);
  }, [currentLat, currentLng, updateRoute]);

  const currentStep = route?.steps[currentStepIdx];
  const nextStep = route?.steps[currentStepIdx + 1];

  if (!TOKEN) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-400">
        Navigation map (set VITE_MAPBOX_TOKEN)
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Turn-by-turn instruction banner */}
      {currentStep && (
        <div className="bg-charcoal text-white px-4 py-3 flex items-start gap-3">
          <Navigation className="h-5 w-5 text-seafoam-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug truncate">{currentStep.instruction}</p>
            {nextStep && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                then: {nextStep.instruction}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-seafoam-400 font-medium">{fmtDist(currentStep.distanceM)}</p>
          </div>
        </div>
      )}

      {/* ETA bar */}
      {route && (
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-4 text-sm">
          <Clock className="h-4 w-4 text-seafoam-400 shrink-0" />
          <span className="font-semibold">{fmtDuration(route.totalDurationS)}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-400">{fmtDist(route.totalDistanceM)}</span>
          <span className="ml-auto text-seafoam-400 font-medium">
            ETA {new Date(Date.now() + route.totalDurationS * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      <div ref={containerRef} className="h-[300px] w-full" role="img" aria-label="Navigation map" />
    </div>
  );
}
