/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState } from "react";
import {
  MapPin,
  Navigation,
  Home as HomeIcon,
  LogIn,
  Camera,
  Check,
  DollarSign,
  Clock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button, SuccessCheck, CountUp } from "@sweepr/ui";
import { formatCurrency, cn } from "@sweepr/utils";
import { DemoChrome } from "../demo/DemoChrome";

const STEPS = ["Offer", "En route", "Arrived", "Checklist", "Earnings"];

type Phase = "offer" | "accepted" | "en_route" | "arrived" | "checked_in" | "complete" | "earnings";

const PHASE_STEP: Record<Phase, number> = {
  offer: 0,
  accepted: 0,
  en_route: 1,
  arrived: 2,
  checked_in: 3,
  complete: 3,
  earnings: 4,
};

const CHECKLIST = ["Kitchen", "Primary bathroom", "Living room", "Bedrooms"];
const OFFER_SECONDS = 30;
const PAYOUT = 174; // cleaner take-home on a $249 deep clean
const TIP = 37;

export function DayOfServiceFlow() {
  const [phase, setPhase] = useState<Phase>("offer");
  const [secs, setSecs] = useState(OFFER_SECONDS);
  const [checked, setChecked] = useState<string[]>([]);
  const [aafOpen, setAafOpen] = useState(false);
  const [aafSent, setAafSent] = useState(false);

  const reset = () => {
    setPhase("offer");
    setSecs(OFFER_SECONDS);
    setChecked([]);
    setAafOpen(false);
    setAafSent(false);
  };

  // Offer countdown
  useEffect(() => {
    if (phase !== "offer") return;
    if (secs <= 0) return;
    const t = window.setTimeout(() => setSecs((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, secs]);

  const allChecked = checked.length === CHECKLIST.length;

  return (
    <DemoChrome title="Day of service" persona="Cleaner, Jordan Smith" steps={STEPS} current={PHASE_STEP[phase]} onReset={reset}>
      {phase === "offer" && (
        <div className="mx-auto max-w-md py-2 text-center motion-safe:animate-[demo-pop_360ms_cubic-bezier(0.23,1,0.32,1)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">New job offer</p>
          <div className="mx-auto mt-4 flex justify-center"><CountdownRing seconds={secs} total={OFFER_SECONDS} /></div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-charcoal dark:text-white">Deep Clean</p>
              <p className="text-lg font-bold text-seafoam-700 dark:text-seafoam-300">{formatCurrency(PAYOUT)}</p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">742 Evergreen Terrace · 4.2 mi away</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p>3 bd · 2 ba · 1,600 sqft · pets</p>
              <p>Today · 10:00 AM · ~3 hours</p>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <Button variant="ghost" fullWidth onClick={reset}>Decline</Button>
            <Button fullWidth disabled={secs <= 0} onClick={() => setPhase("en_route")}>
              {secs <= 0 ? "Offer expired" : "Accept job"}
            </Button>
          </div>
          {secs <= 0 && <button onClick={reset} className="mt-3 text-sm text-slate-400 hover:text-slate-600">Reset offer</button>}
        </div>
      )}

      {(phase === "en_route" || phase === "accepted") && (
        <PhaseCard
          icon={Navigation}
          title="Head to the job"
          sub="Tap when you're on your way so Alex sees your live status."
          badge="Accepted"
        >
          <MapStrip label="4.2 mi · ~12 min" />
          <Button fullWidth className="mt-4" onClick={() => setPhase("arrived")}>
            <Navigation className="h-4 w-4" /> Start driving (I'm on the way)
          </Button>
        </PhaseCard>
      )}

      {phase === "arrived" && (
        <PhaseCard icon={HomeIcon} title="You've arrived" sub="Confirm arrival, then check in to start the clock and unlock the checklist." badge="On the way">
          <MapStrip label="At 742 Evergreen Terrace" arrived />
          <Button fullWidth className="mt-4" onClick={() => setPhase("checked_in")}>
            <LogIn className="h-4 w-4" /> Check in & start clean
          </Button>
        </PhaseCard>
      )}

      {phase === "checked_in" && (
        <div className="space-y-4">
          <PhaseCard icon={Camera} title="Photo checklist" sub="Snap each area as you finish. Photos protect you and the customer." badge="In progress">
            <ul className="space-y-2">
              {CHECKLIST.map((area) => {
                const on = checked.includes(area);
                return (
                  <li key={area}>
                    <button
                      type="button"
                      onClick={() => setChecked((c) => (on ? c.filter((a) => a !== area) : [...c, area]))}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors [@media(hover:hover)]:active:scale-[0.99]",
                        on ? "border-seafoam-500 bg-seafoam-50 dark:border-seafoam-600 dark:bg-seafoam-950/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", on ? "bg-seafoam-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800")}>
                        {on ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                      </span>
                      <span className="flex-1 text-sm font-medium text-charcoal dark:text-white">{area}</span>
                      <span className="text-xs text-slate-400">{on ? "Photo added" : "Add photo"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PhaseCard>

          {/* Optional add-on / AAF request */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
            {aafSent ? (
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300"><Clock className="h-4 w-4" /> Additional-attention request sent for admin review.</p>
            ) : aafOpen ? (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-charcoal dark:text-white"><AlertTriangle className="h-4 w-4 text-amber-500" /> Scope looks heavier than booked</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Attach 2+ photos and submit. AI reviews confidence, then an admin decides. Money only moves on approval.</p>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex aspect-square items-center justify-center rounded-lg bg-gradient-to-br from-amber-200 to-orange-300"><Camera className="h-4 w-4 text-white/80" /></div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAafOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => { setAafSent(true); setAafOpen(false); }}>Submit request (demo)</Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAafOpen(true)} className="flex w-full items-center gap-2 text-left text-sm font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Request additional attention (optional)
              </button>
            )}
          </div>

          <Button fullWidth disabled={!allChecked} onClick={() => setPhase("complete")}>
            {allChecked ? "Mark clean complete" : `Photograph all ${CHECKLIST.length} areas`}
          </Button>
        </div>
      )}

      {phase === "complete" && (
        <div className="mx-auto max-w-md py-6 text-center motion-safe:animate-[demo-pop_400ms_cubic-bezier(0.23,1,0.32,1)]">
          <div className="flex justify-center"><SuccessCheck size={84} label="Clean complete" /></div>
          <h2 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">Clean complete</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Great work. Alex has been notified and your payout is queued.</p>
          <Button className="mt-6" fullWidth onClick={() => setPhase("earnings")}>
            See earnings <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {phase === "earnings" && (
        <div className="mx-auto max-w-md py-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 motion-safe:animate-[demo-fade_360ms_ease-out]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300"><DollarSign className="h-6 w-6" /></span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Today's earnings</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-charcoal dark:text-white">
              <CountUp value={PAYOUT + TIP} duration={900} format={(n) => formatCurrency(Math.round(n))} />
            </p>
            <div className="mt-5 space-y-2 text-left">
              <ELine label="Job payout" value={PAYOUT} />
              <ELine label="Tip from Alex" value={TIP} accent />
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
              <ELine label="Total" value={PAYOUT + TIP} strong />
            </div>
          </div>
          <Button className="mt-5" variant="ghost" fullWidth onClick={reset}>Back to a fresh offer</Button>
        </div>
      )}
    </DemoChrome>
  );
}

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, seconds / total);
  const urgent = seconds <= 8;
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 104 104" className="h-32 w-32 -rotate-90">
        <circle cx="52" cy="52" r={r} fill="none" strokeWidth="7" className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx="52" cy="52" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-1000 ease-linear", urgent ? "stroke-red-500" : "stroke-seafoam-500")}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-extrabold tabular-nums", urgent ? "text-red-500" : "text-charcoal dark:text-white")}>{Math.max(0, seconds)}</span>
        <span className="text-[11px] font-medium text-slate-400">seconds</span>
      </div>
    </div>
  );
}

function PhaseCard({ icon: Icon, title, sub, badge, children }: { icon: typeof MapPin; title: string; sub: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md motion-safe:animate-[demo-fade_300ms_ease-out]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300"><Icon className="h-5 w-5" /></span>
        <div className="flex-1">
          <p className="text-base font-bold text-charcoal dark:text-white">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{badge}</span>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">{children}</div>
    </div>
  );
}

function MapStrip({ label, arrived }: { label: string; arrived?: boolean }) {
  return (
    <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-seafoam-50 to-emerald-100 dark:from-slate-800 dark:to-slate-900">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(0deg, transparent 24%, rgba(0,0,0,.05) 25%, transparent 26%), linear-gradient(90deg, transparent 24%, rgba(0,0,0,.05) 25%, transparent 26%)", backgroundSize: "22px 22px" }} />
      <span className={cn("relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg", arrived ? "bg-emerald-600" : "bg-seafoam-600")}>
        {arrived ? <HomeIcon className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
      </span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-medium text-charcoal backdrop-blur">{label}</span>
    </div>
  );
}

function ELine({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm", accent ? "text-rose-500" : "text-slate-500 dark:text-slate-400")}>{label}</span>
      <span className={cn("text-sm tabular-nums", strong ? "font-bold text-charcoal dark:text-white" : accent ? "font-medium text-rose-500" : "font-medium text-charcoal dark:text-slate-200")}>{formatCurrency(value)}</span>
    </div>
  );
}
