/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@sweepr/utils";

/**
 * Canonical explainer for the Marketplace Services Fee, shown wherever the fee
 * is displayed. The cleaner app carries the same copy through i18n
 * (cleaner.jobs.marketplaceServicesFeeInfo); keep the two in sync.
 */
export const MARKETPLACE_SERVICES_FEE_EXPLAINER =
  "Supports the services required to operate each Sweepr booking, including marketplace technology, payment infrastructure, cleaner support and screening, insurance-related costs, customer support, and ongoing platform operations.";

/**
 * Small inline info affordance: an accessible icon button that reveals a short
 * explainer on hover, keyboard focus, or tap (touch devices have no hover).
 * Styling matches the house tooltip (see FoundingMemberBadge).
 *
 * Renders inline with the text it annotates:
 *   <span>Marketplace Services Fee <InfoTip label="About the Marketplace Services Fee" text={...} /></span>
 */
export function InfoTip({
  text,
  label,
  align = "center",
  className,
}: {
  /** Tooltip body copy. */
  text: string;
  /** Accessible name for the trigger button, e.g. "About the Marketplace Services Fee". */
  label: string;
  /** Which edge of the tooltip anchors to the icon (keeps it inside cards near container edges). */
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400",
          "hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-seafoam-500",
          "dark:text-slate-500 dark:hover:text-slate-300",
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-30 mb-1.5 w-64 rounded-md px-2.5 py-2 text-left text-[11px] font-normal leading-relaxed",
          "bg-slate-900 text-white shadow-lg dark:bg-slate-700",
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          open && "opacity-100",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "right" && "right-0",
          align === "left" && "left-0",
        )}
      >
        {text}
      </span>
    </span>
  );
}
