/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState } from "react";
import {
  UserPlus,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  CreditCard,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * "How Sweepr works" — a prominent, interactive journey roadmap that lives
 * beneath the coverage map. Visitors click along the road to walk the booking
 * journey; each stop reveals what happens and the best-in-class partner that
 * powers it. A persistent "safety layer" credits the monitoring partners.
 *
 * Partner logos load live from each partner's OWN domain (never stored by us),
 * so a rebrand on their side flows through automatically; each falls back to a
 * lettered chip if the remote asset fails.
 */

interface Partner {
  name: string;
  role: string;
  why: string;
  href: string;
  /** Square brand mark (favicon) served from the partner's own domain. */
  logo: string;
  /**
   * Optional full wordmark logo (includes the brand name) served from the
   * partner's own domain. When present it replaces the mark+name row.
   */
  wordmark?: string;
  /** Wordmark is light/white and needs a dark chip to be legible. */
  wordmarkDark?: boolean;
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

interface Stop {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  partners: Partner[];
}

const STOPS: Stop[] = [
  {
    icon: UserPlus,
    label: "Sign up",
    title: "Create your account",
    body: "Set up your Sweepr account in seconds. Your identity and login are protected from the very first tap so your details stay yours.",
    partners: [CLERK],
  },
  {
    icon: ClipboardCheck,
    label: "Quote & book",
    title: "Get your upfront quote",
    body: "Pick your package and add-ons and see a clear, all-in price before you commit — no haggling, no surprise fees. Choose a time that works and confirm.",
    partners: [],
  },
  {
    icon: ShieldCheck,
    title: "We verify & match your cleaner",
    label: "Verified match",
    body: "This is where trust is earned. Every cleaner passes an accredited background check and a government-ID + biometric identity verification before they can ever accept your job.",
    partners: [YARDSTIK, DIDIT],
  },
  {
    icon: Sparkles,
    label: "Clean day",
    title: "Your cleaner arrives",
    body: "Your matched pro checks in, cleans to the exact scope you chose, and shares before-and-after photos so you can see the results — even if you're not home.",
    partners: [],
  },
  {
    icon: CreditCard,
    label: "Pay & review",
    title: "Pay only after — then tip & review",
    body: "You're charged only once the job is done. Add a tip and leave a review right from your account. Payments are handled by the same platform trusted by millions of businesses.",
    partners: [STRIPE],
  },
];

const SAFETY: Partner[] = [POSTHOG, SENTRY];

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
    // Fallback to mark + name if the wordmark fails to load.
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
      className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600"
    >
      {partner.wordmark ? (
        <>
          <span className="flex h-9 items-center">
            <WordmarkImg partner={partner} />
          </span>
          <span className="text-xs font-semibold text-seafoam-700 dark:text-seafoam-300">
            {partner.role}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-600">
            <PartnerLogoImg partner={partner} className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-charcoal dark:text-white">{partner.name}</span>
            <span className="block text-xs font-semibold text-seafoam-700 dark:text-seafoam-300">
              {partner.role}
            </span>
          </span>
        </span>
      )}
      <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{partner.why}</span>
    </a>
  );
}

export function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const stop = STOPS[active];
  const StopIcon = stop.icon;
  const progressPct = (active / (STOPS.length - 1)) * 100;

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
      <Reveal className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-seafoam-700">Behind the scenes</p>
        <h2 className="mt-2 text-3xl font-black text-charcoal dark:text-white sm:text-4xl">
          How Sweepr works
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          Follow the journey from quote to sparkle — and meet the trusted partners
          we lean on for the things that matter most.
        </p>
      </Reveal>

      {/* Interactive roadmap */}
      <Reveal className="mt-12">
        <div className="relative">
          {/* Road */}
          <div className="absolute left-4 right-4 top-6 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div
            className="absolute left-4 top-6 h-1 rounded-full bg-seafoam-500 transition-all duration-500 ease-out"
            style={{ width: `calc((100% - 2rem) * ${progressPct / 100})` }}
          />
          <ol className="relative flex justify-between">
            {STOPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === active;
              const isDone = i < active;
              return (
                <li key={s.title} className="flex min-w-0 flex-1 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-pressed={isActive}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 bg-white transition-all dark:bg-slate-900 ${
                      isActive
                        ? "scale-110 border-seafoam-500 text-seafoam-700 shadow-lg shadow-seafoam-500/20 dark:text-seafoam-300"
                        : isDone
                          ? "border-seafoam-500 bg-seafoam-500 text-white dark:bg-seafoam-600 dark:border-seafoam-600"
                          : "border-slate-300 text-slate-400 hover:border-seafoam-300 hover:text-seafoam-600 dark:border-slate-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span
                    className={`mt-2 hidden text-center text-[11px] font-semibold sm:block ${
                      isActive ? "text-seafoam-700 dark:text-seafoam-300" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Detail panel */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            {/* Left: step story */}
            <div className="border-b border-slate-100 p-7 dark:border-slate-800 md:border-b-0 md:border-r sm:p-9">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-seafoam-700 text-white">
                  <StopIcon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-seafoam-700">
                    Step {active + 1} of {STOPS.length}
                  </p>
                  <h3 className="text-xl font-black text-charcoal dark:text-white">{stop.title}</h3>
                </div>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                {stop.body}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActive((a) => Math.max(0, a - 1))}
                  disabled={active === 0}
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-seafoam-300 hover:text-seafoam-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  Back
                </button>
                {active < STOPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActive((a) => Math.min(STOPS.length - 1, a + 1))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-seafoam-700 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-seafoam-800"
                  >
                    Next step <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="text-sm font-semibold text-seafoam-700 dark:text-seafoam-300">
                    That's the whole journey 🎉
                  </span>
                )}
              </div>
            </div>

            {/* Right: partners powering this step */}
            <div className="bg-slate-50/70 p-7 dark:bg-slate-800/30 sm:p-9">
              {stop.partners.length > 0 ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Powered by trusted partners
                  </p>
                  <div className="mt-4 space-y-3">
                    {stop.partners.map((p) => (
                      <PartnerCard key={p.name} partner={p} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    All Sweepr
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    This step runs on Sweepr's own platform — transparent pricing and
                    real-time updates, built and maintained in-house.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Persistent safety layer */}
      <Reveal className="mt-8 rounded-3xl border border-slate-200 bg-white/70 p-7 dark:border-slate-700 dark:bg-slate-900/40 sm:p-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-seafoam-700">
              Always on
            </p>
            <h3 className="mt-1 text-lg font-black text-charcoal dark:text-white">
              Safety &amp; reliability, monitored around the clock
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Behind every booking, these partners help us watch for issues and keep
              the platform safe and dependable. See our full list of{" "}
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
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SAFETY.map((p) => (
            <PartnerCard key={p.name} partner={p} />
          ))}
        </div>
      </Reveal>
    </section>
  );
}
