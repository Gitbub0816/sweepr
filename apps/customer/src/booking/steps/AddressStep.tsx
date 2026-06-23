import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Input } from "@sweepr/ui";
import type { Address } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { AddressMapPreview } from "../../components/AddressMapPreview";

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

const SERVICE_AREA_STATES = ["CA", "TX", "FL", "NY", "WA", "CO"];

interface GeoFeature {
  id: string;
  place_name: string;
  place_type: string[];
  text: string;
  context?: Array<{ id: string; text: string }>;
  geometry: { coordinates: [number, number] };
  properties: Record<string, string>;
}

interface GeoResponse {
  features: GeoFeature[];
}

function parseFeature(f: GeoFeature): Address | null {
  const ctx = f.context ?? [];
  const get = (prefix: string) =>
    ctx.find((c) => c.id.startsWith(prefix))?.text ?? "";

  const isPostcode = f.place_type.includes("postcode");
  const isPlace = f.place_type.includes("place");
  const isAddress = f.place_type.includes("address");

  const zip = isPostcode ? f.text : get("postcode");
  const city = isPlace ? f.text : get("place");
  const stateRaw = get("region");
  // Mapbox returns full state names — convert to abbreviation via context id
  const stateCtx = ctx.find((c) => c.id.startsWith("region"));
  const stateCode = stateCtx?.id?.split(".")[0]?.split("-")[2]?.toUpperCase() ?? stateRaw.slice(0, 2).toUpperCase();
  const [lng, lat] = f.geometry.coordinates;

  const line1 = isAddress
    ? f.place_name.split(",")[0]
    : isPostcode || isPlace
    ? ""
    : f.text;

  return {
    id: `addr_${zip || Date.now()}`,
    line1,
    city,
    state: stateCode,
    zip,
    lat,
    lng,
  };
}

export function AddressStep() {
  const navigate = useNavigate();
  const address = useBookingStore((s) => s.address);
  const setAddress = useBookingStore((s) => s.setAddress);
  const [query, setQuery] = useState(address?.line1 ?? "");
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [outOfArea, setOutOfArea] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function fetchSuggestions(q: string) {
    if (!MAPBOX_TOKEN || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
      );
      url.searchParams.set("access_token", MAPBOX_TOKEN);
      url.searchParams.set("country", "us");
      url.searchParams.set("types", "address,place,postcode");
      url.searchParams.set("autocomplete", "true");
      url.searchParams.set("limit", "6");
      const res = await fetch(url.toString());
      const data: GeoResponse = await res.json();
      setSuggestions(data.features ?? []);
      setShowDropdown(true);
    } catch {
      setSuggestions([]);
    }
  }

  function handleChange(value: string) {
    setQuery(value);
    setOutOfArea(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 250);
  }

  function handleSelect(f: GeoFeature) {
    setShowDropdown(false);
    const parsed = parseFeature(f);
    if (!parsed) return;

    const inArea = SERVICE_AREA_STATES.includes(parsed.state.toUpperCase());
    setOutOfArea(!inArea);
    if (!inArea) {
      setQuery(f.place_name);
      return;
    }

    setAddress(parsed);
    setQuery(f.place_name.split(",")[0] || f.place_name);
  }

  return (
    <StepShell
      title="Where should we clean?"
      subtitle="Search by address, city, or ZIP code to check availability near you."
      onNext={() => navigate("/book/home")}
      nextDisabled={!address || outOfArea}
    >
      <div ref={wrapperRef} className="relative">
        <Input
          label="Address, city, or ZIP code"
          placeholder="e.g. 123 Main St, Austin, or 78701"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          autoComplete="off"
        />

        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {suggestions.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(f)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-seafoam-50 dark:hover:bg-slate-800"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-500" />
                  <span className="text-slate-700 dark:text-slate-200">
                    {f.place_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {outOfArea && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">We're not in your area yet.</p>
          <p className="mt-1">
            Sweepr is currently available in CA, TX, FL, NY, WA and CO. Leave us
            your email and we'll notify you the moment we launch near you.
          </p>
        </div>
      )}

      {address?.lat != null && address?.lng != null && !outOfArea && (
        <div className="mt-4">
          <AddressMapPreview lat={address.lat} lng={address.lng} />
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <MapPin className="h-4 w-4 text-seafoam-500" />
            {[address.line1, address.city, address.state, address.zip]
              .filter(Boolean)
              .join(", ")}
          </div>
        </div>
      )}
    </StepShell>
  );
}
