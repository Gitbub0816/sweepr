/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Home as HomeIcon,
  Camera,
  Plus,
  Check,
  Minus,
  CalendarClock,
  Lock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button, Input, Select, SuccessCheck } from "@sweepr/ui";
import {
  calculateQuote,
  formatCurrency,
  SERVICE_LABELS,
  CLEANING_LEVELS,
  ADD_ONS,
  isAddOnIncludedInPackage,
  cn,
} from "@sweepr/utils";
import type { ServiceType, HomeType, CleaningLevel } from "@sweepr/types";
import { DemoChrome, StepPanel } from "../demo/DemoChrome";

const STEPS = ["Address", "Home", "Rooms", "Add-ons", "Schedule", "Review", "Payment"];

const SERVICE_OPTIONS: ServiceType[] = ["standard", "deep", "move_in_out", "recurring", "vacation_rental"];
const HOME_TYPES: { value: HomeType; label: string }[] = [
  { value: "apartment", label: "Apartment" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "house", label: "House" },
  { value: "large_house", label: "Large house" },
  { value: "studio", label: "Studio" },
];

const ROOMS = [
  { key: "kitchen", label: "Kitchen", tint: "from-amber-200 to-orange-300" },
  { key: "bathroom", label: "Bathroom", tint: "from-sky-200 to-cyan-300" },
  { key: "living", label: "Living room", tint: "from-emerald-200 to-teal-300" },
  { key: "bedroom", label: "Primary bedroom", tint: "from-violet-200 to-fuchsia-300" },
];

interface BookState {
  step: number;
  serviceType: ServiceType;
  address: string;
  city: string;
  zip: string;
  homeType: HomeType;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  pets: boolean;
  cleaningLevel: CleaningLevel;
  photos: Record<string, number>;
  addOns: string[];
  date: string;
  time: string;
  card: string;
}

const INITIAL: BookState = {
  step: 0,
  serviceType: "deep",
  address: "742 Evergreen Terrace",
  city: "Austin",
  zip: "78704",
  homeType: "house",
  sqft: 1600,
  bedrooms: 3,
  bathrooms: 2,
  pets: true,
  cleaningLevel: "extra_attention",
  photos: {},
  addOns: [],
  date: "",
  time: "10:00 AM",
  card: "",
};

const TIMES = ["8:00 AM", "10:00 AM", "12:00 PM", "2:00 PM", "4:00 PM"];

function nextDays(n: number) {
  const out: { iso: string; label: string }[] = [];
  const base = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    });
  }
  return out;
}

