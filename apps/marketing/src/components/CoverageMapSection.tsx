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
import { loadMapkit, bindMapTheme, validateEmail } from "@sweepr/ui";

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

/** Resolves once we know whether the broom pin image loads successfully. */
function checkBroomPinLoads(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = BROOM_PIN_URL;
  });
}

function CoverageMap({ areas, pins }: { areas: ServiceArea[]; pins: Array<{ lat: number; lng: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapkitRef = useRef<any>(null);
  const pinAnnotationsRef = useRef<any[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loadMapkit(API)
      .then((mapkit) => {
        if (cancelled || !containerRef.current) return;
        mapkitRef.current = mapkit;

        const map = new mapkit.Map(containerRef.current, {
          center: new mapkit.Coordinate(37.5, -121.95),
          cameraDistance: 500000,
          showsMapTypeControl: false,
        });
        mapRef.current = map;
        bindMapTheme(mapkit, map);

        // Draw each service area polygon with seafoam glow (outer halo, mid
        // ring, crisp inner border — layered as separate overlays since
        // MapKit overlays don't support multiple stroke passes per shape).
        const allAreas = areas.length > 0 ? areas : [
          { id: "bay-area-fallback", name: "Bay Area", slug: "bay-area", status: "live" as const, polygon: BAY_AREA_COORDS }
        ];

        allAreas.forEach((area) => {
          const coords = area.polygon ?? BAY_AREA_COORDS;
          const points = coords.map(([lng, lat]) => new mapkit.Coordinate(lat, lng));
          const fillOpacity = area.status === "live" ? 0.22 : 0.1;

          map.addOverlay(new mapkit.PolygonOverlay(points, {
            style: new mapkit.Style({ fillColor: "#14b8a6", fillOpacity, lineWidth: 0 }),
          }));
          map.addOverlay(new mapkit.PolylineOverlay(points, {
            style: new mapkit.Style({ strokeColor: "#14b8a6", lineWidth: 16, strokeOpacity: 0.12 }),
          }));
          map.addOverlay(new mapkit.PolylineOverlay(points, {
            style: new mapkit.Style({ strokeColor: "#14b8a6", lineWidth: 6, strokeOpacity: 0.35 }),
          }));
          map.addOverlay(new mapkit.PolylineOverlay(points, {
            style: new mapkit.Style({ strokeColor: "#0d9488", lineWidth: 1.5, strokeOpacity: 0.85 }),
          }));
        });

        // City request pins — custom broom pin image, falling back to a
        // plain circle marker if the image fails to load.
        if (pins.length > 0) {
          checkBroomPinLoads().then((loaded) => {
            if (cancelled) return;
            pinAnnotationsRef.current = pins.map((p) => {
              const coord = new mapkit.Coordinate(p.lat, p.lng);
              if (loaded) {
                return new mapkit.ImageAnnotation(coord, {
                  url: { 1: BROOM_PIN_URL, 2: BROOM_PIN_URL },
                  size: { width: 28, height: 28 },
                  anchorOffset: new DOMPoint(0, -14),
                });
              }
              return new mapkit.MarkerAnnotation(coord, {
                color: "#f59e0b",
                glyphColor: "#fff",
              });
            });
            map.addAnnotations(pinAnnotationsRef.current);
          });
        }
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
  }, [areas, pins]);

  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 rounded-2xl">
        <p className="text-slate-600 text-sm">Map unavailable</p>
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
    try {
      const mapkit = await loadMapkit(API);
      const search = new mapkit.Search();
      return await new Promise((resolve) => {
        search.search(query, (error: unknown, data: { places?: Array<{ coordinate: { latitude: number; longitude: number } }> }) => {
          if (error || !data.places?.length) {
            resolve(null);
            return;
          }
          const { latitude, longitude } = data.places[0].coordinate;
          resolve({ lat: latitude, lng: longitude });
        });
      });
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
