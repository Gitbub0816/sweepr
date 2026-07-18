/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Link } from "react-router-dom";
import {
  CalendarCheck,
  ClipboardList,
  UserRoundCheck,
  Truck,
  ShieldCheck,
  ArrowRight,
  FlaskConical,
} from "lucide-react";
import { ThemeToggle, SweeprLogo } from "@sweepr/ui";

const FLOWS = [
  {
    to: "/demo/book",
    persona: "Customer",
    title: "Book a cleaning",
    blurb:
      "The full booking wizard: address, home details, room condition photos, add-ons, live quote, and a simulated checkout.",
    icon: CalendarCheck,
  },
  {
    to: "/demo/manage",
    persona: "Customer",
    title: "Manage a booking",
    blurb:
      "Track a clean in real time, tip your cleaner, leave a review, and see reschedule and cancel affordances.",
    icon: ClipboardList,
  },
  {
    to: "/demo/onboarding",
    persona: "Cleaner",
    title: "Onboarding",
    blurb:
      "Profile and service area, a training quiz gate, a simulated background check and identity check, then application submitted.",
    icon: UserRoundCheck,
  },
  {
    to: "/demo/day-of-service",
    persona: "Cleaner",
    title: "Day of service",
    blurb:
      "Accept a job offer against a countdown, drive the state machine to arrival, run the photo checklist, and see the earnings summary.",
    icon: Truck,
  },
  {
    to: "/demo/admin-review",
    persona: "Admin",
    title: "Application review",
    blurb:
      "What staff see when a cleaner applies: verification statuses and a sample Yardstik screening report.",
    icon: ShieldCheck,
  },
] as const;

export function DemoLanding() {
  return (
    <div className="min-h-screen bg-offwhite dark:bg-slate-950">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 pt-6">
        <SweeprLogo size="lg" />
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-20 pt-10 sm:pt-14">
        <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-seafoam-700 dark:text-seafoam-300">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Interactive demo
        </p>
        <h1 className="text-balance text-3xl font-extrabold tracking-tight text-charcoal dark:text-white sm:text-4xl">
          Walk the entire Sweepr flow.
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          Every auth-gated experience, unlocked and running on mock data. No sign in,
          no real payments, no background checks. Pick a flow and click through it end
          to end. Reset any flow at any time.
        </p>

        <ol className="mt-9 space-y-3">
          {FLOWS.map((f, i) => (
            <li
              key={f.to}
              className="motion-safe:animate-[demo-fade_400ms_cubic-bezier(0.23,1,0.32,1)_both]"
              style={{ animationDelay: `${i * 55}ms` }}
            >
              <Link
                to={f.to}
                className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out-quart [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-seafoam-300 [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:active:scale-[0.995] dark:border-slate-800 dark:bg-slate-900 dark:[@media(hover:hover)]:hover:border-seafoam-800 sm:p-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
                  <f.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {f.persona}
                  </p>
                  <p className="text-base font-semibold text-charcoal dark:text-white">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {f.blurb}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-seafoam-600 dark:text-slate-600" />
              </Link>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Looking for the two-persona realtime sync sandbox? Those links still live at{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] dark:bg-slate-800">
            /u1/t/&lt;id&gt;
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] dark:bg-slate-800">
            /u2/t/&lt;id&gt;
          </code>
          .
        </p>
      </main>
    </div>
  );
}
