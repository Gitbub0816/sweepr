import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ShieldCheck,
  Upload,
  IdCard,
} from "lucide-react";
import {
  Card,
  Input,
  Select,
  Textarea,
  Button,
  AddOnGrid,
  ThemeToggle,
  SweeprLogo,
  useReducedMotion,
  SMSOptIn,
  toast,
  track,
  Events,
} from "@sweepr/ui";
import type { ServiceType, AddOn } from "@sweepr/types";
import { SERVICE_LABELS, ADD_ONS, formatCurrency } from "@sweepr/utils";
import { ServiceAreaMap } from "../components/ServiceAreaMap";
import {
  BusinessVerificationStep,
  type BusinessVerificationValue,
} from "./onboarding/BusinessVerificationStep";
import {
  AuthorizedRepStep,
  type AuthorizedRepValue,
} from "./onboarding/AuthorizedRepStep";
import { BackgroundCheckStep } from "./onboarding/BackgroundCheckStep";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type OnboardingMode = "individual" | "business";

const INDIVIDUAL_STEPS = [
  "Basics",
  "Service Area",
  "Services & Pricing",
  "Background Check",
  "Identity",
  "Review",
];

const BUSINESS_STEPS = [
  "Business Info",
  "Service Area",
  "Services & Pricing",
  "Business Verification",
  "Authorized Rep",
  "Background Check",
  "Identity",
  "Review",
];

const BUSINESS_TYPES = [
  { value: "llc", label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "sole_prop", label: "Sole Proprietorship" },
  { value: "partnership", label: "Partnership" },
];