export function BookFlow() {
  const [s, setS] = useState<BookState>(INITIAL);
  const set = (patch: Partial<BookState>) => setS((p) => ({ ...p, ...patch }));
  const confirmed = s.step >= STEPS.length;

  const quote = useMemo(
    () =>
      calculateQuote({
        serviceType: s.serviceType,
        home: { bedrooms: s.bedrooms, bathrooms: s.bathrooms, sqft: s.sqft, homeType: s.homeType, pets: s.pets },
        addOnKeys: s.addOns,
        hasPets: s.pets,
        cleaningLevel: s.cleaningLevel,
      }),
    [s.serviceType, s.bedrooms, s.bathrooms, s.sqft, s.homeType, s.pets, s.addOns, s.cleaningLevel]
  );

  const canAdvance = (() => {
    if (s.step === 0) return s.address.trim() !== "" && s.zip.trim().length >= 5;
    if (s.step === 4) return s.date !== "";
    if (s.step === 6) return s.card.replace(/\s/g, "").length >= 12;
    return true;
  })();

  const back = () => set({ step: Math.max(0, s.step - 1) });
  const advance = () => set({ step: s.step + 1 });

  if (confirmed) {
    return (
      <DemoChrome title="Book a cleaning" persona="Customer, Alex Rivera" steps={STEPS} current={STEPS.length - 1} onReset={() => setS(INITIAL)}>
        <div className="mx-auto max-w-md py-8 text-center motion-safe:animate-[demo-pop_400ms_cubic-bezier(0.23,1,0.32,1)]">
          <div className="flex justify-center">
            <SuccessCheck size={84} label="Booking confirmed" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">You're booked.</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {SERVICE_LABELS[s.serviceType]} at {s.address}. We'll match you with a background-checked
            cleaner and hold {formatCurrency(quote.total)} on your card. You're only charged after the clean.
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Row label="When" value={`${s.date} at ${s.time}`} />
            <Row label="Home" value={`${s.bedrooms} bd · ${s.bathrooms} ba · ${s.sqft.toLocaleString()} sqft`} />
            <Row label="Authorized hold" value={formatCurrency(quote.total)} strong />
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/demo/manage">
              <Button fullWidth>Track this booking <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Button variant="ghost" fullWidth onClick={() => setS(INITIAL)}>Start over</Button>
          </div>
        </div>
      </DemoChrome>
    );
  }

  return (
    <DemoChrome title="Book a cleaning" persona="Customer, Alex Rivera" steps={STEPS} current={s.step} onReset={() => setS(INITIAL)}>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <StepPanel stepKey={s.step}>
            {s.step === 0 && <AddressStep s={s} set={set} />}
            {s.step === 1 && <HomeStep s={s} set={set} />}
            {s.step === 2 && <RoomsStep s={s} set={set} />}
            {s.step === 3 && <AddOnsStep s={s} set={set} />}
            {s.step === 4 && <ScheduleStep s={s} set={set} />}
            {s.step === 5 && <ReviewStep s={s} quote={quote} />}
            {s.step === 6 && <PaymentStep s={s} set={set} total={quote.total} />}
          </StepPanel>

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={back} disabled={s.step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={advance} disabled={!canAdvance}>
              {s.step === STEPS.length - 1 ? "Pay & book (demo)" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <QuoteCard quote={quote} service={s.serviceType} level={s.cleaningLevel} />
      </div>
    </DemoChrome>
  );
}

type StepProps = { s: BookState; set: (p: Partial<BookState>) => void };

function SectionHead({ icon: Icon, title, sub }: { icon: typeof MapPin; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-seafoam-700 dark:text-seafoam-300">
        <Icon className="h-5 w-5" />
        <h2 className="text-lg font-bold text-charcoal dark:text-white">{title}</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>
    </div>
  );
}

function AddressStep({ s, set }: StepProps) {
  return (
    <div>
      <SectionHead icon={MapPin} title="Where should we clean?" sub="We use this to match a nearby cleaner and calculate tax." />
      <div className="space-y-3">
        <Input value={s.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street address" />
        <div className="grid grid-cols-2 gap-3">
          <Input value={s.city} onChange={(e) => set({ city: e.target.value })} placeholder="City" />
          <Input value={s.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="ZIP" inputMode="numeric" />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-seafoam-200 bg-seafoam-50 px-3 py-2 text-xs text-seafoam-800 dark:border-seafoam-900/60 dark:bg-seafoam-950/40 dark:text-seafoam-200">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> In service area. 14 background-checked cleaners nearby.
        </div>
      </div>
    </div>
  );
}

function Stepper2({ value, onChange, min = 1, max = 9 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-9 w-9 items-center justify-center text-slate-500 transition-colors hover:text-charcoal disabled:opacity-30 dark:hover:text-white" disabled={value <= min}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums text-charcoal dark:text-white">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="flex h-9 w-9 items-center justify-center text-slate-500 transition-colors hover:text-charcoal disabled:opacity-30 dark:hover:text-white" disabled={value >= max}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function HomeStep({ s, set }: StepProps) {
  return (
    <div>
      <SectionHead icon={HomeIcon} title="Tell us about your home" sub="Package and size drive your quote. Cleaning level adds labor, never scope." />
      <div className="space-y-5">
        <Select
          label="Package"
          value={s.serviceType}
          onChange={(e) => set({ serviceType: e.target.value as ServiceType })}
          options={SERVICE_OPTIONS.map((v) => ({ value: v, label: SERVICE_LABELS[v] }))}
        />
        <Select
          label="Home type"
          value={s.homeType}
          onChange={(e) => set({ homeType: e.target.value as HomeType })}
          options={HOME_TYPES.map((h) => ({ value: h.value, label: h.label }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Bedrooms</span>
            <Stepper2 value={s.bedrooms} onChange={(n) => set({ bedrooms: n })} min={0} />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Bathrooms</span>
            <Stepper2 value={s.bathrooms} onChange={(n) => set({ bathrooms: n })} />
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">Square feet: <span className="tabular-nums text-seafoam-700 dark:text-seafoam-300">{s.sqft.toLocaleString()}</span></span>
          <input type="range" min={400} max={4000} step={100} value={s.sqft} onChange={(e) => set({ sqft: Number(e.target.value) })} className="w-full accent-seafoam-600" />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <input type="checkbox" checked={s.pets} onChange={(e) => set({ pets: e.target.checked })} className="h-4 w-4 accent-seafoam-600" />
          <span className="text-sm text-charcoal dark:text-slate-200">Pets in the home</span>
        </label>
        <div>
          <span className="mb-2 block text-sm font-medium text-charcoal dark:text-slate-200">Cleaning level</span>
          <div className="space-y-2">
            {CLEANING_LEVELS.map((lvl) => (
              <button
                key={lvl.key}
                type="button"
                onClick={() => set({ cleaningLevel: lvl.key })}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] duration-150",
                  s.cleaningLevel === lvl.key
                    ? "border-seafoam-500 bg-seafoam-50 dark:border-seafoam-600 dark:bg-seafoam-950/40"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                )}
              >
                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", s.cleaningLevel === lvl.key ? "border-seafoam-600 bg-seafoam-600" : "border-slate-300 dark:border-slate-600")}>
                  {s.cleaningLevel === lvl.key && <Check className="h-3 w-3 text-white" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-charcoal dark:text-white">{lvl.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{lvl.surchargeNote}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomsStep({ s, set }: StepProps) {
  const addPhoto = (key: string) => set({ photos: { ...s.photos, [key]: Math.min(3, (s.photos[key] ?? 0) + 1) } });
  return (
    <div>
      <SectionHead icon={Camera} title="Show us the rooms" sub="Photos help your cleaner arrive prepared. Tap a tile to attach a demo photo." />
      <div className="grid grid-cols-2 gap-3">
        {ROOMS.map((r) => {
          const count = s.photos[r.key] ?? 0;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => addPhoto(r.key)}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 text-left transition-transform duration-150 [@media(hover:hover)]:active:scale-[0.98] dark:border-slate-700"
            >
              {count > 0 ? (
                <span className={cn("absolute inset-0 bg-gradient-to-br", r.tint)} aria-hidden />
              ) : (
                <span className="absolute inset-0 bg-slate-100 dark:bg-slate-800" aria-hidden />
              )}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
                {count === 0 ? (
                  <>
                    <Camera className="h-5 w-5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Add photo</span>
                  </>
                ) : (
                  <span className="rounded-full bg-white/85 px-2 py-0.5 text-xs font-semibold text-charcoal backdrop-blur">{count} photo{count > 1 ? "s" : ""}</span>
                )}
              </span>
              <span className="absolute bottom-2 left-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">{r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddOnsStep({ s, set }: StepProps) {
  const toggle = (key: string) => set({ addOns: s.addOns.includes(key) ? s.addOns.filter((k) => k !== key) : [...s.addOns, key] });
  return (
    <div>
      <SectionHead icon={Sparkles} title="Add extra scope" sub="Add-ons already covered by your package are locked. Purchasable up until check-in." />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {ADD_ONS.map((a) => {
          const included = isAddOnIncludedInPackage(a.key, s.serviceType);
          const on = s.addOns.includes(a.key);
          return (
            <button
              key={a.key}
              type="button"
              disabled={included}
              onClick={() => toggle(a.key)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-[border-color,background-color,transform] duration-150 [@media(hover:hover)]:active:scale-[0.98]",
                included && "cursor-not-allowed opacity-55",
                on
                  ? "border-seafoam-500 bg-seafoam-50 dark:border-seafoam-600 dark:bg-seafoam-950/40"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className="text-sm font-medium text-charcoal dark:text-white">{a.name}</span>
                {on ? <Check className="h-4 w-4 text-seafoam-600" /> : !included && <Plus className="h-4 w-4 text-slate-300" />}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{included ? "Included" : formatCurrency(a.price)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleStep({ s, set }: StepProps) {
  const days = useMemo(() => nextDays(6), []);
  return (
    <div>
      <SectionHead icon={CalendarClock} title="Pick a day and time" sub="Cleaners confirm within a few hours. You can reschedule for free up to 24h before." />
      <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {days.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => set({ date: d.iso })}
            className={cn(
              "rounded-xl border px-2 py-3 text-center text-xs font-medium transition-[border-color,background-color] duration-150",
              s.date === d.iso ? "border-seafoam-500 bg-seafoam-50 text-seafoam-800 dark:border-seafoam-600 dark:bg-seafoam-950/40 dark:text-seafoam-200" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TIMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set({ time: t })}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-[border-color,background-color] duration-150",
              s.time === t ? "border-seafoam-500 bg-seafoam-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewStep({ s, quote }: { s: BookState; quote: ReturnType<typeof calculateQuote> }) {
  return (
    <div>
      <SectionHead icon={Check} title="Review your booking" sub="Totals are computed server-side from your home details. This is your authorized hold." />
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Row label="Package" value={SERVICE_LABELS[s.serviceType]} />
          <Row label="Home" value={`${s.bedrooms} bd · ${s.bathrooms} ba · ${s.sqft.toLocaleString()} sqft`} />
          <Row label="Address" value={`${s.address}, ${s.city}`} />
          <Row label="When" value={s.date ? `${s.date} · ${s.time}` : "Not set"} />
          <Row label="Add-ons" value={s.addOns.length ? `${s.addOns.length} selected` : "None"} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {quote.lineItems.map((li, i) => (
            <Row key={i} label={li.label} value={formatCurrency(li.amount)} muted />
          ))}
          <div className="my-2 h-px bg-slate-100 dark:bg-slate-800" />
          <Row label="Total (authorized hold)" value={formatCurrency(quote.total)} strong />
        </div>
      </div>
    </div>
  );
}

function PaymentStep({ s, set, total }: StepProps & { total: number }) {
  return (
    <div>
      <SectionHead icon={Lock} title="Payment" sub="Demo checkout. Any card number is accepted, and nothing is ever charged." />
      <div className="rounded-2xl border border-dashed border-seafoam-300 bg-seafoam-50/60 p-4 dark:border-seafoam-800 dark:bg-seafoam-950/30">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-seafoam-800 dark:text-seafoam-200">
          <Lock className="h-3.5 w-3.5" /> Simulated card, do not enter real details
        </p>
        <div className="space-y-3">
          <Input value={s.card} onChange={(e) => set({ card: e.target.value })} placeholder="4242 4242 4242 4242" inputMode="numeric" />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="MM / YY" defaultValue="12 / 30" />
            <Input placeholder="CVC" defaultValue="123" />
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
        We authorize <span className="font-semibold text-charcoal dark:text-white">{formatCurrency(total)}</span> now and
        only capture after your clean is done. Uncaptured holds are released automatically.
      </p>
    </div>
  );
}

function QuoteCard({ quote, service, level }: { quote: ReturnType<typeof calculateQuote>; service: ServiceType; level: CleaningLevel }) {
  return (
    <aside className="lg:sticky lg:top-40 lg:self-start">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live quote</p>
        <p className="mt-1 text-sm font-medium text-charcoal dark:text-white">{SERVICE_LABELS[service]}</p>
        <p className="mt-4 text-3xl font-extrabold tracking-tight text-charcoal dark:text-white tabular-nums">{formatCurrency(quote.total)}</p>
        <p className="text-xs text-slate-400">{CLEANING_LEVELS.find((l) => l.key === level)?.title}</p>
        <div className="mt-4 space-y-1.5">
          {quote.lineItems.slice(0, 6).map((li, i) => (
            <div key={i} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate pr-2">{li.label}</span>
              <span className="tabular-nums">{formatCurrency(li.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={cn("text-sm", muted ? "text-slate-500 dark:text-slate-400" : "text-slate-600 dark:text-slate-300")}>{label}</span>
      <span className={cn("text-right text-sm tabular-nums", strong ? "font-bold text-charcoal dark:text-white" : "font-medium text-charcoal dark:text-slate-200")}>{value}</span>
    </div>
  );
}
