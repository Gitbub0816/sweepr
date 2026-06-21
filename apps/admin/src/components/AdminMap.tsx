import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

export interface AdminMapProps {
  center: [number, number]; // [lng, lat]
  label?: string;
}

/** Compact, non-interactive map preview for the admin detail views. */
export function AdminMap({ center, label }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom: 11,
        interactive: false,
        attributionControl: false,
      });
      new mapboxgl.Marker({ color: "#14b8a6" })
        .setLngLat(center)
        .addTo(mapRef.current);
    } else {
      mapRef.current.setCenter(center);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center]);

  if (!TOKEN) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-seafoam-50 text-sm text-slate-400 dark:border-slate-700"
        role="img"
        aria-label={label ?? "Map preview unavailable"}
      >
        Map preview (set VITE_MAPBOX_PUBLIC_TOKEN)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
      role="img"
      aria-label={label ?? "Map"}
    />
  );
}
