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
import {
  mapboxgl,
  createMapboxMap,
  getMapboxToken,
  bindMapTheme,
  validateEmail,
} from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";
const BROOM_PIN_URL = "/assets/sweepr-broom-pin.png";

// Bay Area polygon (9-county approximate boundary)
const BAY_AREA_COORDS: [number, number][] = [
  [-122.608, 37.907], [-122.271, 38.103], [-121.997, 38.047],
  [-121.560, 37.981], [-121.483, 37.650], [-121.573, 37.348],
  [-121.748, 37.183], [-122.001, 37.047], [-122.379, 37.093],
  [-122.472, 37.283], [-122.513, 37.475], [-122.510, 37.707],
  [-122.608, 37.907],
];

interface ServiceArea {
  id: string;
  name: string;
  slug: string;
  status: "live" | "upcoming";
  polygon?: [number, number][];
  center_lat?: number;
  center_lng?: number;
}

interface StatusData {
  serviceAreas?: ServiceArea[];
  cityRequestPins?: Array<{ lat: number; lng: number }>;
}

/** A DOM element for a city-request marker: the broom pin image, falling back
 *  to a plain amber circle if the image fails to load. */
function createPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:28px;height:28px;line-height:0;";
  const img = document.createElement("img");
  img.src = BROOM_PIN_URL;
  img.width = 28;
  img.height = 28;
  img.alt = "Requested city";
  img.style.cssText = "width:28px;height:28px;display:block;";
  img.onerror = () => {
    el.innerHTML = "";
    el.style.cssText =
      "width:16px;height:16px;border-radius:50%;background:#f59e0b;" +
      "border:2px solid #fff;box-shadow:0 0 0 3px rgba(245,158,11,0.3);";
  };
  el.appendChild(img);
  return el;
}

/** Adds the seafoam coverage polygons (fill + layered glow/mid/border lines)
 *  for every service area. Called on each `style.load` — Mapbox drops custom
 *  sources/layers whenever the base style is swapped (e.g. on theme flip), so
 *  they must be re-added. `drawn` tracks the layer/source ids currently on the
 *  map within a single style so a shrinking area list leaves nothing stale. */
function drawCoverage(
  map: mapboxgl.Map,
  areas: ServiceArea[],
  drawn: { layers: string[]; sources: string[] },
) {
  drawn.layers.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  drawn.sources.forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
  drawn.layers = [];
  drawn.sources = [];

  areas.forEach((area, i) => {
    const coords = area.polygon ?? BAY_AREA_COORDS;
    const srcId = `coverage-${i}`;
    const fillId = `coverage-fill-${i}`;
    const glowId = `coverage-glow-${i}`;
    const midId = `coverage-mid-${i}`;
    const lineId = `coverage-line-${i}`;
    const fillOpacity = area.status === "live" ? 0.22 : 0.1;

    map.addSource(srcId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    });
    map.addLayer({
      id: fillId,
      type: "fill",
      source: srcId,
      paint: { "fill-color": "#14b8a6", "fill-opacity": fillOpacity },
    });
    // Outer halo, mid ring, crisp inner border — three line passes for the glow.
    map.addLayer({
      id: glowId,
      type: "line",
      source: srcId,
      paint: { "line-color": "#14b8a6", "line-width": 16, "line-opacity": 0.12 },
    });
    map.addLayer({
      id: midId,
      type: "line",
      source: srcId,
      paint: { "line-color": "#14b8a6", "line-width": 6, "line-opacity": 0.35 },
    });
    map.addLayer({
      id: lineId,
      type: "line",
      source: srcId,
      paint: { "line-color": "#0d9488", "line-width": 1.5, "line-opacity": 0.85 },
    });

    drawn.sources.push(srcId);
    drawn.layers.push(fillId, glowId, midId, lineId);
  });
}

