/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import {
  UserPlus,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Check,
  type LucideIcon,
} from "lucide-react";
import { SweeprLogo } from "@sweepr/ui";
import { Reveal } from "./Reveal";

/**
 * "How Sweepr works" — an interactive route-map. Visitors travel a winding
 * road from booking to sparkle; a moving marker tracks progress and each stop
 * reveals what happens and (where applicable) the trusted partner powering it.
 * Steps Sweepr handles itself credit the in-house team instead of a vendor.
 *
 * Partner logos load live from each partner's OWN domain (never stored by us)
 * so a rebrand flows through automatically; each falls back gracefully.
 */

interface Partner {
  name: string;
  role: string;
  why: string;
  href: string;
  logo: string; // square favicon on the partner's own domain
  wordmark?: string; // full wordmark (includes brand name) on their own domain
  wordmarkDark?: boolean; // wordmark is light/white → needs a dark chip
}

const CLERK: Partner = {
  name: "Clerk",
  role: "Sign-in & account security",
  why: "Bank-grade authentication trusted by thousands of companies — protected with modern security and multi-factor sign-in.",
  href: "https://clerk.com",
  logo: "https://clerk.com/favicon.ico",
  wordmark: "https://clerk.com/v2/downloads/logotype-full-primary.svg",
};
const STRIPE: Partner = {
  name: "Stripe",
  role: "Payments & tips",
  why: "The payments platform behind millions of businesses worldwide. Card details are encrypted and never touch Sweepr's servers.",
  href: "https://stripe.com",
  logo: "https://stripe.com/favicon.ico",
};
const YARDSTIK: Partner = {
  name: "Yardstik",
  role: "Cleaner background checks",
  why: "A specialist in vetting the services workforce. Every cleaner clears an accredited, FCRA-compliant background check before accepting a job.",
  href: "https://www.yardstik.com",
  logo: "https://www.yardstik.com/favicon.ico",
  wordmark: "https://yardstik.com/wp-content/uploads/2026/02/YS-Trust-Reimagined.png",
  wordmarkDark: true,
};
const DIDIT: Partner = {
  name: "Didit",
  role: "Identity verification",
  why: "Confirms every cleaner is a real, verified person via government-ID and biometric checks — so the pro at your door is exactly who they say they are.",
  href: "https://didit.me",
  logo: "https://didit.me/favicon.ico",
};
const POSTHOG: Partner = {
  name: "PostHog",
  role: "Product analytics & safety monitoring",
  why: "Privacy-first analytics that help us spot issues, improve the experience, and keep the platform running smoothly and safely.",
  href: "https://posthog.com",
  logo: "https://posthog.com/favicon.ico",
  wordmark: "https://posthog.com/brand/posthog-logo-stacked.png",
};
const SENTRY: Partner = {
  name: "Sentry",
  role: "Reliability & error monitoring",
  why: "Watches for problems in real time so our team can catch and fix issues fast — keeping every booking dependable.",
  href: "https://sentry.io",
  logo: "https://sentry.io/favicon.ico",
};
const SAFETY: Partner[] = [POSTHOG, SENTRY];

interface Step {
  icon: LucideIcon;
  label: string; // short label on the map node
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  partners: Partner[]; // empty ⇒ handled in-house by Sweepr
  /** map node position (percent of the map panel) */
  x: number;
  y: number;
}

