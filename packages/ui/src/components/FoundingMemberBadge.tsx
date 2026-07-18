/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { ReactNode } from "react";
import { cn } from "@sweepr/utils";

/**
 * The permanent Founding Member badge shown across the platform (cleaner &
 * customer profiles, booking pages, directory cards, admin, job screens).
 *
 * Designed to read as exclusive + trusted, never "pay-to-win": a warm gold
 * accent, a medal, and an optional founder number / tooltip. `size="sm"` is the
 * inline chip beside a name; `size="lg"` is the profile hero variant.
 */
export function FoundingMemberBadge({
  founderId,
  size = "sm",
  showTooltip = true,
  className,
}: {
  founderId?: number | null;
  size?: "sm" | "lg";
  showTooltip?: boolean;
  className?: string;
}) {
  const tooltip = "One of Sweepr's earliest approved cleaning professionals.";
  return (
    <span
      className={cn(
        "group relative inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        "border border-amber-300/70 bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-800",
        "dark:border-amber-500/40 dark:from-amber-500/15 dark:to-yellow-500/10 dark:text-amber-300",
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
      aria-label={`Founding Member${founderId ? ` number ${founderId}` : ""}`}
    >
      {/* Gold sheen: a single gleam that sweeps across on hover. Reuses the
          shared `sweep` motion as a one-pass `sheen` (never loops), and is
          clipped to its own rounded layer so it can't spill onto the tooltip
          below. Hover-capable pointers only; suppressed under reduced motion. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(115deg,transparent_38%,rgba(255,255,255,0.55)_50%,transparent_62%)] motion-reduce:hidden dark:bg-[linear-gradient(115deg,transparent_38%,rgba(255,255,255,0.28)_50%,transparent_62%)] [@media(hover:hover)]:group-hover:animate-sheen" />
      </span>
      <span aria-hidden>🏅</span>
      <span>Founding Member</span>
      {founderId ? (
        <span className="tabular-nums opacity-70">#{founderId}</span>
      ) : null}
      {showTooltip ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-52 -translate-x-1/2 rounded-md px-2 py-1 text-center text-[11px] font-normal",
            "bg-slate-900 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700",
          )}
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Subtle accent wrapper for customer-facing cleaner cards — a thin gold ring +
 * optional badge slot — that distinguishes Founding Members without shouting.
 */
export function FoundingMemberFrame({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return <>{children}</>;
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-b from-amber-200/60 to-transparent p-[1.5px] dark:from-amber-500/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
