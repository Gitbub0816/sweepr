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
import { useAuth } from "@clerk/clerk-react";
import { DashboardShell, Card, Button, Input, toast, mapboxgl, createMapboxMap, bindMapTheme, CardListSkeleton } from "@sweepr/ui";
import { Plus, Trash2, MapPin } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ServiceArea {
  id: string;
  name: string;
  slug: string;
  status: "live" | "upcoming";
  polygon?: [number, number][];
  center_lat?: number;
  center_lng?: number;
}

interface CityRequest {
  id: string;
  input: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

interface CitySubscriber {
  email: string;
  city_input: string | null;
  created_at: string;
}

const STATUS_COLORS = {
  live: "bg-emerald-100 text-emerald-700",
  upcoming: "bg-amber-100 text-amber-700",
};

const BAY_AREA: [number, number][] = [
  [-122.608,37.907],[-122.271,38.103],[-121.997,38.047],[-121.560,37.981],
  [-121.483,37.650],[-121.573,37.348],[-121.748,37.183],[-122.001,37.047],
  [-122.379,37.093],[-122.472,37.283],[-122.513,37.475],[-122.510,37.707],
  [-122.608,37.907],
];

const AREA_FILL_SOURCE = "service-areas";
const AREA_FILL_LAYER = "service-areas-fill";
const AREA_LINE_LAYER = "service-areas-line";

/** Closes a polygon ring (GeoJSON requires first === last point). */
function closeRing(coords: [number, number][]): [number, number][] {
  if (coords.length === 0) return coords;
  const [fx, fy] = coords[0];
  const [lx, ly] = coords[coords.length - 1];
  return fx === lx && fy === ly ? coords : [...coords, coords[0]];
}

function areasToFeatureCollection(areas: ServiceArea[]): GeoJSON.FeatureCollection {
  const list = areas.length > 0 ? areas : [
    { id: "bf", name: "Bay Area", slug: "bay-area", status: "live" as const, polygon: BAY_AREA },
  ];
  return {
    type: "FeatureCollection",
    features: list.map((area) => ({
      type: "Feature",
      properties: { status: area.status, name: area.name },
      geometry: {
        type: "Polygon",
        // area.polygon is stored as [lng, lat] pairs — GeoJSON order already.
        coordinates: [closeRing(area.polygon ?? BAY_AREA)],
      },
    })),
  };
}

function AreaMap({ areas, requests }: { areas: ServiceArea[]; requests: CityRequest[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const dataRef = useRef({ areas, requests });
  const [unavailable, setUnavailable] = useState(false);

  // Keep the latest data reachable from the style.load handler (which fires on
  // theme flips, after bindMapTheme's setStyle drops all custom sources/layers).
  dataRef.current = { areas, requests };

  // (Re)draw the polygon fill/line layers and request markers onto the map.
  function drawOverlays(map: mapboxgl.Map) {
    const { areas: a, requests: r } = dataRef.current;
    const fc = areasToFeatureCollection(a);

    const src = map.getSource(AREA_FILL_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(fc);
    } else {
      map.addSource(AREA_FILL_SOURCE, { type: "geojson", data: fc });
      const fillColor: mapboxgl.ExpressionSpecification = [
        "match", ["get", "status"], "live", "#14b8a6", "#f59e0b",
      ];
      const lineColor: mapboxgl.ExpressionSpecification = [
        "match", ["get", "status"], "live", "#0d9488", "#d97706",
      ];
      map.addLayer({
        id: AREA_FILL_LAYER,
        type: "fill",
        source: AREA_FILL_SOURCE,
        paint: { "fill-color": fillColor, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: AREA_LINE_LAYER,
        type: "line",
        source: AREA_FILL_SOURCE,
        layout: { "line-join": "round" },
        paint: { "line-color": lineColor, "line-width": 1.5, "line-opacity": 0.85 },
      });
    }

    // Request pins — cleared and rebuilt so they survive style reloads.
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    r.filter((req) => req.lat != null && req.lng != null).forEach((req) => {
      const marker = new mapboxgl.Marker({ color: "#f59e0b" })
        .setLngLat([req.lng!, req.lat!])
        .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(req.input))
        .addTo(map);
      markersRef.current.push(marker);
    });
  }

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = createMapboxMap(containerRef.current, {
      center: [-122.15, 37.75],
      zoom: 7.5,
    });
    if (!map) {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    const unbindTheme = bindMapTheme(map);

    const onFirstLoad = () => drawOverlays(map);
    map.on("load", onFirstLoad);
    // bindMapTheme's setStyle drops custom sources/layers — re-add every time
    // the base style finishes (re)loading, including on a dark/light flip.
    map.on("style.load", () => drawOverlays(map));

    return () => {
      unbindTheme();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render overlays when the underlying data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) drawOverlays(map);
    // If the style is still loading, the "load"/"style.load" handlers will draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, requests]);

  if (unavailable) return (
    <div className="flex h-full items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl">
      <p className="text-slate-600 dark:text-slate-300 text-sm">Map unavailable</p>
    </div>
  );

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}

export function ServiceAreasPage() {
  const { getToken } = useAuth();
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [requests, setRequests] = useState<CityRequest[]>([]);
  const [subscribers, setSubscribers] = useState<CitySubscriber[]>([]);
  const [tab, setTab] = useState<"areas" | "requests">("areas");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [areaStatus, setAreaStatus] = useState<"live" | "upcoming">("upcoming");
  const [centerLat, setCenterLat] = useState("");
  const [centerLng, setCenterLng] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [areasRes, requestsRes] = await Promise.all([
      fetch(`${API}/admin/service-areas`, { headers: h }),
      fetch(`${API}/admin/service-areas/requests`, { headers: h }),
    ]);
    if (areasRes.ok) setAreas((await areasRes.json() as { areas: ServiceArea[] }).areas);
    if (requestsRes.ok) {
      const d = await requestsRes.json() as { requests: CityRequest[]; subscribers: CitySubscriber[] };
      setRequests(d.requests); setSubscribers(d.subscribers);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/service-areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name, slug, status: areaStatus,
          centerLat: centerLat ? parseFloat(centerLat) : undefined,
          centerLng: centerLng ? parseFloat(centerLng) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Failed");
      toast.success("Area added");
      setShowForm(false); setName(""); setSlug("");
      await load();
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally { setSaving(false); }
  }

  async function deleteArea(id: string) {
    if (!confirm("Remove this area?")) return;
    const token = await getToken();
    await fetch(`${API}/admin/service-areas/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    toast.success("Removed"); await load();
  }

  async function toggleStatus(area: ServiceArea) {
    const token = await getToken();
    await fetch(`${API}/admin/service-areas/${area.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: area.status === "live" ? "upcoming" : "live" }),
    });
    await load();
  }

  return (
    <DashboardShell title="Service Areas" description="Manage live/upcoming markets and city requests.">
      <div className="space-y-6">
        <div className="h-[360px] rounded-xl shadow border border-slate-100 overflow-hidden">
          <AreaMap areas={areas} requests={requests} />
        </div>

        <div className="flex border-b border-slate-200">
          {(["areas", "requests"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? "border-b-2 border-seafoam-500 text-seafoam-700" : "text-slate-500 hover:text-slate-700"
              }`}>
              {t === "areas" ? "Service Areas" : `City Requests (${requests.length})`}
            </button>
          ))}
        </div>

        {tab === "areas" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-1.5" />Add area</Button>
            </div>

            {showForm && (
              <Card className="p-5">
                <form onSubmit={addArea} className="grid grid-cols-2 gap-4">
                  <Input label="Name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setName(e.target.value);
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                  }} required />
                  <Input label="Slug" value={slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} required />
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                    <select value={areaStatus} onChange={(e) => setAreaStatus(e.target.value as "live" | "upcoming")}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-seafoam-400">
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Center Lat" type="number" step="any" value={centerLat} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCenterLat(e.target.value)} />
                    <Input label="Center Lng" type="number" step="any" value={centerLng} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCenterLng(e.target.value)} />
                  </div>
                  <div className="col-span-2 flex gap-2 justify-end">
                    <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save area"}</Button>
                  </div>
                </form>
              </Card>
            )}

            {loading ? <CardListSkeleton rows={3} /> : (
              <div className="space-y-2">
                {areas.map((area) => (
                  <Card key={area.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[area.status]}`}>{area.status}</span>
                      <span className="font-medium text-sm">{area.name}</span>
                      <span className="text-xs text-slate-600 font-mono">{area.slug}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => toggleStatus(area)}>
                        {area.status === "live" ? "Mark upcoming" : "Mark live"}
                      </Button>
                      <Button variant="danger" onClick={() => deleteArea(area.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Card>
                ))}
                {areas.length === 0 && <p className="text-sm text-slate-600">No areas configured yet.</p>}
              </div>
            )}
          </div>
        )}

        {tab === "requests" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Requests ({requests.length})</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    <span className="flex-1 text-slate-700">{r.input}</span>
                    {r.lat && <span className="text-xs text-slate-600">{r.lat.toFixed(2)},{r.lng!.toFixed(2)}</span>}
                  </div>
                ))}
                {requests.length === 0 && <p className="text-sm text-slate-600">No requests yet.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">City update subscribers ({subscribers.length})</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {subscribers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-slate-50">
                    <span className="flex-1 truncate text-slate-700">{s.email}</span>
                    {s.city_input && <span className="text-xs text-slate-600 truncate">{s.city_input}</span>}
                  </div>
                ))}
                {subscribers.length === 0 && <p className="text-sm text-slate-600">No subscribers yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