const SERVICE_TYPES: ServiceType[] = [
  "standard",
  "deep",
  "move_in_out",
  "recurring",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type DayAvail = "unavailable" | "morning" | "afternoon" | "evening" | "all_day";
const AVAIL_OPTIONS: { value: DayAvail; label: string }[] = [
  { value: "unavailable", label: "Off" },
  { value: "morning", label: "AM" },
  { value: "afternoon", label: "PM" },
  { value: "evening", label: "Eve" },
  { value: "all_day", label: "All" },
];

// Approximate hours each availability band contributes per day.
const BAND_HOURS: Record<DayAvail, number> = {
  unavailable: 0,
  morning: 4,
  afternoon: 4,
  evening: 3,
  all_day: 9,
};

interface FormState {
  fullName: string;
  phone: string;
  avatarUrl: string;
  bio: string;
  experience: string;
  basedIn: string;
  radiusMi: number;
  center: [number, number];
  services: ServiceType[];
  addOns: string[];
  availability: Record<string, DayAvail>;
  certifyAccurate: boolean;
  agreeIC: boolean;
  smsOptIn: boolean;
  // Business mode
  businessLegalName: string;
  dba: string;
  businessType: string;
  yearsInBusiness: string;
  businessVerification: BusinessVerificationValue;
  authorizedRep: AuthorizedRepValue;
}

const initialState: FormState = {
  fullName: "",
  phone: "",
  avatarUrl: "",
  bio: "",
  experience: "",
  basedIn: "San Diego, CA",
  radiusMi: 15,
  center: [-117.1611, 32.7157],
  services: ["standard"],
  addOns: [],
  availability: Object.fromEntries(DAYS.map((d) => [d, "unavailable"])),
  certifyAccurate: false,
  agreeIC: false,
  smsOptIn: false,
  businessLegalName: "",
  dba: "",
  businessType: "",
  yearsInBusiness: "",
  businessVerification: {
    ein: "",
    legalName: "",
    stateOfIncorporation: "",
    articlesDoc: "",
    einDoc: "",
    insuranceDoc: "",
  },
  authorizedRep: {
    name: "",
    title: "",
    email: "",
    phone: "",
  },
};

type StatusFlow = "idle" | "submitting" | "submitted" | "pending";

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<OnboardingMode>("individual");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState<FormState>(initialState);

  const STEPS = mode === "business" ? BUSINESS_STEPS : INDIVIDUAL_STEPS;
  const stepName = STEPS[step];

  useEffect(() => {
    track(Events.CLEANER_ONBOARDING_STARTED, { mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(next: OnboardingMode) {
    if (next === mode) return;
    setMode(next);
    setStep(0);
    setDirection(1);
    track(Events.CLEANER_ONBOARDING_STARTED, { mode: next });
  }
  const [checkrStatus, setCheckrStatus] = useState<StatusFlow>("idle");
  const [diditStatus, setDiditStatus] = useState<StatusFlow>("idle");
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const weeklyHours = useMemo(
    () =>
      Object.values(form.availability).reduce(
        (sum, band) => sum + BAND_HOURS[band],
        0
      ),
    [form.availability]
  );

  // Mock earnings estimate: available hours × $35/hr average, 60–95% utilization.
  const earnings = useMemo(() => {
    const low = Math.round(weeklyHours * 35 * 0.6);
    const high = Math.round(weeklyHours * 35 * 0.95);
    return { low, high };
  }, [weeklyHours]);

  const goNext = () => {
    track(Events.CLEANER_ONBOARDING_STEP, { mode, step: stepName });
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const canContinue = (): boolean => {
    switch (stepName) {
      case "Basics":
        return (
          form.fullName.trim().length > 0 &&
          form.phone.trim().length > 0 &&
          form.bio.trim().length >= 50
        );
      case "Business Info":
        return (
          form.businessLegalName.trim().length > 0 &&
          form.businessType.length > 0
        );
      case "Services & Pricing":
        return form.services.length > 0;
      case "Business Verification":
        return (
          /^\d{2}-\d{7}$/.test(form.businessVerification.ein) &&
          form.businessVerification.stateOfIncorporation.length > 0 &&
          Boolean(form.businessVerification.articlesDoc) &&
          Boolean(form.businessVerification.einDoc)
        );
      case "Authorized Rep":
        return (
          form.authorizedRep.name.trim().length > 0 &&
          form.authorizedRep.title.length > 0 &&
          form.authorizedRep.email.trim().length > 0
        );
      case "Background Check":
        // Allow continuing once Checkr invitation was sent (pending = check in progress)
        return checkrStatus === "submitted" || checkrStatus === "pending";
      case "Identity":
        return diditStatus === "submitted";
      case "Review":
        return form.certifyAccurate && form.agreeIC;
      default:
        return true;
    }
  };

  // Background check is now handled entirely within BackgroundCheckStep via
  // the Checkr invitation flow — no PII passes through OnboardingPage.

  async function submitIdentity() {
    setDiditStatus("submitting");
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/cleaners/identity-verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ provider: "didit" }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          stub?: boolean;
        };
        // Live Didit: redirect the applicant to the hosted verification page.
        // All ID capture happens on Didit — no documents touch Sweepr.
        if (data.url && !data.stub) {
          window.location.href = data.url;
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 900));
      setDiditStatus("submitted");
      toast.success("Identity verification submitted for review.");
    } catch {
      setDiditStatus("idle");
      toast.error("Could not submit. Try again.");
    }
  }

  async function submitApplication() {
    setSubmitting(true);
    try {
      if (API_URL && mode === "business") {
        // EIN is NEVER sent here / stored — only ein_provided is recorded.
        await fetch(`${API_URL}/cleaners/business/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName: form.businessLegalName,
            businessType: form.businessType,
            einProvided: true,
            stateOfIncorporation:
              form.businessVerification.stateOfIncorporation,
            authorizedRep: {
              name: form.authorizedRep.name,
              title: form.authorizedRep.title,
              email: form.authorizedRep.email,
            },
            serviceTypes: form.services,
            addOnKeys: form.addOns,
            availability: form.availability,
          }),
        });
      } else if (API_URL) {
        await fetch(`${API_URL}/cleaners/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: form.fullName,
            phone: form.phone,
            bio: form.bio,
            avatarUrl: form.avatarUrl,
            basedIn: form.basedIn,
            radiusMi: form.radiusMi,
            services: form.services,
            addOns: form.addOns,
            availability: form.availability,
          }),
        });
      }
      track(Events.CLEANER_APPLICATION_SUBMITTED, { mode });
      await user?.update({
        unsafeMetadata: { cleanerStatus: "pending_review" },
      });
      toast.success("Application submitted!");
      navigate("/pending");
    } catch {
      toast.error("Something went wrong submitting your application.");
    } finally {
      setSubmitting(false);
    }
  }

  const variants = reduced
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
      };

  return (
    <div className="min-h-screen bg-offwhite pb-28 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SweeprLogo size="md" />
            <span className="text-sm font-medium text-slate-400">Pro</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Mode switcher */}
        <div className="mb-8 flex gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => switchMode("individual")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              mode === "individual"
                ? "bg-seafoam-500 text-white shadow"
                : "text-slate-600 hover:text-charcoal dark:text-slate-300"
            }`}
            aria-pressed={mode === "individual"}
          >
            🧹 I'm a Cleaner
          </button>
          <button
            type="button"
            onClick={() => switchMode("business")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              mode === "business"
                ? "bg-seafoam-500 text-white shadow"
                : "text-slate-600 hover:text-charcoal dark:text-slate-300"
            }`}
            aria-pressed={mode === "business"}
          >
            🏢 I Have a Business
          </button>
        </div>

        {/* Progress */}
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-seafoam-600">{STEPS[step]}</span>
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <motion.div
            className="h-full rounded-full bg-seafoam-500"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: "spring", stiffness: 200, damping: 30 }
            }
          />
        </div>

        <div className="relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduced ? { duration: 0 } : { duration: 0.25 }}
            >
              <Card>
                {stepName === "Basics" && (
                  <StepWelcome form={form} set={set} />
                )}
                {stepName === "Business Info" && (
                  <StepBusinessInfo form={form} set={set} />
                )}
                {stepName === "Service Area" && (
                  <StepArea form={form} set={set} stepNumber={step + 1} />
                )}
                {stepName === "Services & Pricing" && (
                  <StepServices form={form} set={set} stepNumber={step + 1} />
                )}
                {stepName === "Business Verification" && (
                  <BusinessVerificationStep
                    n={step + 1}
                    value={form.businessVerification}
                    onChange={(next) =>
                      set("businessVerification", {
                        ...form.businessVerification,
                        ...next,
                      })
                    }
                  />
                )}
                {stepName === "Authorized Rep" && (
                  <AuthorizedRepStep
                    n={step + 1}
                    value={form.authorizedRep}
                    onChange={(next) =>
                      set("authorizedRep", { ...form.authorizedRep, ...next })
                    }
                  />
                )}
                {stepName === "Background Check" && (
                  <BackgroundCheckStep
                    n={step + 1}
                    workState="CA"
                    getToken={getToken}
                    onComplete={() => {
                      setCheckrStatus("pending");
                      goNext();
                    }}
                  />
                )}
                {stepName === "Identity" && (
                  <StepIdentity
                    status={diditStatus}
                    onSubmit={submitIdentity}
                    stepNumber={step + 1}
                  />
                )}
                {stepName === "Review" && (
                  <StepReview
                    form={form}
                    set={set}
                    earnings={earnings}
                    weeklyHours={weeklyHours}
                    mode={mode}
                    stepNumber={step + 1}
                  />
                )}
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky footer bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === 0}
            aria-label="Previous step"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step === STEPS.length - 1 ? (
            <Button
              onClick={submitApplication}
              loading={submitting}
              disabled={!canContinue()}
            >
              Submit application
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canContinue()}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type SetFn = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

