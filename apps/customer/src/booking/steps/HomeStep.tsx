import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input, Select } from "@sweepr/ui";
import type { HomeType } from "@sweepr/types";
import { useBookingStore } from "../../store/booking";
import { StepShell } from "../StepShell";
import { useCustomerProfile } from "../../data/profile";

const DEFAULTS = { bedrooms: 2, bathrooms: 1, sqft: 1200, homeType: "apartment" as HomeType };

function clamp(value: string, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function HomeStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const home = useBookingStore((s) => s.home);
  const setHome = useBookingStore((s) => s.setHome);
  const { data: profileData } = useCustomerProfile();

  const homeTypes: { label: string; value: HomeType }[] = [
    { label: t("booking.home.apartment"), value: "apartment" },
    { label: t("booking.home.house"), value: "house" },
    { label: t("booking.home.condo"), value: "condo" },
    { label: t("booking.home.townhouse"), value: "townhouse" },
    { label: t("booking.home.studio"), value: "studio" },
  ];

  useEffect(() => {
    const p = profileData?.profile;
    if (!p?.homeBedrooms) return;
    // Only pre-fill if the store still holds the initial defaults (user hasn't customised yet).
    if (
      home.bedrooms === DEFAULTS.bedrooms &&
      home.bathrooms === DEFAULTS.bathrooms &&
      home.sqft === DEFAULTS.sqft &&
      home.homeType === DEFAULTS.homeType
    ) {
      setHome({
        bedrooms: p.homeBedrooms ?? DEFAULTS.bedrooms,
        bathrooms: p.homeBathrooms ?? DEFAULTS.bathrooms,
        sqft: p.homeSqft ?? DEFAULTS.sqft,
        homeType: (p.homeType as HomeType) ?? DEFAULTS.homeType,
        pets: p.hasPets ?? false,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData]);

  return (
    <StepShell
      title={t("booking.home.title")}
      subtitle={t("booking.home.subtitle")}
      onBack={() => navigate("/book/address")}
      onNext={() => navigate("/book/service")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="number"
          min={0}
          max={10}
          label={t("booking.home.bedrooms")}
          value={home.bedrooms}
          onChange={(e) => setHome({ bedrooms: clamp(e.target.value, 0, 10, DEFAULTS.bedrooms) })}
        />
        <Input
          type="number"
          min={1}
          max={10}
          label={t("booking.home.bathrooms")}
          value={home.bathrooms}
          onChange={(e) => setHome({ bathrooms: clamp(e.target.value, 1, 10, DEFAULTS.bathrooms) })}
        />
        <Input
          type="number"
          min={200}
          max={20000}
          step={100}
          label={t("booking.home.sqft")}
          value={home.sqft}
          onChange={(e) => setHome({ sqft: clamp(e.target.value, 200, 20000, DEFAULTS.sqft) })}
        />
        <Select
          label={t("booking.home.homeType")}
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
          {t("booking.home.hasPets")}
        </span>
      </label>
    </StepShell>
  );
}
