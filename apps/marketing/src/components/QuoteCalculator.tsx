import { useMemo, useState } from "react";
import { calculateQuote, formatCurrency, SERVICE_LABELS } from "@sweepr/utils";
import type { ServiceType, HomeType } from "@sweepr/types";
import { ArrowRight } from "lucide-react";

const CUSTOMER_URL =
  import.meta.env.VITE_CUSTOMER_URL || "https://app.sweep-r.com";

const SERVICES: ServiceType[] = ["standard", "deep", "move_in_out", "recurring"];

/**
 * DoorDash-style "order now" mini widget: instant price as the user picks
 * bedrooms, bathrooms and a service type. Floats over the hero.
 */
export function QuoteCalculator() {
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [serviceType, setServiceType] = useState<ServiceType>("standard");

  const quote = useMemo(
    () =>
      calculateQuote({
        serviceType,
        home: {
          bedrooms,
          bathrooms,
          sqft: 1200,
          homeType: "apartment" as HomeType,
          pets: false,
        },
        addOnKeys: [],
      }),
    [bedrooms, bathrooms, serviceType]
  );

  return (
    <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white/95 p-6 text-left shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="text-xs font-bold uppercase tracking-wide text-seafoam-600">
        Instant quote
      </p>
      <h3 className="mt-1 text-xl font-black text-charcoal dark:text-white">
        See your price in seconds
      </h3>

      <div className="mt-5 space-y-4">
        <Stepper label="Bedrooms" value={bedrooms} onChange={setBedrooms} min={0} max={8} />
        <Stepper label="Bathrooms" value={bathrooms} onChange={setBathrooms} min={1} max={8} />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">
            Service type
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
            aria-label="Service type"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-charcoal focus:border-seafoam-500 focus:outline-none focus:ring-2 focus:ring-seafoam-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between rounded-2xl bg-seafoam-50 px-4 py-3 dark:bg-slate-800">
        <span className="text-sm font-semibold text-slate-500">Estimated total</span>
        <span className="text-2xl font-black text-seafoam-700 dark:text-seafoam-300">
          {formatCurrency(quote.total)}
        </span>
      </div>

      <button
        onClick={() => (window.location.href = CUSTOMER_URL)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-seafoam-500 px-4 py-3.5 text-base font-bold text-white transition hover:bg-seafoam-600"
      >
        Book this clean <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        Final price confirmed at checkout. No surprises.
      </p>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-9 w-9 rounded-full border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
        >
          &minus;
        </button>
        <span className="w-8 text-center text-lg font-black text-charcoal dark:text-white">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-9 w-9 rounded-full border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default QuoteCalculator;
