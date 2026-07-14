/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Get a quote — a stripped booking flow with no booking. Visitors describe
 * their home and see a live price. No address, no date, no account. The same
 * client quote math the booking flow previews with (packages/utils) keeps the
 * number honest; the exact final price is still computed server-side when
 * they actually book.
 */

import { useMemo, useState } from "react";
import { ArrowRight, Check, KeyRound } from "lucide-react";
import {
  ADD_ONS,
  calculateQuote,
  CLEANING_LEVELS,
  SERVICE_LABELS,
  isAddOnIncludedInPackage,
} from "@sweepr/utils";
import type { CleaningLevel, HomeType, ServiceType } from "@sweepr/types";
import { Button, MarketingShell } from "@sweepr/ui";
import { LanguageSelector } from "../i18n/LanguageSelector";

const CUSTOMER_URL = import.meta.env.VITE_CUSTOMER_URL || "https://app.getsweepr.com";

/** Quote-relevant packages (subsets like recurring price per-visit anyway). */
const SERVICES: ServiceType[] = ["light", "standard", "deep", "move_in_out", "vacation_rental"];

const HOME_TYPES: Array<{ key: HomeType; label: string }> = [
  { key: "apartment", label: "Apartment" },
  { key: "condo", label: "Condo" },
  { key: "townhouse", label: "Townhouse" },
  { key: "house", label: "House" },
];

const SQFT_CHOICES = [
  { label: "Under 1,000 sq ft", value: 900 },
  { label: "1,000–1,500 sq ft", value: 1250 },
  { label: "1,500–2,000 sq ft", value: 1750 },
  { label: "2,000–3,000 sq ft", value: 2500 },
  { label: "Over 3,000 sq ft", value: 3400 },
];

/**
 * Sweepr Secure Access (Smart Entry, powered by Seam): a membership add-on,
 * not a cleaning add-on, so it lives outside packages/utils ADD_ONS and is
 * listed here explicitly. $5 per cleaning, included with Sweepr+.
 */
const SECURE_ACCESS_PRICE = 5;

const LEVEL_SHORT: Record<CleaningLevel, string> = {
  refresh: "Just a refresh",
  extra_attention: "Extra attention",
  significant_attention: "Significant attention",
};

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
        selected
          ? "border-seafoam-600 bg-seafoam-50 text-seafoam-800 dark:border-seafoam-500 dark:bg-seafoam-900/30 dark:text-seafoam-200"
          : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 dark:border-slate-700">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-lg font-bold text-slate-600 disabled:opacity-30 dark:border-slate-600 dark:text-slate-300"
        >
          −
        </button>
        <span className="w-4 text-center text-sm font-bold text-charcoal dark:text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-lg font-bold text-slate-600 disabled:opacity-30 dark:border-slate-600 dark:text-slate-300"
        >
          +
        </button>
      </span>
    </div>
  );
}

