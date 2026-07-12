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
  href: string;
  /** Logo asset served from the partner's own domain. */
  logo: string;
}

// Only partners a customer actually touches or sees during their journey.
// Behind-the-scenes vendors (databases, analytics, AI scope review, cleaner
// background checks) are intentionally omitted — see /subprocessors for the
// complete, legally authoritative list.
const PARTNERS: Partner[] = [
  {
    name: "Clerk",
    role: "Secure sign-in & your account",
    href: "https://clerk.com",
    logo: "https://clerk.com/favicon.ico",
  },
  {
    name: "Stripe",
    role: "Payments & tips",
    href: "https://stripe.com",
    logo: "https://stripe.com/favicon.ico",
  },
  {
    name: "Mapbox",
    role: "Maps & service-area coverage",
    href: "https://www.mapbox.com",
    logo: "https://www.mapbox.com/favicon.ico",
  },
  {
    name: "MailerSend",
    role: "Booking emails & text updates",
    href: "https://www.mailersend.com",
    logo: "https://www.mailersend.com/favicon.ico",
  },
  {
    name: "Twilio",
    role: "Masked calls with your cleaner",
    href: "https://www.twilio.com",
    logo: "https://www.twilio.com/favicon.ico",
  },
  {
    name: "Cloudflare",
    role: "Speed & security",
    href: "https://www.cloudflare.com",
    logo: "https://www.cloudflare.com/favicon.ico",
  },
];

function PartnerLogo({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={partner.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white/70 p-3 transition-colors hover:border-seafoam-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-seafoam-600"
    >
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
        <span className="block text-xs text-slate-500 dark:text-slate-400">
          {partner.role}
        </span>
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
              Trusted partners powering your experience
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sweepr works with best-in-class services so your bookings, payments,
              and communications stay fast and secure. See our full list of{" "}
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