function StepTitle({
  n,
  title,
  subtitle,
}: {
  n: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <span className="text-xs font-semibold uppercase tracking-wide text-seafoam-600">
        Step {n}
      </span>
      <h2 className="mt-1 text-xl font-bold text-charcoal dark:text-white">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function PhotoUpload({
  value,
  onChange,
  label,
  icon,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  icon?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      aria-label={label}
      className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 transition-colors hover:border-seafoam-400 dark:border-slate-700"
    >
      {value ? (
        <span className="flex items-center gap-2 text-seafoam-600">
          <CheckCircle2 className="h-5 w-5" /> {label} added
        </span>
      ) : (
        <>
          {icon ?? <Upload className="h-5 w-5" />}
          {label}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(URL.createObjectURL(file));
        }}
      />
    </button>
  );
}

function StepWelcome({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <div className="space-y-4">
      <StepTitle n={1} title="Welcome to Sweepr" subtitle="Tell us about yourself." />
      <div className="flex flex-col items-center gap-3">
        {form.avatarUrl ? (
          <img
            src={form.avatarUrl}
            alt="Profile preview"
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Camera className="h-7 w-7" />
          </div>
        )}
        <PhotoUpload
          value={form.avatarUrl}
          onChange={(url) => set("avatarUrl", url)}
          label="Upload profile photo"
        />
      </div>
      <Input
        label="Full name"
        value={form.fullName}
        onChange={(e) => set("fullName", e.target.value)}
        placeholder="Alex Lee"
      />
      <Input
        label="Phone number"
        value={form.phone}
        onChange={(e) => set("phone", e.target.value)}
        placeholder="(555) 123-4567"
      />
      <Textarea
        label="About you"
        value={form.bio}
        onChange={(e) => set("bio", e.target.value)}
        placeholder="Share a little about your cleaning style and what customers can expect."
        maxLength={500}
      />
      <p className="-mt-2 text-xs text-slate-400">
        {form.bio.length}/500 — minimum 50 characters
      </p>
      <Textarea
        label="Professional experience"
        value={form.experience}
        onChange={(e) => set("experience", e.target.value)}
        placeholder="How long have you been cleaning? Any certifications?"
      />
      <SMSOptIn
        value={form.smsOptIn}
        onChange={(v) => set("smsOptIn", v)}
        phone={form.phone}
      />
    </div>
  );
}

function StepBusinessInfo({ form, set }: { form: FormState; set: SetFn }) {
  return (
    <div className="space-y-4">
      <StepTitle
        n={1}
        title="Business information"
        subtitle="Tell us about your cleaning business."
      />
      <Input
        label="Legal business name"
        value={form.businessLegalName}
        onChange={(e) => set("businessLegalName", e.target.value)}
        placeholder="Sparkle Clean LLC"
      />
      <Input
        label="DBA (if any)"
        value={form.dba}
        onChange={(e) => set("dba", e.target.value)}
        placeholder="Doing-business-as name"
        hint="Optional"
      />
      <Select
        label="Business type"
        placeholder="Select a business type"
        options={BUSINESS_TYPES}
        value={form.businessType}
        onChange={(e) => set("businessType", e.target.value)}
      />
      <Input
        label="EIN"
        value="Provided in the verification step"
        readOnly
        disabled
        hint="You'll enter your EIN securely during Business Verification."
      />
      <Input
        label="Years in business"
        type="number"
        min={0}
        value={form.yearsInBusiness}
        onChange={(e) => set("yearsInBusiness", e.target.value)}
        placeholder="3"
      />
      <SMSOptIn
        value={form.smsOptIn}
        onChange={(v) => set("smsOptIn", v)}
        phone={form.phone}
      />
    </div>
  );
}

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  "";

async function geocodeCity(query: string): Promise<[number, number] | null> {
  if (!query.trim()) return null;
  try {
    if (MAPBOX_TOKEN) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=place,region,locality&limit=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { features?: Array<{ center: [number, number] }> };
        const coords = data.features?.[0]?.center;
        if (coords) return [coords[0], coords[1]];
      }
    }
    // Fallback: OpenStreetMap Nominatim (no API key required)
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lon: string; lat: string }>;
    if (data[0]) return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    return null;
  } catch {
    return null;
  }
}

