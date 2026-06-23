import { useEffect, useRef, useState, lazy, Suspense } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapStyle } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";
const TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ?? import.meta.env.VITE_MAPBOX_TOKEN ?? "";

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

function CoverageMap({ areas, pins }: { areas: ServiceArea[]; pins: Array<{ lat: number; lng: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    const dark = document.documentElement.classList.contains("dark");
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(dark).style,
      center: [-122.15, 37.75],
      zoom: 8.2,
      interactive: true,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
    });

    map.on("load", () => {
      // Draw each service area polygon with seafoam glow
      const allAreas = areas.length > 0 ? areas : [
        { id: "bay-area-fallback", name: "Bay Area", slug: "bay-area", status: "live" as const, polygon: BAY_AREA_COORDS }
      ];

      allAreas.forEach((area) => {
        const coords = area.polygon ?? BAY_AREA_COORDS;
        const sourceId = `area-${area.id}`;
        const geoJson: GeoJSON.Feature = {
          type: "Feature",
          properties: { name: area.name, status: area.status },
          geometry: { type: "Polygon", coordinates: [coords] },
        };

        map.addSource(sourceId, { type: "geojson", data: geoJson });

        // Seafoam fill
        map.addLayer({
          id: `${sourceId}-fill`,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": "#14b8a6",
            "fill-opacity": area.status === "live" ? 0.13 : 0.07,
          },
        });

        // Glow: outer halo (widest, most transparent)
        map.addLayer({
          id: `${sourceId}-glow-outer`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#14b8a6",
            "line-width": 14,
            "line-opacity": 0.08,
            "line-blur": 6,
          },
        });

        // Glow: mid ring
        map.addLayer({
          id: `${sourceId}-glow-mid`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#14b8a6",
            "line-width": 6,
            "line-opacity": 0.2,
            "line-blur": 2,
          },
        });

        // Glow: crisp inner border
        map.addLayer({
          id: `${sourceId}-border`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#0d9488",
            "line-width": 1.5,
            "line-opacity": 0.85,
          },
        });
      });

      // City request pins (small dots)
      if (pins.length > 0) {
        const pinGeo: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: pins.map((p) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        };
        map.addSource("pins", { type: "geojson", data: pinGeo });
        map.addLayer({
          id: "pins-layer",
          type: "circle",
          source: "pins",
          paint: {
            "circle-radius": 5,
            "circle-color": "#f59e0b",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.85,
          },
        });
      }
    });

    return () => map.remove();
  }, [areas, pins]);

  if (!TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 rounded-2xl">
        <p className="text-slate-400 text-sm">Map unavailable (no token)</p>
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
    if (!TOKEN) return null;
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${TOKEN}&limit=1&types=place,postcode,region`
      );
      const data = await res.json() as { features?: Array<{ center?: [number, number] }> };
      const center = data.features?.[0]?.center;
      if (!center) return null;
      return { lng: center[0], lat: center[1] };
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      const coords = await geocode(input);
      const body: Record<string, unknown> = {
        input: input.trim(),
        ...(coords ?? {}),
        ...(subscribe && email ? { email, subscribeUpdates: true } : {}),
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
    <section className="py-20 px-4 bg-white">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-charcoal mb-3">See where Sweepr is</h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            We're live in the Bay Area and expanding fast. Request your city and we'll let you know
            when we arrive.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Map */}
          <div className="lg:col-span-2 h-[420px] rounded-2xl shadow-lg overflow-hidden border border-slate-100">
            <CoverageMap areas={areas} pins={pins} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Live areas */}
            <div>
              <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wide">Live now</h3>
              <div className="space-y-2">
                {(areas.filter((a) => a.status === "live").length > 0
                  ? areas.filter((a) => a.status === "live")
                  : [{ id: "bf", name: "Bay Area", slug: "bay-area", status: "live" as const }]
                ).map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-seafoam-500" />
                    <span className="text-sm text-slate-700">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {areas.filter((a) => a.status === "upcoming").length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-charcoal mb-3 uppercase tracking-wide">Coming soon</h3>
                <div className="space-y-2">
                  {areas.filter((a) => a.status === "upcoming").map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="text-sm text-slate-700">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request form */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-sm font-semibold text-charcoal mb-1">Don't see your city?</h3>
              <p className="text-xs text-slate-500 mb-4">Tell us where you'd like Sweepr.</p>

              {submitted ? (
                <p className="text-sm text-seafoam-600 font-medium">
                  Request received! We'll let you know when we expand there.
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="text"
                    placeholder="City, state or ZIP code"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
                  />

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={subscribe}
                      onChange={(e) => setSubscribe(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-seafoam-500 focus:ring-seafoam-400"
                    />
                    <span className="text-xs text-slate-600 leading-snug">
                      Notify me when Sweepr comes to my area
                    </span>
                  </label>

                  {subscribe && (
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required={subscribe}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400"
                    />
                  )}

                  {error && <p className="text-xs text-red-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? "Submitting…" : "Request my city"}
                  </button>
                </form>
              )}
            </div>

            {pins.length > 0 && (
              <p className="text-xs text-slate-400 text-center">
                {pins.length} cit{pins.length === 1 ? "y" : "ies"} requested on the map
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
