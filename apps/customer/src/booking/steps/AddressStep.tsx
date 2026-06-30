import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input, getMapboxToken } from "@sweepr/ui";
import type { Address } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { AddressMapPreview } from "../../components/AddressMapPreview";

const MAPBOX_TOKEN = getMapboxToken();

const SERVICE_AREA_STATES = ["CA", "TX", "FL", "NY", "WA", "CO"];

const US_STATE_ABBREVS: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

interface GeoFeature {
  id: string;
  place_name: string;
  place_type: string[];
  text: string;
  context?: Array<{ id: string; text: string; short_code?: string }>;
  geometry: { coordinates: [number, number] };
}

interface GeoResponse {
  features: GeoFeature[];
}

function parseFeature(f: GeoFeature): Address | null {
  const ctx = f.context ?? [];
  const get = (prefix: string) => ctx.find((c) => c.id.startsWith(prefix));

  const regionCtx = get("region");
  // Mapbox short_code for US regions is "US-CA" etc.
  const stateCode =
    regionCtx?.short_code?.replace(/^US-/, "") ??
    (regionCtx?.text ? US_STATE_ABBREVS[regionCtx.text] : undefined) ??
    "";

  const zip = get("postcode")?.text ?? (f.place_type.includes("postcode") ? f.text : "");
  const city =
    get("place")?.text ??
    (f.place_type.includes("place") ? f.text : "");
  const [lng, lat] = f.geometry.coordinates;

  const line1 = f.place_type.includes("address")
    ? f.place_name.split(",")[0].trim()
    : "";

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

const ZIP_RE = /^\d{5}$/;

export function AddressStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const address = useBookingStore((s) => s.address);
  const setAddress = useBookingStore((s) => s.setAddress);
  const [query, setQuery] = useState(
    address ? [address.line1, address.city, address.state, address.zip].filter(Boolean).join(", ") : ""
  );
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [outOfArea, setOutOfArea] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    const trimmed = q.trim();
    if (!MAPBOX_TOKEN || trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      // For zip codes use postcode type only; otherwise include address + place
      const types = ZIP_RE.test(trimmed) ? "postcode" : "address,place,postcode";
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`
      );
      url.searchParams.set("access_token", MAPBOX_TOKEN);
      url.searchParams.set("country", "us");
      url.searchParams.set("types", types);
      url.searchParams.set("autocomplete", "true");
      url.searchParams.set("limit", "6");
      const res = await fetch(url.toString());
      const data: GeoResponse = await res.json();
      setSuggestions(data.features ?? []);
      setShowDropdown((data.features?.length ?? 0) > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(value: string) {
    setQuery(value);
    setOutOfArea(false);
    if (value !== address?.line1) setAddress(null as unknown as Address);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  }

  function handleSelect(f: GeoFeature) {
    setShowDropdown(false);
    setSuggestions([]);
    const parsed = parseFeature(f);
    if (!parsed) return;

    const inArea = SERVICE_AREA_STATES.includes(parsed.state.toUpperCase());
    setOutOfArea(!inArea);

    const label = f.place_name;
    setQuery(label);

    if (!inArea) return;
    setAddress(parsed);
  }

  return (
    <StepShell
      title={t("booking.address.title")}
      subtitle={t("booking.address.subtitle")}
      onNext={() => navigate("/book/home")}
      nextDisabled={!address || outOfArea}
    >
      <div ref={wrapperRef} className="relative">
        <Input
          label={t("booking.address.label")}
          placeholder={t("booking.address.placeholder")}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          autoComplete="off"
        />

        {loading && (
          <div className="absolute right-3 top-9 h-4 w-4 animate-spin rounded-full border-2 border-seafoam-400 border-t-transparent" />
        )}

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
                  <span className="text-slate-700 dark:text-slate-200">{f.place_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {outOfArea && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">{t("booking.address.outOfAreaTitle")}</p>
          <p className="mt-1">{t("booking.address.outOfAreaBody")}</p>
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