const STEPS: Step[] = [
  {
    icon: UserPlus,
    label: "Create account",
    eyebrow: "Start here",
    title: "Create your account",
    body: "Set up your Sweepr profile in seconds so your bookings, home details, preferences, and receipts stay together in one secure place.",
    points: [
      "Fast sign-in with modern account security",
      "Save addresses and cleaning preferences",
      "Return anytime to manage upcoming cleanings",
    ],
    partners: [CLERK],
    x: 11.5,
    y: 84.7,
  },
  {
    icon: ClipboardCheck,
    label: "Quote & book",
    eyebrow: "Build your cleaning",
    title: "Get an upfront quote",
    body: "Tell us about your home, choose the cleaning package that fits, and add only the extras you need. Your all-in price is shown before you confirm — no haggling, no callbacks.",
    points: [
      "Clear package scope before checkout",
      "Add-ons only appear when not already included",
      "No negotiating or waiting for a quote",
    ],
    partners: [],
    x: 39.1,
    y: 71.5,
  },
  {
    icon: ShieldCheck,
    label: "Verified match",
    eyebrow: "Trust checkpoint",
    title: "We verify & match your cleaner",
    body: "This is where trust is earned. Every eligible cleaner completes identity verification and an accredited background check before they can ever accept your job.",
    points: [
      "Government-ID and biometric identity verification",
      "FCRA-compliant background screening",
      "Matched on availability, area, and service fit",
    ],
    partners: [YARDSTIK, DIDIT],
    x: 28.8,
    y: 40.3,
  },
  {
    icon: Sparkles,
    label: "Clean day",
    eyebrow: "Clean day",
    title: "Follow the clean in real time",
    body: "Your matched pro checks in, follows the exact scope you selected, and documents progress with before-and-after photos so you stay informed — even when you're away.",
    points: [
      "Arrival and progress notifications",
      "Before-and-after photo documentation",
      "Secure in-app communication and support",
    ],
    partners: [],
    x: 67.3,
    y: 48.6,
  },
  {
    icon: CreditCard,
    label: "Pay & review",
    eyebrow: "You're all set",
    title: "Pay only after — then tip & review",
    body: "You're charged only once the job is done. Add an optional tip and leave a review right from your Sweepr account — payments handled by the platform trusted by millions of businesses.",
    points: [
      "Secure payment, completed after the job",
      "Optional tips go 100% to your cleaner",
      "Your feedback keeps marketplace quality high",
    ],
    partners: [STRIPE],
    x: 84.6,
    y: 15.3,
  },
];

// Winding road drawn in a 780×720 space, stretched to fill the panel.
const ROUTE_D =
  "M90 610 C210 690 360 625 305 515 C255 415 140 425 225 290 C300 170 450 255 525 350 C615 455 720 315 660 110";

