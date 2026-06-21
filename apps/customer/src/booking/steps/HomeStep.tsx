import { useNavigate } from "react-router-dom";
import { Input, Select } from "@sweepr/ui";
import type { HomeType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";

const homeTypes: { label: string; value: HomeType }[] = [
  { label: "Apartment", value: "apartment" },
  { label: "House", value: "house" },
  { label: "Condo", value: "condo" },
  { label: "Townhouse", value: "townhouse" },
  { label: "Studio", value: "studio" },
];

export function HomeStep() {
  const navigate = useNavigate();
  const home = useBookingStore((s) => s.home);
  const setHome = useBookingStore((s) => s.setHome);

  return (
    <StepShell
      title="Tell us about your home"
      subtitle="This helps us match the right cleaner and quote accurately."
      onBack={() => navigate("/book/address")}
      onNext={() => navigate("/book/service")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="number"
          min={0}
          max={10}
          label="Bedrooms"
          value={home.bedrooms}
          onChange={(e) => setHome({ bedrooms: Number(e.target.value) })}
        />
        <Input
          type="number"
          min={1}
          max={10}
          label="Bathrooms"
          value={home.bathrooms}
          onChange={(e) => setHome({ bathrooms: Number(e.target.value) })}
        />
        <Input
          type="number"
          min={200}
          step={100}
          label="Square footage"
          value={home.sqft}
          onChange={(e) => setHome({ sqft: Number(e.target.value) })}
        />
        <Select
          label="Home type"
          options={homeTypes}
          value={home.homeType}
          onChange={(e) => setHome({ homeType: e.target.value as HomeType })}
        />
      </div>

      <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
        <input
          type="checkbox"
          checked={home.pets}
          onChange={(e) => setHome({ pets: e.target.checked })}
          className="h-4 w-4 accent-seafoam-500"
        />
        <span className="text-sm text-charcoal dark:text-white">
          I have pets at home
        </span>
      </label>
    </StepShell>
  );
}
