/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useState } from "react";
import { cn } from "@sweepr/utils";

/**
 * A dollar-denominated money input that stores integer cents.
 *
 * Admins type human dollars ("20", "19.99") behind a `$` prefix; the value is
 * converted to cents (parseFloat * 100, rounded) so nobody ever types raw cents
 * again (typing `20` for $20 used to grant $0.20).
 */
export function DollarInput({
  cents,
  onCents,
  allowEmpty = false,
  placeholder,
  className,
  id,
  ariaLabel,
}: {
  cents: number | null;
  onCents: (cents: number | null) => void;
  /** When true an empty field yields null instead of 0. */
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => centsToText(cents));

  // Reseed only when the external value diverges from what we're displaying
  // (e.g. a form loads data) so in-progress typing like "12." isn't clobbered.
  useEffect(() => {
    if (textToCents(text, true) !== cents) setText(centsToText(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
      <input
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onCents(textToCents(v, allowEmpty));
        }}
        className="w-full rounded-md border border-slate-200 bg-transparent py-1.5 pl-6 pr-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:text-white"
      />
    </div>
  );
}

function centsToText(cents: number | null): string {
  if (cents == null || Number.isNaN(cents)) return "";
  return String(cents / 100);
}

function textToCents(text: string, allowEmpty: boolean): number | null {
  const t = text.trim();
  if (t === "") return allowEmpty ? null : 0;
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return allowEmpty ? null : 0;
  return Math.round(n * 100);
}
