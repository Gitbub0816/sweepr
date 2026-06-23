import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapStyle } from "@sweepr/ui";

function isDarkTheme() {
  if (typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")) return true;
  try {
    return localStorage.getItem("theme") === "dark";
  } catch {
    return false;
  }
}

const TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

// Build a GeoJSON circle polygon from a center + radius in miles.
function circlePolygon(
  center: [number, number],
  radiusMi: number,
  points = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
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

export interface ServiceAreaMapProps {
  center: [number, number]; // [lng, lat]
  radiusMi: number;
}

export function ServiceAreaMap({ center, radiusMi }: ServiceAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    if (!mapRef.current) {
      const dark = isDarkTheme();
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: getMapStyle(dark).style,
        center,
        zoom: 9,
        pitch: 30,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("style.load", () => {
        map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
      });
      map.on("load", () => {
        map.addSource("service-area", {
          type: "geojson",
          data: circlePolygon(center, radiusMi),
        });
        map.addLayer({
          id: "service-area-fill",
          type: "fill",
          source: "service-area",
          paint: { "fill-color": "#14b8a6", "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "service-area-line",
          type: "line",
          source: "service-area",
          paint: { "line-color": "#0d9488", "line-width": 2 },
        });
      });
      markerRef.current = new mapboxgl.Marker({ color: "#14b8a6" })
        .setLngLat(center)
        .addTo(map);
    }

    return () => {
      // keep map across re-renders; cleaned on unmount below
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update circle + marker when center/radius change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.setLngLat(center);
    const source = map.getSource("service-area") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source) source.setData(circlePolygon(center, radiusMi));
    map.setCenter(center);
  }, [center, radiusMi]);

  // React to theme changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const map = mapRef.current;
      if (!map) return;
      const dark = isDarkTheme();
      map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
    };
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("storage", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", apply);
    };
  }, []);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (!TOKEN) {
    return (
      <div
        className="flex h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-400 dark:border-slate-700"
        role="img"
        aria-label="Service area map unavailable"
      >
        Service area map (set VITE_MAPBOX_PUBLIC_TOKEN)
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
