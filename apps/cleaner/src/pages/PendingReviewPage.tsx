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
import { CheckCircle2, Circle, Mail } from "lucide-react";
import { ThemeToggle } from "@sweepr/ui";
import { useAppToken } from "@/lib/appToken";

const API_URL = import.meta.env.VITE_API_URL ?? "";

interface OnboardingStatus {
  background: boolean;
  identity: boolean;
  approved: boolean;
}

const DEFAULT_STATUS: OnboardingStatus = {
  background: false,
  identity: false,
  approved: false,
};

/** Steps whose completion is fetched live from GET /cleaners/onboarding-progress
 *  — "Application submitted" is always true here (you can't reach this page
 *  without having submitted). */
function buildTimeline(status: OnboardingStatus) {
  return [
    { label: "Application submitted", done: true },
    { label: "Background check", done: status.background },
    { label: "Identity verified", done: status.identity },
    { label: "Account approved", done: status.approved },
  ];
}

export function PendingReviewPage() {
  const { getToken } = useAppToken();
  const [status, setStatus] = useState<OnboardingStatus>(DEFAULT_STATUS);
  const doneRef = useRef(false);

  // Live status, same request/poll shape as OnboardingPage's Didit sync: fetch
  // on mount, then keep polling while review is still in flight so this
  // screen updates itself the moment a background check or identity check
  // clears, instead of staying stuck on "(pending)" forever.
  useEffect(() => {
    if (!API_URL) return;
    let cancelled = false;

    async function syncStatus() {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/cleaners/onboarding-progress`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          steps?: { background?: boolean; identity?: boolean; approved?: boolean };
        };
        const next: OnboardingStatus = {
          background: Boolean(data.steps?.background),
          identity: Boolean(data.steps?.identity),
          approved: Boolean(data.steps?.approved),
        };
        setStatus(next);
        doneRef.current = next.approved;
      } catch {
        // ignore — keep showing the last known (or default) status
      }
    }

    void syncStatus();
    const interval = setInterval(() => {
      if (!doneRef.current) void syncStatus();
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [getToken]);

  const TIMELINE = buildTimeline(status);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-seafoam-50 via-offwhite to-seafoam-100 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-seafoam-700 text-white shadow-lg shadow-seafoam-500/30">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-charcoal dark:text-white">
          Your application is under review
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          We typically review applications within 2–3 business days.
        </p>

        <ul className="mt-8 space-y-4 text-left">
          {TIMELINE.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-seafoam-500" />
              ) : (
                <Circle className="h-5 w-5 text-slate-300" />
              )}
              <span
                className={
                  step.done
                    ? "text-sm font-medium text-charcoal dark:text-white"
                    : "text-sm text-slate-600"
                }
              >
                {step.label}
                {!step.done && (
                  <span className="ml-2 text-xs text-slate-600">(pending)</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-xl bg-offwhite p-4 text-sm dark:bg-slate-800">
          <p className="flex items-center justify-center gap-2 text-slate-500">
            <Mail className="h-4 w-4" />
            <a
              href="mailto:support@getsweepr.com"
              className="font-medium text-seafoam-700"
            >
              support@getsweepr.com
            </a>
          </p>
          <p className="mt-2 text-xs text-slate-600">
            In the meantime, follow us on social, we'll be in touch soon.
          </p>
        </div>
      </div>
    </div>
  );
}