function StepArea({
  form,
  set,
  stepNumber,
}: {
  form: FormState;
  set: SetFn;
  stepNumber: number;
}) {
  const [geocoding, setGeocoding] = useState(false);

  async function handleBasedInBlur() {
    if (!form.basedIn.trim()) return;
    setGeocoding(true);
    const coords = await geocodeCity(form.basedIn);
    setGeocoding(false);
    if (coords) set("center", coords);
  }

  return (
    <div className="space-y-4">
      <StepTitle
        n={stepNumber}
        title="Your service area"
        subtitle="Set how far you're willing to travel."
      />
      <ServiceAreaMap center={form.center} radiusMi={form.radiusMi} />
      <div>
        <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
          Service radius: {form.radiusMi} miles
        </label>
        <input
          type="range"
          min={5}
          max={50}
          value={form.radiusMi}
          onChange={(e) => set("radiusMi", Number(e.target.value))}
          aria-label="Service radius in miles"
          className="w-full accent-seafoam-500"
        />
      </div>
      <div className="relative">
        <Input
          label="Based in"
          value={form.basedIn}
          onChange={(e) => set("basedIn", e.target.value)}
          onBlur={handleBasedInBlur}
          placeholder="City, State"
        />
        {geocoding && (
          <span className="absolute right-3 top-9 text-xs text-slate-400">Locating…</span>
        )}
      </div>
    </div>
  );
}

