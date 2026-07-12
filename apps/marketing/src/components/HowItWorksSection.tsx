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
  ChevronDown,
  Search,
  CalendarCheck,
  Sparkles,
  Star,
} from "lucide-react";

/**
 * "How Sweepr works" — a collapsible explainer that lives beneath the coverage
 * map. Closed by default so it never redirects or dominates the page; curious
 * visitors expand it in place. It shows the customer journey as a friendly
 * flow map and credits the customer-facing partners that power each step.
 *
 * Partner logos are loaded live from each partner's OWN domain (never stored
 * by us), so a rebrand on their side flows through automatically. Each logo
 * falls back to a lettered chip if the remote asset fails to load.
 */

const JOURNEY: Array<{
  icon: typeof Search;
  title: string;
  body: string;
}> = [
  {
    icon: Search,
    title: "Tell us about your home",
    body: "Pick your package and add-ons and get an upfront quote — no surprises, no haggling.",
  },
  {
    icon: CalendarCheck,
    title: "Book a time that works",
    body: "Choose a slot and confirm. We match you with a background-checked cleaner in your area.",
  },
  {
    icon: Sparkles,
    title: "Your cleaner arrives",
    body: "They check in, clean to your chosen scope, and share before/after photos of the work.",
  },
  {
    icon: Star,
    title: "Relax & review",
    body: "You're only charged after the job. Tip and leave a review right from your account.",
  },
];

interface Partner {
  name: string;
  role: string;
  /** One line on why this partner is best-in-class — reinforces trust. */
  why: string;
  href: string;
  /** Logo asset served from the partner's own domain. */
  logo: string;
}

// The partners whose expertise a customer directly relies on for a safe,
// trustworthy experience: identity & payments, cleaner vetting, and the
// monitoring that keeps it all safe. Purely behind-the-scenes infrastructure
// (hosting, database, email delivery) is omitted — see /subprocessors for the
// complete, legally authoritative list.
const PARTNERS: Partner[] = [
  {
    name: "Clerk",
    role: "Sign-in & account security",
    why: "Bank-grade authentication trusted by thousands of companies — your account is protected with modern security and multi-factor sign-in.",
    href: "https://clerk.com",
    logo: "https://clerk.com/favicon.ico",
  },
  {
    name: "Stripe",
    role: "Payments & tips",
    why: "The payments platform behind millions of businesses worldwide. Your card details are encrypted and never touch Sweepr's servers, and you're only charged after your clean.",
    href: "https://stripe.com",
    logo: "https://stripe.com/favicon.ico",
  },
  {
    name: "Yardstik",
    role: "Cleaner background checks",
    why: "A specialist in vetting the gig and services workforce. Every Sweepr cleaner clears an accredited, FCRA-compliant background check before they can accept a job.",
    href: "https://www.yardstik.com",
    logo: "https://www.yardstik.com/favicon.ico",
  },
  {
    name: "Didit",
    role: "Identity verification",
    why: "Confirms every cleaner is a real, verified person via government-ID and biometric checks — so the pro at your door is exactly who they say they are.",
    href: "https://didit.me",
    logo: "https://didit.me/favicon.ico",
  },
  {
    name: "PostHog",
    role: "Product analytics & safety monitoring",
    why: "Privacy-first analytics that help us spot issues, improve the experience, and keep the platform running smoothly and safely.",
    href: "https://posthog.com",
    logo: "https://posthog.com/favicon.ico",
  },
  {
    name: "Sentry",
    role: "Reliability & error monitoring",
    why: "Watches for problems in real time so our team can catch and fix issues fast — keeping every booking dependable.",
    href: "https://sentry.io",
    logo: "https://sentry.io/favicon.ico",
  },
];

function PartnerLogo({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={partner.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 p-4 transition-colors hover:border-seafoam-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-seafoam-600"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200 dark:ring-slate-600">
          {failed ? (
            <span className="text-sm font-bold text-slate-500">
              {partner.name.slice(0, 1)}
            </span>
          ) : (
            <img
              src={partner.logo}
              alt={`${partner.name} logo`}
              width={24}
              height={24}
              loading="lazy"
              className="h-6 w-6 object-contain"
              onError={() => setFailed(true)}
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-charcoal dark:text-white">
            {partner.name}
          </span>
          <span className="block text-xs font-medium text-seafoam-700 dark:text-seafoam-300">
            {partner.role}
          </span>
        </span>
      </span>
      <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {partner.why}
      </span>
    </a>
  );
}

export function HowItWorksSection() {
  const [open, setOpen] = useState(false);

  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-4 pb-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="how-it-works-panel"
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/70 px-5 py-4 text-left transition-colors hover:border-seafoam-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-seafoam-600"
      >
        <span>
          <span className="block text-base font-semibold text-charcoal dark:text-white">
            How Sweepr works
          </span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            The journey from quote to sparkle — and the trusted partners behind it.
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          id="how-it-works-panel"
          className="mt-4 rounded-2xl border border-slate-200 bg-white/60 p-5 dark:border-slate-700 dark:bg-slate-900/40 sm:p-8"
        >
          {/* Journey map */}
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal dark:text-white">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.body}
                  </p>
                  {i < JOURNEY.length - 1 && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-2 top-5 hidden text-slate-300 lg:block"
                    >
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Partners */}
          <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-charcoal dark:text-white">
              Built on partners you can trust
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              We don't cut corners on the things that matter. Sweepr is built on
              industry leaders for identity, payments, cleaner vetting, and safety
              monitoring — each an expert in what they do — so every booking is
              secure, every cleaner is verified, and your experience is dependable.
              See our full list of{" "}
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNERS.map((p) => (
                <PartnerLogo key={p.name} partner={p} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
