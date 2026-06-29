import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { DashboardShell, Card, Button, Input, toast, getMapStyle, getMapboxToken } from "@sweepr/ui";
import { Plus, Trash2, MapPin } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";
const TOKEN = getMapboxToken();

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

function AreaMap({ areas, requests }: { areas: ServiceArea[]; requests: CityRequest[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !TOKEN || mapRef.current) return;
    const dark = document.documentElement.classList.contains("dark");
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(dark).style,
      center: [-122.15, 37.75],
      zoom: 7.5,
    });
    mapRef.current = map;

    map.on("style.load", () => {
      map.setConfigProperty("basemap", "lightPreset", dark ? "dusk" : "day");
      map.setConfigProperty("basemap", "colorTheme", dark ? "default" : "faded");
    });

    map.on("load", () => {
      const allAreas = areas.length > 0 ? areas : [
        { id: "bf", name: "Bay Area", slug: "bay-area", status: "live" as const, polygon: BAY_AREA },
      ];

      allAreas.forEach((area) => {
        const coords = area.polygon ?? BAY_AREA;
        const sid = `area-${area.id}`;
        const color = area.status === "live" ? "#14b8a6" : "#f59e0b";
        const borderColor = area.status === "live" ? "#0d9488" : "#d97706";

        map.addSource(sid, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } },
        });
        map.addLayer({ id: `${sid}-fill`, type: "fill", source: sid, paint: { "fill-color": color, "fill-opacity": 0.12 } });
        map.addLayer({ id: `${sid}-glow`, type: "line", source: sid, paint: { "line-color": color, "line-width": 8, "line-opacity": 0.15, "line-blur": 4 } });
        map.addLayer({ id: `${sid}-border`, type: "line", source: sid, paint: { "line-color": borderColor, "line-width": 1.5, "line-opacity": 0.8 } });
      });

      const pinned = requests.filter((r) => r.lat && r.lng);
      if (pinned.length > 0) {
        map.addSource("pins", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pinned.map((r) => ({
              type: "Feature", properties: { label: r.input },
              geometry: { type: "Point", coordinates: [r.lng!, r.lat!] },
            })),
          },
        });
        map.addLayer({ id: "pins-layer", type: "circle", source: "pins", paint: {
          "circle-radius": 6, "circle-color": "#f59e0b",
          "circle-stroke-width": 2, "circle-stroke-color": "#fff",
        }});
        const popup = new mapboxgl.Popup({ closeButton: false });
        map.on("mouseenter", "pins-layer", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const geom = e.features![0].geometry as GeoJSON.Point;
          const coords = geom.coordinates as [number, number];
          popup.setLngLat(coords)
            .setHTML(`<span style="font-size:12px">${e.features![0].properties!.label as string}</span>`)
            .addTo(map);
        });
        map.on("mouseleave", "pins-layer", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [areas, requests]);

  if (!TOKEN) return (
    <div className="flex h-full items-center justify-center bg-slate-100 rounded-xl">
      <p className="text-slate-400 text-sm">Set VITE_MAPBOX_PUBLIC_TOKEN to enable map</p>
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
                tab === t ? "border-b-2 border-seafoam-500 text-seafoam-600" : "text-slate-500 hover:text-slate-700"
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

            {loading ? <p className="text-sm text-slate-400">Loading…</p> : (
              <div className="space-y-2">
                {areas.map((area) => (
                  <Card key={area.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[area.status]}`}>{area.status}</span>
                      <span className="font-medium text-sm">{area.name}</span>
                      <span className="text-xs text-slate-400 font-mono">{area.slug}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => toggleStatus(area)}>
                        {area.status === "live" ? "Mark upcoming" : "Mark live"}
                      </Button>
                      <Button variant="danger" onClick={() => deleteArea(area.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Card>
                ))}
                {areas.length === 0 && <p className="text-sm text-slate-400">No areas configured yet.</p>}
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
                    {r.lat && <span className="text-xs text-slate-400">{r.lat.toFixed(2)},{r.lng!.toFixed(2)}</span>}
                  </div>
                ))}
                {requests.length === 0 && <p className="text-sm text-slate-400">No requests yet.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">City update subscribers ({subscribers.length})</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {subscribers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-slate-50">
                    <span className="flex-1 truncate text-slate-700">{s.email}</span>
                    {s.city_input && <span className="text-xs text-slate-400 truncate">{s.city_input}</span>}
                  </div>
                ))}
                {subscribers.length === 0 && <p className="text-sm text-slate-400">No subscribers yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