export function QuotePage() {
  const [serviceType, setServiceType] = useState<ServiceType>("standard");
  const [homeType, setHomeType] = useState<HomeType>("house");
  const [sqft, setSqft] = useState(1250);
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [level, setLevel] = useState<CleaningLevel>("refresh");
  const [addOnKeys, setAddOnKeys] = useState<string[]>([]);
  const [secureAccess, setSecureAccess] = useState(false);

  const availableAddOns = useMemo(
    () => ADD_ONS.filter((a) => !isAddOnIncludedInPackage(a.key, serviceType)),
    [serviceType]
  );

  const quote = useMemo(
    () =>
      calculateQuote({
        serviceType,
        home: { bedrooms, bathrooms, sqft, homeType, pets: false },
        addOnKeys: addOnKeys.filter((k) => !isAddOnIncludedInPackage(k, serviceType)),
        cleaningLevel: level,
      }),
    [serviceType, bedrooms, bathrooms, sqft, homeType, level, addOnKeys]
  );

  const total = quote.total + (secureAccess ? SECURE_ACCESS_PRICE : 0);

  const toggleAddOn = (key: string) =>
    setAddOnKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const bookUrl = `${CUSTOMER_URL}/book`;

  return (
    <MarketingShell
      navLinks={[{ label: "Home", href: "/" }]}
      cta={
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <a href={bookUrl}>
            <Button>Book a cleaning</Button>
          </a>
        </div>
      }
    >
      <section className="mx-auto max-w-6xl px-4 pb-24 pt-14">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-5xl">
            See your price before you sign up
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Describe your home and watch the price update. No address, no date,
            no account needed. When you're ready, create an account and book,
            the price carries the same math.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* ── Inputs ── */}
          <div className="flex flex-col gap-8">
            <fieldset>
              <legend className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                What kind of clean?
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {SERVICES.map((s) => (
                  <Chip key={s} selected={serviceType === s} onClick={() => setServiceType(s)}>
                    {SERVICE_LABELS[s]}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Your home
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {HOME_TYPES.map((h) => (
                  <Chip key={h.key} selected={homeType === h.key} onClick={() => setHomeType(h.key)}>
                    {h.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SQFT_CHOICES.map((c) => (
                  <Chip key={c.value} selected={sqft === c.value} onClick={() => setSqft(c.value)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Counter label="Bedrooms" value={bedrooms} min={1} max={8} onChange={setBedrooms} />
                <Counter label="Bathrooms" value={bathrooms} min={1} max={6} onChange={setBathrooms} />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                How much attention does it need?
              </legend>
              <div className="mt-3 grid gap-2">
                {CLEANING_LEVELS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => setLevel(l.key)}
                    aria-pressed={level === l.key}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      level === l.key
                        ? "border-seafoam-600 bg-seafoam-50 dark:border-seafoam-500 dark:bg-seafoam-900/25"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <span className="block text-sm font-bold text-charcoal dark:text-white">
                      {LEVEL_SHORT[l.key]}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {l.description} {l.surchargeNote}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Add-ons
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {availableAddOns.map((a) => {
                  const selected = addOnKeys.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleAddOn(a.key)}
                      aria-pressed={selected}
                      className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-seafoam-600 bg-seafoam-50 dark:border-seafoam-500 dark:bg-seafoam-900/25"
                          : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{a.name}</span>
                      <span className="text-sm font-bold text-charcoal dark:text-white">${a.price}</span>
                    </button>
                  );
                })}
                {/* Sweepr Secure Access — smart-lock entry, powered by Seam */}
                <button
                  type="button"
                  onClick={() => setSecureAccess((v) => !v)}
                  aria-pressed={secureAccess}
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors sm:col-span-2 ${
                    secureAccess
                      ? "border-seafoam-600 bg-seafoam-50 dark:border-seafoam-500 dark:bg-seafoam-900/25"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <KeyRound className="h-4 w-4 shrink-0 text-seafoam-700 dark:text-seafoam-300" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Sweepr Secure Access
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Smart-lock entry for your cleaner, time-boxed and logged. Included with Sweepr+.
                      </span>
                    </span>
                  </span>
                  <span className="text-sm font-bold text-charcoal dark:text-white">${SECURE_ACCESS_PRICE}</span>
                </button>
              </div>
            </fieldset>
          </div>

          {/* ── Live price ── */}
          <aside className="self-start rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your estimated price
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight text-charcoal dark:text-white">
              ${total.toFixed(0)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {SERVICE_LABELS[serviceType]} · {bedrooms} bed · {bathrooms} bath
            </p>

            <ul className="mt-5 grid gap-1.5 border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {[
                "Exact final price confirmed at booking",
                "A temporary hold at booking, paid after the clean",
                "Background-checked, identity-verified cleaner",
                "Tax is added at checkout based on your address",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <a href={bookUrl} className="mt-6 block">
              <Button size="lg" className="w-full justify-center">
                Create an account &amp; book
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </a>
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
              Signing up takes about a minute. Your details here don't follow
              you, you'll confirm everything at booking.
            </p>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}

export default QuotePage;
