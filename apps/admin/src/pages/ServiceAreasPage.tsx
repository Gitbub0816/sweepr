import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DashboardShell, Card } from "@sweepr/ui";

const TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

type View = "density" | "coverage" | "both";

const CITIES = [
  { name: "San Diego", center: [-117.1611, 32.7157] as [number, number] },
  { name: "Los Angeles", center: [-118.2437, 34.0522] as [number, number] },
];

// Mock booking density points (lng, lat, weight).
const bookingDensity: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: Array.from({ length: 60 }, (_, i) => ({
    type: "Feature",
    properties: { weight: Math.random() },
    geometry: {
      type: "Point",
      coordinates: [
        -117.1611 + (Math.random() - 0.5) * 0.2,
        32.7157 + (Math.random() - 0.5) * 0.2,
      ],
    },
  })),
};

// Mock cleaner coverage circles (center + radius miles).
const coverageAreas = [
  { center: [-117.16, 32.72], radiusMi: 5 },
  { center: [-117.1, 32.75], radiusMi: 4 },
  { center: [-117.22, 32.7], radiusMi: 6 },
];

function circlePolygon(
  center: [number, number],
  radiusMi: number
): GeoJSON.Feature {
  const points = 64;
  const km = radiusMi * 1.60934;
  const coords: [number, number][] = [];
  const distanceX = km / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = km / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      center[0] + distanceX * Math.cos(theta),
      center[1] + distanceY * Math.sin(theta),
    ]);
  }
  coords.push(coords[0]);
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function ServiceAreasPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [view, setView] = useState<View>("both");
  const [city, setCity] = useState(CITIES[0].name);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: CITIES[0].center,
      zoom: 10,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("density", { type: "geojson", data: bookingDensity });
      map.addLayer({
        id: "density-heat",
        type: "heatmap",
        source: "density",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(45,212,191,0)",
            0.4,
            "#2DD4BF",
            0.7,
            "#0D9488",
            1,
            "#0F766E",
          ],
          "heatmap-radius": 30,
        },
      });

      map.addSource("coverage", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: coverageAreas.map((c) =>
            circlePolygon(c.center as [number, number], c.radiusMi)
          ),
        },
      });
      map.addLayer({
        id: "coverage-fill",
        type: "fill",
        source: "coverage",
        paint: { "fill-color": "#2DD4BF", "fill-opacity": 0.5 },
      });
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Apply layer visibility on view change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const show = (id: string, visible: boolean) =>
      map.getLayer(id) &&
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    show("density-heat", view === "density" || view === "both");
    show("coverage-fill", view === "coverage" || view === "both");
  }, [view, ready]);

  // Fly to selected city.
  useEffect(() => {
    const map = mapRef.current;
    const target = CITIES.find((c) => c.name === city);
    if (map && target && ready) map.flyTo({ center: target.center, zoom: 10 });
  }, [city, ready]);

  return (
    <DashboardShell
      title="Service Areas"
      description="Booking density and cleaner coverage across your markets."
      actions={
        <div className="flex items-center gap-2">
          <label htmlFor="view-toggle" className="sr-only">
            Map view
          </label>
          <select
            id="view-toggle"
            value={view}
            onChange={(e) => setView(e.target.value as View)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="density">Booking Density</option>
            <option value="coverage">Cleaner Coverage</option>
            <option value="both">Both</option>
          </select>
          <label htmlFor="city-filter" className="sr-only">
            City
          </label>
          <select
            id="city-filter"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {TOKEN ? (
        <div
          ref={containerRef}
          className="h-[600px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
          role="img"
          aria-label="Service area map"
        />
      ) : (
        <Card className="flex h-[600px] items-center justify-center bg-seafoam-50 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Map unavailable — set VITE_MAPBOX_PUBLIC_TOKEN to view the heatmap.
        </Card>
      )}
    </DashboardShell>
  );
}
