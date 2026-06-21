import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { AddressAutofill } from "@mapbox/search-js-react";
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

interface RetrieveResponse {
  features?: Array<{
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: number[] };
  }>;
}

export function AddressStep() {
  const navigate = useNavigate();
  const address = useBookingStore((s) => s.address);
  const setAddress = useBookingStore((s) => s.setAddress);
  const [query, setQuery] = useState(address?.line1 ?? "");
  const [outOfArea, setOutOfArea] = useState(false);

  const handleRetrieve = (raw: unknown) => {
    const res = raw as RetrieveResponse;
    const f = res.features?.[0];
    if (!f?.properties) return;
    const p = f.properties as Record<string, string>;
    const [lng, lat] = f.geometry?.coordinates ?? [undefined, undefined];

    const state = p.address_level1 ?? p.region_code ?? "";
    const inArea = SERVICE_AREA_STATES.includes(state.toUpperCase());
    setOutOfArea(!inArea);
    if (!inArea) return;

    const next: Address = {
      id: `addr_${p.postcode ?? Date.now()}`,
      line1: p.address_line1 ?? p.feature_name ?? query,
      city: p.address_level2 ?? p.place ?? "",
      state,
      zip: p.postcode ?? "",
      lat,
      lng,
    };
    setAddress(next);
    setQuery(next.line1);
  };

  return (
    <StepShell
      title="Where should we clean?"
      subtitle="Search for your address to check availability near you."
      onNext={() => navigate("/book/home")}
      nextDisabled={!address || outOfArea}
    >
      <AddressAutofill
        accessToken={MAPBOX_TOKEN}
        onRetrieve={handleRetrieve as never}
      >
        <Input
          label="Street address"
          autoComplete="address-line1"
          placeholder="Start typing your address…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOutOfArea(false);
          }}
        />
      </AddressAutofill>

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
            {address.line1}, {address.city}, {address.state} {address.zip}
          </div>
        </div>
      )}
    </StepShell>
  );
}
