import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { MapPin, Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input, getMapboxToken } from "@sweepr/ui";
import type { Address } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { AddressMapPreview } from "../../components/AddressMapPreview";

const MAPBOX_TOKEN = getMapboxToken();
const API_URL = import.meta.env.VITE_API_URL ?? "";

interface SavedAddress {
  id: string;
  label: string | null;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  propertyType: string;
}

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
  const { getToken } = useAuth();
  const address = useBookingStore((s) => s.address);
  const setAddress = useBookingStore((s) => s.setAddress);
  const intent = useBookingStore((s) => s.intent);

  // Saved addresses matching this booking's intent (home vs short-term rental).
  // When the customer has one or more, we ask which one instead of forcing a
  // fresh search; "add a different address" reveals the search box.
  const wantType = intent === "short_term_rental" ? "short_term_rental" : "home";
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/customer-profile/addresses`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as { addresses: SavedAddress[] };
        if (cancelled) return;
        const matching = data.addresses.filter((a) => a.propertyType === wantType);
        setSaved(matching);
        // If nothing saved for this type, go straight to the search box.
        setAdding(matching.length === 0);
      } catch {
        if (!cancelled) setAdding(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, wantType]);

  function chooseSaved(a: SavedAddress) {
    setAddress({
      id: a.id,
      line1: a.line1,
      city: a.city,
      state: a.state,
      zip: a.zip,
      lat: a.lat,
      lng: a.lng,
    });
    setOutOfArea(false);
  }
  const [query, setQuery] = useState(
    address ? [address.line1, address.city, address.state, address.zip].filter(Boolean).join(", ") : ""
  );
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [outOfArea, setOutOfArea] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const userEditedRef = useRef(false);

  // The booking store is a zustand `persist` store: on mount its data is
  // hydrated from localStorage *asynchronously*, so `address` can still be
  // null during the initial render even though a saved address exists. Sync
  // the input once the persisted address becomes available (or changes from
  // elsewhere, e.g. rebook), but don't clobber text the customer is actively
  // typing/editing.
  useEffect(() => {
    if (userEditedRef.current) return;
    if (address) {
      setQuery(
        [address.line1, address.city, address.state, address.zip]
          .filter(Boolean)
          .join(", ")
      );
    }
  }, [address]);

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
    userEditedRef.current = true;
    setQuery(value);
    setOutOfArea(false);
    if (value !== address?.line1) setAddress(null as unknown as Address);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  }

  function handleSelect(f: GeoFeature) {
    userEditedRef.current = false;
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
      {saved.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-charcoal dark:text-white">
            Which address needs cleaning?
          </p>
          {saved.map((a) => {
            const selected = address?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => chooseSaved(a)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                  selected
                    ? "border-seafoam-500 ring-2 ring-seafoam-400"
                    : "border-slate-200 hover:border-seafoam-300 dark:border-slate-700"
                }`}
              >
                <MapPin className="h-4 w-4 shrink-0 text-seafoam-500" />
                <div className="flex-1">
                  {a.label && <p className="text-sm font-semibold text-charcoal dark:text-white">{a.label}</p>}
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {[a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                  </p>
                </div>
                {selected && <Check className="h-5 w-5 text-seafoam-600" />}
              </button>
            );
          })}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-1 py-2 text-sm font-medium text-seafoam-700 dark:text-seafoam-300"
            >
              <Plus className="h-4 w-4" /> Use a different address
            </button>
          )}
        </div>
      )}

      <div ref={wrapperRef} className={`relative ${adding ? "" : "hidden"}`}>
        <Input
          label={t("booking.address.label")}
          placeholder={t("booking.address.placeholder")}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown && suggestions.length > 0}
          aria-controls="address-suggestions"
          aria-autocomplete="list"
        />

        {loading && (
          <div
            className="absolute right-3 top-9 h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-seafoam-400 border-t-transparent"
            role="status"
          >
            <span className="sr-only">{t("common.loading", { defaultValue: "Loading…" })}</span>
          </div>
        )}

        {showDropdown && suggestions.length > 0 && (
          <ul
            id="address-suggestions"
            role="listbox"
            className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {suggestions.map((f) => (
              <li key={f.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={() => handleSelect(f)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-seafoam-50 dark:hover:bg-slate-800"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-500" aria-hidden="true" />
                  <span className="text-slate-700 dark:text-slate-200">{f.place_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {outOfArea && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">{t("booking.address.outOfAreaTitle")}</p>
          <p className="mt-1">{t("booking.address.outOfAreaBody")}</p>
        </div>
      )}

      {address?.lat != null && address?.lng != null && !outOfArea && (
        <div className="mt-4">
          <AddressMapPreview lat={address.lat} lng={address.lng} />
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <MapPin className="h-4 w-4 text-seafoam-500" aria-hidden="true" />
            {[address.line1, address.city, address.state, address.zip]
              .filter(Boolean)
              .join(", ")}
          </div>
        </div>
      )}
    </StepShell>
  );
}
