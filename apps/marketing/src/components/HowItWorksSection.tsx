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
  CalendarClock,
  ShieldCheck,
  KeyRound,
  Navigation,
  CreditCard,
  Star,
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

const SWEEPR_IDENTITY: Partner = {
  name: "Sweepr Identity Protection",
  role: "Our own identity & session layer",
  why: "Clerk verifies who you are; Sweepr's own identity layer then issues each app its own separate, short-lived session, so signing in to one Sweepr app never silently signs you in anywhere else.",
  href: "https://legal.getsweepr.com/security-policy",
  logo: "/brand/sweepr-logo.svg",
  wordmark: "/brand/sweepr-logo.svg",
};
const CLERK: Partner = {
  name: "Clerk",
  role: "Sign-in & account security",
  why: "Authentication trusted by thousands of companies, with modern security and multi-factor sign-in.",
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
  why: "Government-ID and biometric checks confirm the person at your door is who they say.",
  href: "https://didit.me",
  logo: "https://didit.me/favicon.ico",
};
const SEAM: Partner = {
  name: "Seam",
  role: "Smart-lock access, powered by Seam",
  why: "Connects hundreds of smart locks so entry is gated by time, place, and identity, then revoked.",
  href: "https://www.seam.co",
  logo: "https://www.seam.co/favicon.ico",
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
  why: "Watches for problems in real time so our team can catch and fix issues fast, keeping every booking dependable.",
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
  /** Distinct in-house blurb shown when there is no partner for this stop. */
  inHouseNote?: string;
  /** Short pricing/paywall line shown as a pill (e.g. Sweepr+ features). */
  paywall?: string;
}

const STEPS: Step[] = [
  {
    icon: UserPlus,
    label: "Create account",
    eyebrow: "Start here",
    title: "Create your account",
    body: "Create your profile in seconds. Bookings, home details, and receipts stay together in one secure place.",
    points: [
      "Fast sign-in with modern account security",
      "Save addresses and cleaning preferences",
      "Return anytime to manage upcoming cleanings",
    ],
    partners: [CLERK, SWEEPR_IDENTITY],
  },
  {
    icon: ClipboardCheck,
    label: "Quote & book",
    eyebrow: "Build your cleaning",
    title: "Get an upfront quote",
    body: "Tell us about your home and pick the package that fits. Your all-in price shows before you confirm. No haggling, no callbacks.",
    points: [
      "Clear package scope before checkout",
      "Add-ons only appear when not already included",
      "No negotiating or waiting for a quote",
    ],
    partners: [],
    inHouseNote:
      "Sweepr's pricing engine was built in-house over thousands of hours so your quote is fair, transparent, and final: every line calculated on our own servers, not guessed at.",
  },
  {
    icon: CalendarClock,
    label: "Pick a time",
    eyebrow: "Lock it in",
    title: "Choose a time that works",
    body: "Pick from real availability in your area. Confirm in a tap, and adjust right up until your cleaner checks in.",
    points: [
      "Live availability for your neighborhood",
      "Flexible rescheduling before check-in",
      "Instant confirmation, no back-and-forth",
    ],
    partners: [],
    inHouseNote:
      "Our scheduling and matching logic is 100% Sweepr, tuned by our team so the right cleaner is offered the right job at the right time, near you.",
  },
  {
    icon: ShieldCheck,
    label: "Verified match",
    eyebrow: "Trust checkpoint",
    title: "We verify & match your cleaner",
    body: "Every cleaner completes identity verification and an accredited background check before they can accept your job.",
    points: [
      "Government-ID and biometric identity verification",
      "FCRA-compliant background screening",
      "Matched on availability, area, and service fit",
    ],
    partners: [YARDSTIK, DIDIT],
  },
  {
    icon: Navigation,
    label: "Cleaner arrives",
    eyebrow: "Clean day",
    title: "Your cleaner heads your way",
    body: "Your pro navigates to your door and checks in on arrival. You get arrival, progress, and completion notifications, and the work is documented with before-and-after photos.",
    points: [
      "Turn-by-turn navigation to your address",
      "Check-in confirms the right person at the right home",
      "Arrival, progress, and completion notifications",
    ],
    partners: [],
    inHouseNote:
      "Turn-by-turn navigation and live arrival tracking run on our own mapping stack, so we control the route, the ETA, and exactly what your cleaner sees on the way to your door.",
  },
  {
    icon: KeyRound,
    label: "Smart Entry",
    eyebrow: "Optional · Smart Entry, powered by Seam",
    title: "Let your cleaner in, securely",
    body: "No need to wait at home. Once your cleaner arrives and checks in, Smart Entry, powered by Seam, grants temporary access: only during the approved window, only near your home, revoked when the job is done.",
    points: [
      "Smart-lock access powered by Seam",
      "Access gated by time, location, identity & check-in",
      "Every unlock is logged and you're notified live. A code or lockbox works too",
    ],
    partners: [SEAM],
    paywall: "$5 per cleaning · included with Sweepr+",
  },
  {
    icon: CreditCard,
    label: "Pay after",
    eyebrow: "You're all set",
    title: "Pay only after the job",
    body: "Booking places a temporary hold on your card, and it may show as pending. The payment itself goes through after the cleaning is done. Stripe handles it all; your card details never touch our servers.",
    points: [
      "A hold at booking, paid after service",
      "Encrypted: card details never touch our servers",
      "Clear receipt saved to your account",
    ],
    partners: [STRIPE],
  },
  {
    icon: Star,
    label: "Tip & review",
    eyebrow: "Wrap up",
    title: "Tip & review",
    body: "Add an optional tip and a review from your account. The tip goes straight to your cleaner, in full.",
    points: [
      "Optional tips go 100% to your cleaner",
      "Reviews shape who gets matched next",
      "Rebook your favorite pro in a tap",
    ],
    partners: [],
    inHouseNote:
      "Tips, reviews, and rebooking all run on Sweepr's own platform, designed by our team to reward great cleaners and make your next booking even easier.",
  },
];

