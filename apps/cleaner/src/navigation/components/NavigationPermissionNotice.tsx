/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { AlertTriangle, MapPin, ShieldAlert, WifiOff, Clock, Globe } from "lucide-react";

export type NavigationNoticeReason =
  | "permission-denied"
  | "unavailable"
  | "timeout"
  | "poor-accuracy"
  | "unsupported-browser"
  | "non-secure-context";

export interface NavigationPermissionNoticeProps {
  reason: NavigationNoticeReason;
  onRetry?: () => void;
}

const BASE_TIPS = [
  "Keep this page open — navigation stops if you leave the tab or lock your phone.",
  "Keep your screen active for the smoothest tracking.",
  "Grant precise (not approximate) location access when prompted.",
  "Use a recent version of Safari or Chrome for the best experience.",
];

const REASON_COPY: Record<NavigationNoticeReason, { icon: typeof AlertTriangle; title: string; body: string }> = {
  "permission-denied": {
    icon: ShieldAlert,
    title: "Location access denied",
    body: "Sweepr needs location access to show your position on the map. Enable location for this site in your browser settings, then reload.",
  },
  unavailable: {
    icon: WifiOff,
    title: "Location unavailable",
    body: "Your device couldn't determine a location right now. This can happen indoors or with a weak GPS signal — try again once you're outdoors or near a window.",
  },
  timeout: {
    icon: Clock,
    title: "Location is taking a while",
    body: "We're still waiting on your device's GPS. Weak signal or airplane mode can cause this — check your connection and try again.",
  },
  "poor-accuracy": {
    icon: MapPin,
    title: "Location accuracy is low",
    body: "Your reported position isn't accurate enough for reliable turn-by-turn guidance right now. Directions are still available, but your position on the map may be off.",
  },
  "unsupported-browser": {
    icon: Globe,
    title: "Browser not supported",
    body: "This browser doesn't support the location features in-browser navigation needs. Try a recent version of Safari or Chrome.",
  },
  "non-secure-context": {
    icon: AlertTriangle,
    title: "Secure connection required",
    body: "Location access requires a secure (https) connection. Reload this page over https to continue.",
  },
};

/**
 * Honest messaging about what in-browser navigation can and can't do —
 * deliberately not softened. See ../README.md for the full list of
 * browser/PWA limitations this reflects.
 */
export function NavigationPermissionNotice({ reason, onRetry }: NavigationPermissionNoticeProps) {
  const copy = REASON_COPY[reason];
  const Icon = copy.icon;

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center dark:border-slate-700 dark:bg-charcoal"
    >
      <Icon className="h-10 w-10 text-amber-500" aria-hidden="true" />
      <div>
        <p className="text-base font-semibold text-slate-900 dark:text-white">{copy.title}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy.body}</p>
      </div>
      <ul className="w-full max-w-sm space-y-1 text-left text-xs text-slate-500 dark:text-slate-400">
        {BASE_TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      )}
    </div>
  );
}
