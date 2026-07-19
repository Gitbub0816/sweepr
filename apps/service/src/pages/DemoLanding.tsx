/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { ExternalLink, ShieldCheck, User, Wrench } from "lucide-react";
import { ThemeToggle, SweeprLogo, Card, Badge } from "@sweepr/ui";

const CUSTOMER_URL = "https://demo.app.getsweepr.com";
const CLEANER_URL = "https://demo.clean.getsweepr.com";
const DEMO_EMAIL_CUSTOMER = "demo-customer@getsweepr.com";
const DEMO_EMAIL_CLEANER = "demo-cleaner@getsweepr.com";

/**
 * service.getsweepr.com — the entry point to Sweepr's demo environment.
 *
 * This links out to the REAL apps/customer and apps/cleaner bundles (same
 * code, same Clerk sign-in, same everything) running against an isolated
 * `demo` database schema and Stripe TEST keys — never production data or a
 * real card. See CLAUDE.md / packages/db/clone-demo-schema.mjs for how the
 * isolation works.
 */
export function DemoLanding() {
  return (
    <div className="min-h-screen bg-offwhite dark:bg-charcoal">
      <header className="flex items-center justify-between px-6 py-4">
        <SweeprLogo size="md" />
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <h1 className="text-2xl font-bold text-charcoal dark:text-white sm:text-3xl">
          Try the whole booking flow
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Sign in on both sides to test a booking end to end — place a real
          cleaning request as the customer, then accept and run the
          day-of-service flow as the cleaner. Everything below runs the actual
          Sweepr apps against an isolated demo database and Stripe test keys —
          nothing here touches production data or a real card.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <DemoCard
            icon={<User className="h-5 w-5" />}
            title="Customer side"
            description="Book a cleaning, track it, tip and review your cleaner."
            href={CUSTOMER_URL}
            email={DEMO_EMAIL_CUSTOMER}
          />
          <DemoCard
            icon={<Wrench className="h-5 w-5" />}
            title="Cleaner side"
            description="Accept the job, check in, complete the day-of-service flow."
            href={CLEANER_URL}
            email={DEMO_EMAIL_CLEANER}
          />
        </div>

        <Card className="mt-8 flex items-start gap-3 border-seafoam-200 bg-seafoam-50 p-4 dark:border-seafoam-800 dark:bg-seafoam-900/20">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-seafoam-600" />
          <p className="text-sm text-seafoam-800 dark:text-seafoam-300">
            The password for both demo accounts is shared with you separately —
            ask if you don't have it. Data in this environment is periodically
            reset and never mixes with real customer or cleaner accounts.
          </p>
        </Card>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-charcoal dark:text-white">
            Suggested test path
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>1. Sign in as the customer and book a cleaning at any San Francisco address.</li>
            <li>2. Sign in as the cleaner (a different browser or profile) and accept the offer.</li>
            <li>3. Run the day-of-service flow: check in, upload photos, mark complete.</li>
            <li>4. Back on the customer side, tip and leave a review.</li>
          </ol>
        </div>
      </main>
    </div>
  );
}

function DemoCard({
  icon,
  title,
  description,
  href,
  email,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  email: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-seafoam-700 dark:text-seafoam-400">
          {icon}
          <span className="font-semibold text-charcoal dark:text-white">{title}</span>
        </span>
        <ExternalLink className="h-4 w-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      <div className="mt-4 flex items-center gap-2">
        <Badge variant="info">{email}</Badge>
      </div>
    </a>
  );
}