function StepServices({
  form,
  set,
  stepNumber,
}: {
  form: FormState;
  set: SetFn;
  stepNumber: number;
}) {
  const toggleService = (t: ServiceType) =>
    set(
      "services",
      form.services.includes(t)
        ? form.services.filter((x) => x !== t)
        : [...form.services, t]
    );
  const toggleAddOn = (key: string) =>
    set(
      "addOns",
      form.addOns.includes(key)
        ? form.addOns.filter((x) => x !== key)
        : [...form.addOns, key]
    );
  return (
    <div className="space-y-6">
      <StepTitle n={stepNumber} title="Services & pricing" subtitle="What can you offer?" />
      <div>
        <p className="mb-3 text-sm font-medium text-charcoal dark:text-slate-200">
          Services you offer
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SERVICE_TYPES.map((t) => {
            const active = form.services.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleService(t)}
                className={`rounded-xl border p-3 text-left text-sm font-medium transition-all ${
                  active
                    ? "border-seafoam-400 bg-seafoam-50 text-seafoam-700 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20"
                    : "border-slate-200 text-charcoal hover:border-seafoam-300 dark:border-slate-700 dark:text-white"
                }`}
              >
                {SERVICE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-3 text-sm font-medium text-charcoal dark:text-slate-200">
          Add-ons you can do
        </p>
        <AddOnGrid
          addOns={ADD_ONS as AddOn[]}
          selected={form.addOns}
          onToggle={toggleAddOn}
        />
      </div>
      <div>
        <p className="mb-3 text-sm font-medium text-charcoal dark:text-slate-200">
          Weekly availability
        </p>
        <div className="space-y-2">
          {DAYS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-10 text-sm font-medium text-slate-500">{d}</span>
              <div className="flex flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {AVAIL_OPTIONS.map((opt) => {
                  const active = form.availability[d] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        set("availability", {
                          ...form.availability,
                          [d]: opt.value,
                        })
                      }
                      className={`flex-1 px-1 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "bg-seafoam-500 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// StepBackground removed — background check is now handled by BackgroundCheckStep
// (Checkr native invitation flow). No PII is collected by Sweepr.

function StepIdentity({
  status,
  onSubmit,
  stepNumber,
}: {
  status: StatusFlow;
  onSubmit: () => void;
  stepNumber: number;
}) {
  return (
    <div className="space-y-4">
      <StepTitle
        n={stepNumber}
        title="Identity verification"
        subtitle="We partner with Didit to verify your identity."
      />
      <div className="flex items-start gap-3 rounded-xl bg-seafoam-50 p-4 text-sm text-seafoam-800 dark:bg-seafoam-900/20 dark:text-seafoam-200">
        <IdCard className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          You'll be redirected to Didit's secure portal to verify your
          government-issued ID. The process takes about 2 minutes. Sweepr never
          sees or stores your ID images.
        </p>
      </div>
      {status === "submitted" ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" /> Identity verification submitted.
        </div>
      ) : (
        <Button
          fullWidth
          onClick={onSubmit}
          loading={status === "submitting"}
        >
          Start identity verification →
        </Button>
      )}
    </div>
  );
}

function StepReview({
  form,
  set,
  earnings,
  weeklyHours,
  mode,
  stepNumber,
}: {
  form: FormState;
  set: SetFn;
  earnings: { low: number; high: number };
  weeklyHours: number;
  mode: OnboardingMode;
  stepNumber: number;
}) {
  return (
    <div className="space-y-5">
      <StepTitle
        n={stepNumber}
        title="Review & submit"
        subtitle="Almost done — review your details."
      />

      <div className="rounded-xl bg-gradient-to-br from-seafoam-500 to-seafoam-600 p-5 text-white">
        <p className="text-sm opacity-90">Estimated weekly earnings</p>
        <p className="mt-1 text-3xl font-bold">
          {formatCurrency(earnings.low)}–{formatCurrency(earnings.high)}
        </p>
        <p className="mt-1 text-xs opacity-80">
          Based on ~{weeklyHours} available hours/week at an average of $35/hr.
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        {mode === "business" ? (
          <>
            <Row label="Business" value={form.businessLegalName || "—"} />
            <Row
              label="Business type"
              value={
                BUSINESS_TYPES.find((t) => t.value === form.businessType)
                  ?.label || "—"
              }
            />
            <Row
              label="State of incorporation"
              value={form.businessVerification.stateOfIncorporation || "—"}
            />
            <Row label="EIN" value={form.businessVerification.ein ? "Provided" : "—"} />
            <Row label="Authorized rep" value={form.authorizedRep.name || "—"} />
          </>
        ) : (
          <>
            <Row label="Name" value={form.fullName || "—"} />
            <Row label="Phone" value={form.phone || "—"} />
          </>
        )}
        <Row label="Based in" value={form.basedIn} />
        <Row label="Service radius" value={`${form.radiusMi} mi`} />
        <Row
          label="Services"
          value={form.services.map((s) => SERVICE_LABELS[s]).join(", ") || "—"}
        />
        <Row
          label="Add-ons"
          value={form.addOns.length ? `${form.addOns.length} selected` : "None"}
        />
      </dl>

      <label className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.agreeIC}
          onChange={(e) => set("agreeIC", e.target.checked)}
          className="mt-1 accent-seafoam-500"
        />
        <span>
          I confirm I am an independent contractor and agree to the{" "}
          <a
            href="/independent-contractor"
            className="font-medium text-seafoam-600 underline"
          >
            Sweepr Independent Contractor Agreement
          </a>
          .
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.certifyAccurate}
          onChange={(e) => set("certifyAccurate", e.target.checked)}
          className="mt-1 accent-seafoam-500"
        />
        <span>I certify all information provided is accurate and complete.</span>
      </label>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-800">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-charcoal dark:text-white">
        {value}
      </dd>
    </div>
  );
}
