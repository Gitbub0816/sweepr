import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Button, Input, Select, SweeprLogo, toast } from "@sweepr/ui";
import type { HomeType } from "@sweepr/types";
import { saveCustomerProfile } from "../data/profile";
import { useBookingStore } from "../store/booking";

const homeTypes: { label: string; value: HomeType }[] = [
  { label: "Apartment", value: "apartment" },
  { label: "House", value: "house" },
  { label: "Condo", value: "condo" },
  { label: "Townhouse", value: "townhouse" },
  { label: "Studio", value: "studio" },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const setHome = useBookingStore((s) => s.setHome);

  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [sqft, setSqft] = useState(1200);
  const [homeType, setHomeType] = useState<HomeType>("apartment");
  const [hasPets, setHasPets] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveCustomerProfile(getToken, {
        homeBedrooms: bedrooms,
        homeBathrooms: bathrooms,
        homeSqft: sqft,
        homeType,
        hasPets,
        onboarded: true,
      });

      // Pre-fill the booking store so the HomeStep is already filled in.
      setHome({ bedrooms, bathrooms, sqft, homeType, pets: hasPets });

      navigate("/home");
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-offwhite px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <SweeprLogo size="xl" />
        </div>

        <h1 className="text-2xl font-black text-charcoal dark:text-white">
          Welcome! Let's set up your home.
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This helps us give you accurate quotes instantly. You can change these at any time.
        </p>

        <div className="mt-8 space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="number"
              min={0}
              max={10}
              label="Bedrooms"
              value={bedrooms}
              onChange={(e) => setBedrooms(Number(e.target.value))}
            />
            <Input
              type="number"
              min={1}
              max={10}
              label="Bathrooms"
              value={bathrooms}
              onChange={(e) => setBathrooms(Number(e.target.value))}
            />
            <Input
              type="number"
              min={200}
              step={100}
              label="Square footage"
              value={sqft}
              onChange={(e) => setSqft(Number(e.target.value))}
            />
            <Select
              label="Home type"
              options={homeTypes}
              value={homeType}
              onChange={(e) => setHomeType(e.target.value as HomeType)}
            />
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
            <input
              type="checkbox"
              checked={hasPets}
              onChange={(e) => setHasPets(e.target.checked)}
              className="h-4 w-4 accent-seafoam-500"
            />
            <span className="text-sm text-charcoal dark:text-white">I have pets at home</span>
          </label>

          <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
            Let's go!
          </Button>
        </div>
      </div>
    </div>
  );
}
