import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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

    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [lng, lat],
        zoom: 14,
        interactive: false,
        attributionControl: false,
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
    <div
      ref={containerRef}
      className="h-[200px] w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
      role="img"
      aria-label="Map showing selected address"
    />
  );
}

export default AddressMapPreview;
