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

export interface AddressMapPreviewProps {
  lat: number;
  lng: number;
}

/**
 * Small, control-free map preview with a seafoam marker at the selected
 * address. Falls back to a placeholder when no Mapbox token is configured.
 */
export function AddressMapPreview({ lat, lng }: AddressMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const dark = isDarkTheme();
    if (!mapRef.current) {
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: getMapStyle(dark).style,
        center: [lng, lat],
        zoom: 14,
        pitch: 45,
        interactive: true,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("style.load", () => {
        map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
      });
    } else {
      mapRef.current.setCenter([lng, lat]);
    }

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new mapboxgl.Marker({ color: "#14b8a6" })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    return () => {
      markerRef.current?.remove();
    };
  }, [lat, lng]);

  // React to theme changes (class toggled on <html> or theme storage change).
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
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-400 dark:border-slate-700"
        role="img"
        aria-label="Map preview unavailable"
      >
        Map preview (set VITE_MAPBOX_PUBLIC_TOKEN)
      </div>
    );
  }

  return (
    <div className="relative h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label="Map showing selected address"
      />
    </div>
  );
}

export default AddressMapPreview;