// A long, mostly-vertical serpentine road. It travels in ONE direction (top →
// bottom) through a tall scroll container so all eight stops are reachable and
// none are clipped. Eight equal-length S-segments alternate left↔right so the
// arc-length-sampled node positions land cleanly on each bend.
const ROUTE_VW = 460;
const ROUTE_VH = 1400;
// Pixel height of the scrollable road area (the viewBox is stretched to fit).
const ROAD_PX = 1320;
const ROUTE_D =
  "M120 90 " +
  "C120 175 340 175 340 260 " +
  "C340 345 120 345 120 430 " +
  "C120 515 340 515 340 600 " +
  "C340 685 120 685 120 770 " +
  "C120 855 340 855 340 940 " +
  "C340 1025 120 1025 120 1110 " +
  "C120 1195 340 1195 340 1280";

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
        className="h-6 w-auto max-w-[140px] object-contain object-left"
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
      className="group flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2.5 transition-colors hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600"
    >
      {partner.wordmark ? (
        <>
          <span className="flex h-8 items-center">
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
      <span className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{partner.why}</span>
    </a>
  );
}

export function HowItWorksSection() {
  const [active, setActive] = useState(0);
  const [swapKey, setSwapKey] = useState(0);
  const step = STEPS[active];
  const StepIcon = step.icon;

  // Node positions sampled directly from the road so any number of stops sits
  // exactly on the path (percent of the 780×720 viewBox, which — with
  // preserveAspectRatio:none — maps 1:1 onto the stretched panel).
  const [nodePos, setNodePos] = useState<Array<{ x: number; y: number }>>([]);

  const progressRef = useRef<SVGPathElement>(null);
  const highlightRef = useRef<SVGPathElement>(null);
  const travelerRef = useRef<SVGGElement>(null);
  const lenRef = useRef(0);

  // The road lives at full height in the normal page flow (no inner scroll, so
  // nothing can ever be clipped). Selecting a stop scrolls the WINDOW to center
  // it — only in response to an explicit selection action (this effect keys on
  // `active`), never on the user's own scroll events, so manual scrolling is
  // never fought. On mobile the detail panel sits below the map, so selection
  // brings the panel into view instead.
  const nodeElRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRef = useRef<HTMLElement>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    // Don't yank the page on first paint; only on real navigation.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const desktop = window.matchMedia?.("(min-width: 1024px)").matches;
    if (desktop) {
      nodeElRefs.current[active]?.scrollIntoView({ behavior, block: "center" });
    } else {
      panelRef.current?.scrollIntoView({ behavior, block: "nearest" });
    }
  }, [active]);

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
      const pts = STEPS.map((_, i) => {
        const tt = STEPS.length === 1 ? 1 : i / (STEPS.length - 1);
        const p = prog.getPointAtLength(lenRef.current * tt);
        return { x: (p.x / ROUTE_VW) * 100, y: (p.y / ROUTE_VH) * 100 };
      });
      setNodePos(pts);
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
    <section id="how" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-20">
      <Reveal className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">How Sweepr works</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-charcoal [text-wrap:balance] dark:text-white sm:text-4xl">
          Follow a booking, start to finish
        </h2>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          Eight stops between "book a cleaning" and a clean home. Each one shows
          exactly what happens, and who handles it.
        </p>
      </Reveal>

      <Reveal className="mt-12">
        {/* Open layout, the road sits at its FULL height in the normal page
            flow (no card, no overflow-hidden, no inner scrollbar), so nothing
            can ever be clipped. The detail panel is sticky alongside it. */}
        {/* min-w-0 / minmax(0,…) everywhere: grid items default to
            min-width:auto, so a wide horizontal scroller inside would expand
            the track (and the page) instead of scrolling — iOS Safari then
            widens the layout viewport and the whole page renders zoomed out. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
          {/* ── Mobile stop strip ─────────────────────────────────── */}
          <div className="min-w-0 max-w-full lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                The route
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                Stop {active + 1} of {STEPS.length}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-seafoam-100 dark:bg-slate-700">
              <span
                className="block h-full rounded-full bg-seafoam-600 transition-all duration-500 ease-out"
                style={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <div
              role="tablist"
              aria-label="Booking journey steps"
              className="-mx-4 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {STEPS.map((s2, i) => {
                const Icon2 = s2.icon;
                const isActive2 = i === active;
                const isPassed2 = i < active;
                return (
                  <button
                    key={s2.title}
                    type="button"
                    role="tab"
                    aria-selected={isActive2}
                    onClick={() => go(i)}
                    className={`flex w-[5.4rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-colors ${
                      isActive2
                        ? "border-seafoam-600 bg-seafoam-50 dark:border-seafoam-500 dark:bg-seafoam-900/25"
                        : isPassed2
                          ? "border-seafoam-200 bg-white dark:border-seafoam-800/60 dark:bg-slate-900"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-xl ${
                        isActive2
                          ? "bg-seafoam-700 text-white"
                          : isPassed2
                            ? "bg-seafoam-600 text-white"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      <Icon2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span
                      className={`text-center text-[10px] font-extrabold leading-tight ${
                        isActive2 ? "text-seafoam-800 dark:text-seafoam-300" : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {s2.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── The road (desktop) ─────────────────────────────────────
              On phones the 1300px-tall map pushed the detail card a full
              screen away, so below lg the road is replaced by a horizontal
              snap strip of stops that drives the same detail card. */}
          <div className="relative hidden lg:block">
            {/* Full-height road canvas — every stop always visible in the page. */}
            <div className="relative w-full" style={{ height: ROAD_PX }}>
            {/* route */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${ROUTE_VW} ${ROUTE_VH}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={ROUTE_D}
                className="fill-none stroke-black/5"
                strokeWidth={22}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(0 6)"
              />
              <path
                d={ROUTE_D}
                className="fill-none stroke-seafoam-100 dark:stroke-slate-700"
                strokeWidth={18}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                ref={progressRef}
                d={ROUTE_D}
                className="fill-none stroke-seafoam-600"
                strokeWidth={18}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke-dashoffset .85s cubic-bezier(.22,1,.36,1)" }}
              />
              <path
                ref={highlightRef}
                d={ROUTE_D}
                className="fill-none stroke-white/30"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke-dashoffset .85s cubic-bezier(.22,1,.36,1)" }}
              />
              <path
                d={ROUTE_D}
                className="fill-none stroke-white/80"
                strokeWidth={2}
                strokeDasharray="1.5 11"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g ref={travelerRef} transform="translate(44 366)">
                <circle
                  r={10}
                  className="fill-white stroke-seafoam-600"
                  strokeWidth={3}
                  style={{ filter: "drop-shadow(0 8px 10px rgba(15,118,110,.26))" }}
                />
                <circle r={4} className="fill-seafoam-600" />
              </g>
            </svg>

            {/* destination house (sits above the final stop on the road) */}
            <span
              className="pointer-events-none absolute z-[2]"
              style={{
                left: `${nodePos[STEPS.length - 1]?.x ?? 73.9}%`,
                top: `${nodePos[STEPS.length - 1]?.y ?? 91.4}%`,
                width: 88,
                height: 72,
                transform: "translate(-50%,-88%)",
              }}
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

            {/* step nodes (positioned exactly on the road) */}
            {nodePos.length === STEPS.length &&
              STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = i === active;
                const isPassed = i < active;
                return (
                  <button
                    key={s.title}
                    ref={(el) => {
                      nodeElRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => go(i)}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 focus-visible:outline-none"
                    style={{ left: `${nodePos[i].x}%`, top: `${nodePos[i].y}%` }}
                  >
                    <span
                      className={`relative grid h-11 w-11 place-items-center rounded-[0.95rem] border-[3px] border-white transition-all duration-200 dark:border-slate-900 ${
                        isActive
                          ? "scale-110 bg-seafoam-700 text-white shadow-[0_14px_30px_rgba(15,118,110,.29),0_0_0_6px_rgba(153,246,228,.5)]"
                          : isPassed
                            ? "bg-seafoam-600 text-white shadow-lg"
                            : "bg-white text-slate-500 shadow-md hover:-translate-y-0.5 hover:text-seafoam-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      <span
                        className={`absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white text-[10px] font-black text-white dark:border-slate-900 ${
                          isActive ? "bg-charcoal" : isPassed ? "bg-seafoam-800" : "bg-slate-700"
                        }`}
                      >
                        {i + 1}
                      </span>
                    </span>
                    <span
                      className={`max-w-[7rem] rounded-lg border bg-white/85 px-2 py-1 text-center text-[10px] font-extrabold leading-tight shadow-sm backdrop-blur transition-colors dark:bg-slate-800/85 ${
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
          </div>

          {/* ── Detail panel (sticky companion card) ─────────────────── */}
          <aside
            ref={panelRef}
            className="flex min-w-0 flex-col self-start overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-24 lg:max-h-[calc(100svh-7rem)]"
            aria-live="polite"
          >
            <div className="border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
                  {step.eyebrow}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {active + 1} of {STEPS.length}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span
                  className="block h-full rounded-full bg-seafoam-600 transition-all duration-500 ease-out"
                  style={{ width: `${((active + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            <div key={swapKey} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-5 pt-4 [animation:sweepr-fadeswap_.34s_ease_both]">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-seafoam-100 bg-seafoam-50 text-seafoam-700 dark:border-slate-700 dark:bg-slate-800 dark:text-seafoam-300">
                <StepIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-xl font-black leading-tight tracking-tight text-charcoal dark:text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-[13px] leading-snug text-slate-600 dark:text-slate-400">{step.body}</p>

              <ul className="mt-3.5 grid gap-1.5">
                {step.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded bg-seafoam-100 text-seafoam-800 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              {step.paywall && (
                <p className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {step.paywall}
                </p>
              )}

              {/* partner tie-in / in-house */}
              <div className="pt-4">
                {step.partners.length > 0 ? (
                  <>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Powered by trusted partners
                    </p>
                    <div className="grid gap-2">
                      {step.partners.map((p) => (
                        <PartnerCard key={p.name} partner={p} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-seafoam-200 bg-seafoam-50/60 p-3 dark:border-seafoam-800/50 dark:bg-seafoam-900/20">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 items-center justify-center rounded-lg bg-white px-2.5 ring-1 ring-slate-200 dark:ring-slate-600">
                        <SweeprLogo size="sm" className="h-6" />
                      </span>
                      <span className="text-xs font-black uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
                        We handle this part
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-snug text-slate-600 dark:text-slate-400">
                      {step.inHouseNote ??
                        "The Sweepr development team has spent thousands of hours building this part of the experience in-house."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* controls */}
            <div className="grid grid-cols-[3rem_1fr_3rem] gap-2.5 border-t border-slate-200 px-6 pb-5 pt-3.5 dark:border-slate-700">
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

        <p className="mt-4 text-center text-xs font-medium text-slate-500">
          Tap any stop, or use Back and Next.
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
