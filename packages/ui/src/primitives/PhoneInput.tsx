/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@sweepr/utils";
import { formatUsPhoneDisplay, toE164US, usPhoneDigits } from "../lib/phone";

export interface PhoneInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  label?: string;
  error?: string;
  hint?: string;
  /** Stored value — ideally E.164 (+1XXXXXXXXXX); partial digits also accepted. */
  value: string;
  /**
   * Fires on every keystroke with the normalized value:
   *  - full 10-digit entry → E.164 "+1XXXXXXXXXX"
   *  - otherwise → the raw digits typed so far (so the field stays controllable)
   * Persist with `toE164US(value)` to guarantee E.164 in the DB.
   */
  onChange: (value: string) => void;
}

/**
 * Phone field that shows a (XXX) XXX-XXXX mask while emitting a normalized
 * value (E.164 once complete). Drop-in replacement for `<Input type="tel">` —
 * same label/hint/error styling.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { className, label, error, hint, id, value, onChange, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [display, setDisplay] = useState(() => formatUsPhoneDisplay(value));

  // Re-sync the mask only when the external value's digits actually differ
  // (e.g. a value loaded from the API) — never clobber mid-typing, since the
  // parent echoes back the same digits we just emitted.
  useEffect(() => {
    const incoming = usPhoneDigits(value);
    setDisplay((cur) => (usPhoneDigits(cur) === incoming ? cur : formatUsPhoneDisplay(incoming)));
  }, [value]);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        value={display}
        onChange={(e) => {
          const d = usPhoneDigits(e.target.value);
          setDisplay(formatUsPhoneDisplay(d));
          onChange(toE164US(d) ?? d);
        }}
        className={cn(
          "h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-charcoal placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:bg-slate-800 dark:text-white",
          error ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-700",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});
