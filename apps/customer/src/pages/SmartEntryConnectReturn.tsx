/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Landing page for the provider's hosted-consent tab after the customer
 * authorizes their smart-lock brand or Airbnb account. Seam is hard-configured
 * to redirect here (`CONNECT_RETURN_URL` in apps/api/src/routes/smartEntry.ts:
 * https://app.getsweepr.com/smart-entry/connect/return).
 *
 * This tab was opened by the Smart Locks page. We signal the opener — via
 * postMessage AND a localStorage ping (same-origin, so both are reliable and
 * one covers the case where the opener reference was severed) — so its poll
 * resolves instantly. The opener's 3s poll is the guaranteed fallback if these
 * signals are missed, so this page is purely a nicety plus a clean "close this
 * tab" confirmation. It makes NO API calls and shows no PII, so it lives outside
 * the auth/prelaunch gates.
 */

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { SweeprLogo } from "@sweepr/ui";
import {
  CONNECT_RETURN_MESSAGE,
  CONNECT_RETURN_STORAGE_KEY,
} from "@/lib/useSeamConnect";

export function SmartEntryConnectReturn() {
  useEffect(() => {
    // 1) Tell the opener directly (best case — instant resolve).
    try {
      window.opener?.postMessage(
        { type: CONNECT_RETURN_MESSAGE },
        window.location.origin,
      );
    } catch {
      /* opener gone or cross-origin — the storage ping + poll still cover us */
    }
    // 2) Broadcast to any same-origin tab (fires a `storage` event there).
    try {
      window.localStorage.setItem(CONNECT_RETURN_STORAGE_KEY, String(Date.now()));
    } catch {
      /* storage blocked (private mode) — the opener's interval poll covers us */
    }
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-offwhite px-6 text-center dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex justify-center">
          <SweeprLogo className="h-7 w-auto" />
        </div>
        <div className="mb-3 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-seafoam-100 text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
        </div>
        <h1 className="text-lg font-semibold text-charcoal dark:text-white">
          You&apos;re all set
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Your account is linked. You can close this tab and return to Sweepr —
          your connected locks will appear there automatically.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-seafoam-700 px-4 text-sm font-medium text-white shadow-sm shadow-seafoam-500/20 transition-colors hover:bg-seafoam-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-400 focus-visible:ring-offset-2"
        >
          Close this tab
        </button>
      </div>
    </main>
  );
}
