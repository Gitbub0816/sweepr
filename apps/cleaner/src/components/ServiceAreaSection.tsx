import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Card, Input, Button, toast, getMapboxToken } from "@sweepr/ui";
import { MapPin } from "lucide-react";
import { ServiceAreaMap } from "./ServiceAreaMap";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const MAPBOX_TOKEN = getMapboxToken();

/** Forward-geocode an address/city to [lng, lat] via Mapbox, then Nominatim. */
async function geocode(query: string): Promise<[number, number] | null> {
  try {
    if (MAPBOX_TOKEN) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { features?: Array<{ center: [number, number] }> };
        if (data.features?.[0]) return data.features[0].center;
      }
    }
    const nom = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(nom);
    if (res.ok) {
      const data = (await res.json()) as Array<{ lon: string; lat: string }>;
      if (data[0]) return [Number(data[0].lon), Number(data[0].lat)];
    }
  } catch {
    /* geocode is best-effort */
  }
  return null;
}

// Default map center (continental US) until the cleaner sets an address.
const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];

/**
 * Lets a cleaner set their own service area — an address they'll travel from
 * plus a radius. The assignment engine only offers them jobs inside this
 * radius. Distinct from (and smaller than) the company-wide coverage area.
 */
export function ServiceAreaSection() {
  const { getToken } = useAuth();
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [radius, setRadius] = useState(15);
  const [address, setAddress] = useState("");
  const [hasArea, setHasArea] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!API_URL) { setLoading(false); return; }
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/service-area`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { area } = (await res.json()) as {
          area: { centerLat: number | null; centerLng: number | null; radiusMiles: number; label: string | null } | null;
        };
        if (area?.centerLat != null && area?.centerLng != null) {
          setCenter([area.centerLng, area.centerLat]);
          setRadius(area.radiusMiles);
          setAddress(area.label ?? "");
          setHasArea(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function locate() {
    if (!address.trim()) return;
    setLocating(true);
    const coords = await geocode(address.trim());
    setLocating(false);
    if (coords) { setCenter(coords); setHasArea(true); }
    else toast.error("Couldn't find that address — try a nearby city and ZIP.");
  }

  async function save() {
    if (!hasArea) { toast.error("Enter your address and press Locate first."); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/cleaner-dashboard/service-area`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          centerLat: center[1],
          centerLng: center[0],
          radiusMiles: radius,
          label: address.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Service area saved");
    } catch {
      toast.error("Couldn't save your service area. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-charcoal dark:text-white">
          <MapPin className="h-4 w-4 text-seafoam-600" /> Service area
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Set where you'll work. You'll only be offered jobs inside this radius.
        </p>
      </div>

      {!loading && <ServiceAreaMap center={center} radiusMi={radius} />}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Center address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => void locate()}
            placeholder="Street, City, State ZIP"
          />
        </div>
        <Button variant="secondary" onClick={() => void locate()} loading={locating}>Locate</Button>
      </div>

      <div>
        <label htmlFor="cleaner-radius" className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
          Service radius: {radius} miles
        </label>
        <input
          id="cleaner-radius"
          type="range"
          min={1}
          max={50}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          aria-label="Service radius in miles"
          className="w-full accent-seafoam-500"
        />
      </div>

      <Button onClick={save} loading={saving} disabled={!hasArea}>Save service area</Button>
    </Card>
  );
}
