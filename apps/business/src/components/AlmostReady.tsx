/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@sweepr/ui";
import { BusinessLogo } from "./BusinessLogo";

/** Graceful landing state shown while the Sweepr Business workspace
 * (its Clerk application) is not yet provisioned. */
export function AlmostReady() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-offwhite to-platinum-50 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="flex flex-col items-center text-center">
        <BusinessLogo size="lg" />
        <div className="mt-8 flex items-center gap-2 rounded-full border border-platinum-200 bg-white px-4 py-1.5 text-sm font-medium text-platinum-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-platinum-400">
          <Sparkles className="h-4 w-4" />
          Coming soon
        </div>
        <h1 className="mt-4 text-3xl font-bold text-charcoal dark:text-white">
          Sweepr Business is almost ready
        </h1>
        <p className="mt-3 max-w-md text-base text-slate-500">
          Manage properties, teams, and cleanings for your whole portfolio in
          one workspace. We&rsquo;re putting on the finishing touches — check
          back soon.
        </p>
        <a
          href="https://getsweepr.com"
          className="mt-8 inline-flex h-10 items-center rounded-xl bg-charcoal px-4 text-sm font-semibold text-platinum-200 shadow-sm shadow-platinum-500/20 ring-1 ring-platinum-500/40 transition hover:bg-slate-800"
        >
          Visit getsweepr.com
        </a>
      </div>
    </div>
  );
}