function CoverageMap({ areas, pins }: { areas: ServiceArea[]; pins: Array<{ lat: number; lng: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const areasRef = useRef<ServiceArea[]>([]);
  const drawnRef = useRef<{ layers: string[]; sources: string[] }>({ layers: [], sources: [] });
  const [unavailable, setUnavailable] = useState(false);

  // Keep the latest areas available to the imperative `style.load` handler.
  areasRef.current = areas.length > 0
    ? areas
    : [{ id: "bay-area-fallback", name: "Bay Area", slug: "bay-area", status: "live", polygon: BAY_AREA_COORDS }];

  // Create the map once. createMapboxMap returns null when no token is
  // configured, in which case we show the graceful fallback.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = createMapboxMap(containerRef.current, {
      center: [-121.95, 37.5],
      zoom: 8,
      interactive: true,
    });
    if (!map) {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    const unbindTheme = bindMapTheme(map);

    // `style.load` fires on the initial load and again after every theme swap;
    // re-add the coverage polygons each time (setStyle drops custom sources).
    const redraw = () => drawCoverage(map, areasRef.current, drawnRef.current);
    map.on("style.load", redraw);

    return () => {
      unbindTheme();
      map.off("style.load", redraw);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw coverage when the fetched areas arrive/change after the initial load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return; // style.load handles the not-yet-ready case
    drawCoverage(map, areasRef.current, drawnRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas]);

  // Sync city-request pins as DOM markers (unaffected by style swaps).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = pins.map((p) =>
      new mapboxgl.Marker({ element: createPinElement(), anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map),
    );
  }, [pins]);

  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 rounded-2xl dark:bg-slate-800">
        <p className="text-slate-600 text-sm dark:text-slate-300">Map unavailable</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />;
}

export function CoverageMapSection() {
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [pins, setPins] = useState<Array<{ lat: number; lng: number }>>([]);
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [subscribe, setSubscribe] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json() as Promise<StatusData>)
      .then((d) => {
        setAreas(d.serviceAreas ?? []);
        setPins(d.cityRequestPins ?? []);
      })
      .catch(() => {});
  }, []);

  async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
    const token = getMapboxToken();
    if (!token) return null;
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${token}&autocomplete=true&country=us&types=address&limit=5`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
      const center = data.features?.[0]?.center;
      if (!center) return null;
      const [lng, lat] = center;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) { setError("Please enter a city or ZIP code."); return; }
    if (subscribe) {
      const emailErr = validateEmail(email);
      if (emailErr) { setError(emailErr); return; }
    }
    setLoading(true);
    setError("");
    try {
      const coords = await geocode(input);
      const body: Record<string, unknown> = {
        input: input.trim(),
        ...(coords ?? {}),
        ...(subscribe && email.trim() ? { email: email.trim(), subscribeUpdates: true } : {}),
      };
      const res = await fetch(`${API}/status/city-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Request failed");
      setSubmitted(true);
      if (coords) setPins((prev) => [...prev, coords]);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white px-4 py-24 dark:bg-slate-900/40">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <h2 className="mb-3 text-3xl font-black tracking-tight text-charcoal dark:text-white sm:text-4xl">See where Sweepr is</h2>
          <p className="text-slate-600 dark:text-slate-400">
            We're live in the Bay Area and expanding. Tell us your city and we'll email you when we get there.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Map */}
          <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-100 shadow-lg dark:border-slate-700 lg:col-span-2">
            <CoverageMap areas={areas} pins={pins} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Live areas */}
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Live now</h3>
              <div className="space-y-2">
                {(areas.filter((a) => a.status === "live").length > 0
                  ? areas.filter((a) => a.status === "live")
                  : [{ id: "bf", name: "Bay Area", slug: "bay-area", status: "live" as const }]
                ).map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-seafoam-500" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {areas.filter((a) => a.status === "upcoming").length > 0 && (
              <div>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Coming soon</h3>
                <div className="space-y-2">
                  {areas.filter((a) => a.status === "upcoming").map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request form */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/60">
              <h3 className="mb-1 text-sm font-semibold text-charcoal dark:text-white">Don't see your city?</h3>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Tell us where you'd like Sweepr.</p>

              {submitted ? (
                <p role="status" className="text-sm font-medium text-seafoam-700 dark:text-seafoam-300">
                  Request received. We'll let you know when we expand there.
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <label htmlFor="city-request-input" className="sr-only">
                    City, state or ZIP code
                  </label>
                  <input
                    id="city-request-input"
                    type="text"
                    placeholder="City, state or ZIP code"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "city-request-error" : undefined}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) => setSubscribe(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
                    />
                    <span className="text-xs leading-snug text-slate-600 dark:text-slate-400">
                      Notify me when Sweepr comes to my area
                    </span>
                  </label>

                  {subscribe && (
                    <>
                      <label htmlFor="city-request-email" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="city-request-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={subscribe}
                        aria-required="true"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </>
                  )}

                  {error && (
                    <p id="city-request-error" role="alert" className="text-xs text-red-600">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-seafoam-700 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Submitting…" : "Request my city"}
                  </button>
                </form>
              )}
            </div>

            {pins.length > 0 && (
              <p className="text-xs text-slate-500 text-center">
                {pins.length} cit{pins.length === 1 ? "y" : "ies"} requested on the map
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