function PartnerLogoImg({ partner, className }: { partner: Partner; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={`flex items-center justify-center text-sm font-bold text-slate-500 ${className ?? ""}`}>
        {partner.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={partner.logo}
      alt={`${partner.name} logo`}
      width={24}
      height={24}
      loading="lazy"
      className={`object-contain ${className ?? ""}`}
      onError={() => setFailed(true)}
    />
  );
}

function WordmarkImg({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(false);
  if (failed || !partner.wordmark) {
    return (
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-600">
          <PartnerLogoImg partner={partner} className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold text-charcoal dark:text-white">{partner.name}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 ring-1 ${
        partner.wordmarkDark ? "bg-slate-900 ring-slate-700" : "bg-white ring-slate-200"
      }`}
    >
      <img
        src={partner.wordmark}
        alt={`${partner.name} logo`}
        loading="lazy"
        className="h-7 w-auto max-w-[150px] object-contain object-left"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  return (
    <a
      href={partner.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600"
    >
      {partner.wordmark ? (
        <>
          <span className="flex h-9 items-center">
            <WordmarkImg partner={partner} />
          </span>
          <span className="text-[11px] font-semibold text-seafoam-700 dark:text-seafoam-300">
            {partner.role}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-600">
            <PartnerLogoImg partner={partner} className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-charcoal dark:text-white">{partner.name}</span>
            <span className="block text-[11px] font-semibold text-seafoam-700 dark:text-seafoam-300">
              {partner.role}
            </span>
          </span>
        </span>
      )}
      <span className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{partner.why}</span>
    </a>
  );
}

export function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const [swapKey, setSwapKey] = useState(0);
  const step = STEPS[active];
  const StepIcon = step.icon;

  const progressRef = useRef<SVGPathElement>(null);
  const highlightRef = useRef<SVGPathElement>(null);
  const travelerRef = useRef<SVGGElement>(null);
  const lenRef = useRef(0);

  // Animate the road fill + traveler along the path whenever `active` changes.
  useEffect(() => {
    const prog = progressRef.current;
    const hl = highlightRef.current;
    const trav = travelerRef.current;
    if (!prog || !hl || !trav) return;
    if (!lenRef.current) {
      lenRef.current = prog.getTotalLength();
      for (const p of [prog, hl]) {
        p.style.strokeDasharray = `${lenRef.current} ${lenRef.current}`;
        p.style.strokeDashoffset = String(lenRef.current);
      }
    }
    const len = lenRef.current;
    const t = STEPS.length === 1 ? 1 : active / (STEPS.length - 1);
    const offset = len * (1 - t);
    prog.style.strokeDashoffset = String(offset);
    hl.style.strokeDashoffset = String(offset);
    const pt = prog.getPointAtLength(len * t);
    trav.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
  }, [active]);

  const go = (i: number) => {
    setActive(Math.max(0, Math.min(STEPS.length - 1, i)));
    setSwapKey((k) => k + 1);
  };

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
      <Reveal className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-seafoam-700">How Sweepr works</p>
        <h2 className="mt-2 text-3xl font-black text-charcoal dark:text-white sm:text-4xl">
          Follow the path to a cleaner home
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          A guided journey from booking to spotless — every stop shows exactly what
          happens next, and the trusted partners behind the moments that matter.
        </p>
      </Reveal>

      <Reveal className="mt-12">
        <div className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-[1.7fr_0.85fr]">
          {/* ── Map panel ─────────────────────────────────────────────── */}
          <div className="relative min-h-[560px] overflow-hidden border-b border-slate-200 bg-gradient-to-br from-seafoam-50/60 via-white to-slate-50 dark:border-slate-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 lg:border-b-0 lg:border-r">
            {/* kicker */}
            <span className="absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-xl border border-seafoam-600/20 bg-white/80 px-3 py-2 text-xs font-extrabold text-seafoam-800 shadow-sm backdrop-blur dark:bg-slate-800/80 dark:text-seafoam-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Your cleaning journey
            </span>

            {/* route */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 780 720"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={ROUTE_D}
                className="fill-none stroke-black/5"
                strokeWidth={32}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(0 7)"
              />
              <path
                d={ROUTE_D}
                className="fill-none stroke-seafoam-100 dark:stroke-slate-700"
                strokeWidth={27}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                ref={progressRef}
                d={ROUTE_D}
                className="fill-none stroke-seafoam-600"
                strokeWidth={27}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke-dashoffset .85s cubic-bezier(.22,1,.36,1)" }}
              />
              <path
                ref={highlightRef}
                d={ROUTE_D}
                className="fill-none stroke-white/30"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke-dashoffset .85s cubic-bezier(.22,1,.36,1)" }}
              />
              <path
                d={ROUTE_D}
                className="fill-none stroke-white/80"
                strokeWidth={3}
                strokeDasharray="2 15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g ref={travelerRef} transform="translate(90 610)">
                <circle
                  r={14}
                  className="fill-white stroke-seafoam-600"
                  strokeWidth={4}
                  style={{ filter: "drop-shadow(0 8px 10px rgba(15,118,110,.26))" }}
                />
                <circle r={5} className="fill-seafoam-600" />
              </g>
            </svg>

            {/* destination house */}
            <span
              className="pointer-events-none absolute z-[2]"
              style={{ left: "84.6%", top: "15.3%", width: 92, height: 76, transform: "translate(-50%,-86%)" }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 110 88" className="h-full w-full overflow-visible">
                <path d="M90 9l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" className="fill-seafoam-400 [animation:sweepr-sparkle_2.4s_ease-in-out_infinite]" style={{ transformOrigin: "center" }} />
                <path d="M24 40L55 18l31 22v36H24V40z" className="fill-white stroke-slate-300" strokeWidth={2} />
                <path d="M16 42L55 12l39 30-7 7-32-24-32 24-7-7z" className="fill-seafoam-700" />
                <rect x="47" y="51" width="16" height="25" rx="3" className="fill-seafoam-100" />
                <rect x="69" y="48" width="10" height="10" rx="2" className="fill-[#fff7d6] stroke-slate-300" strokeWidth={1.3} />
                <rect x="31" y="48" width="10" height="10" rx="2" className="fill-[#fff7d6] stroke-slate-300" strokeWidth={1.3} />
              </svg>
            </span>

            {/* step nodes */}
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === active;
              const isPassed = i < active;
              return (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 focus-visible:outline-none"
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                >
                  <span
                    className={`relative grid h-14 w-14 place-items-center rounded-[1.1rem] border-[3px] border-white transition-all duration-200 dark:border-slate-900 ${
                      isActive
                        ? "scale-110 bg-seafoam-700 text-white shadow-[0_17px_36px_rgba(15,118,110,.29),0_0_0_7px_rgba(153,246,228,.5)]"
                        : isPassed
                          ? "bg-seafoam-600 text-white shadow-lg"
                          : "bg-white text-slate-500 shadow-md hover:-translate-y-0.5 hover:text-seafoam-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    <span
                      className={`absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[11px] font-black text-white dark:border-slate-900 ${
                        isActive ? "bg-charcoal" : isPassed ? "bg-seafoam-800" : "bg-slate-700"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </span>
                  <span
                    className={`max-w-[8rem] rounded-lg border bg-white/85 px-2.5 py-1.5 text-center text-[11px] font-extrabold leading-tight shadow-sm backdrop-blur transition-colors dark:bg-slate-800/85 ${
                      isActive
                        ? "border-seafoam-300 text-seafoam-800 dark:text-seafoam-300"
                        : "border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel ──────────────────────────────────────────── */}
          <aside className="flex min-w-0 flex-col bg-white dark:bg-slate-900" aria-live="polite">
            <div className="border-b border-slate-200 px-7 pb-5 pt-7 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
                  {step.eyebrow}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {active + 1} of {STEPS.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span
                  className="block h-full rounded-full bg-seafoam-600 transition-all duration-500 ease-out"
                  style={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            <div key={swapKey} className="flex flex-1 flex-col px-7 pb-7 pt-6 [animation:sweepr-fadeswap_.34s_ease_both]">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-seafoam-100 bg-seafoam-50 text-seafoam-700 dark:border-slate-700 dark:bg-slate-800 dark:text-seafoam-300">
                <StepIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-2xl font-black leading-tight tracking-tight text-charcoal dark:text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>

              <ul className="mt-5 grid gap-2.5">
                {step.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                    <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              {/* partner tie-in / in-house */}
              <div className="mt-auto pt-6">
                {step.partners.length > 0 ? (
                  <>
                    <p className="mb-2.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Powered by trusted partners
                    </p>
                    <div className="grid gap-2.5">
                      {step.partners.map((p) => (
                        <PartnerCard key={p.name} partner={p} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-seafoam-200 bg-seafoam-50/60 p-4 dark:border-seafoam-800/50 dark:bg-seafoam-900/20">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 items-center justify-center rounded-xl bg-white px-3 ring-1 ring-slate-200 dark:ring-slate-600">
                        <SweeprLogo size="sm" className="h-6" />
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
                        We handle this part
                      </span>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                      The Sweepr development team has spent thousands of hours curating
                      this part of the experience for you!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* controls */}
            <div className="grid grid-cols-[3rem_1fr_3rem] gap-2.5 border-t border-slate-200 px-6 pb-6 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => go(active - 1)}
                disabled={active === 0}
                aria-label="Previous step"
                className="grid h-12 place-items-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:border-seafoam-300 hover:text-seafoam-800 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              {active < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => go(active + 1)}
                  className="h-12 rounded-xl bg-seafoam-700 font-extrabold text-white shadow-md transition-colors hover:bg-seafoam-800"
                >
                  Next stop
                </button>
              ) : (
                <a
                  href="#pricing"
                  className="grid h-12 place-items-center rounded-xl bg-seafoam-700 font-extrabold text-white shadow-md transition-colors hover:bg-seafoam-800"
                >
                  Book a cleaning
                </a>
              )}
              <button
                type="button"
                onClick={() => go(STEPS.length - 1)}
                disabled={active === STEPS.length - 1}
                aria-label="Go to final step"
                className="grid h-12 place-items-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:border-seafoam-300 hover:text-seafoam-800 disabled:opacity-35 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </aside>
        </div>

        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-500">
          <Sparkles className="h-4 w-4 text-seafoam-700" aria-hidden="true" />
          Select any stop on the path to explore the booking journey.
        </p>
      </Reveal>

      {/* Persistent safety layer */}
      <Reveal className="mt-8 rounded-3xl border border-slate-200 bg-white/70 p-7 dark:border-slate-700 dark:bg-slate-900/40 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-seafoam-700">Always on</p>
        <h3 className="mt-1 text-lg font-black text-charcoal dark:text-white">
          Safety &amp; reliability, monitored around the clock
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Behind every booking, these partners help us watch for issues and keep the
          platform safe and dependable. See our full list of{" "}
          <a
            href="https://legal.getsweepr.com/subprocessors"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-seafoam-700 underline hover:text-seafoam-800 dark:text-seafoam-300"
          >
            subprocessors
          </a>
          .
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SAFETY.map((p) => (
            <PartnerCard key={p.name} partner={p} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
