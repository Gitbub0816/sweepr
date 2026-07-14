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
import { SweeprLogo, ThemeToggle } from "@sweepr/ui";

/** Graceful landing state shown while central sign-in is not yet wired
 * (missing Clerk publishable key at build time). */
export function AlmostReady() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-offwhite to-seafoam-50 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="flex flex-col items-center text-center">
        <SweeprLogo size="lg" />
        <div className="mt-8 flex items-center gap-2 rounded-full border border-seafoam-200 bg-white px-4 py-1.5 text-sm font-medium text-seafoam-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-seafoam-400">
          <Sparkles className="h-4 w-4" />
          Coming soon
        </div>
        <h1 className="mt-4 text-3xl font-bold text-charcoal dark:text-white">
          Sweepr sign-in is almost ready
        </h1>
        <p className="mt-3 max-w-md text-base text-slate-500">
          One secure place to sign in to every Sweepr application. We&rsquo;re
          putting on the finishing touches, check back soon.
        </p>
        <a
          href="https://getsweepr.com"
          className="mt-8 inline-flex h-10 items-center rounded-xl bg-charcoal px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Visit getsweepr.com
        </a>
      </div>
    </div>
  );
}
