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
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useReducedMotion } from "@sweepr/ui";

/* Shared headless-auth primitives for the central sign-in ceremony. These
 * mirror the proven pattern in apps/customer/src/components/authHelpers.tsx —
 * copied (not imported) because apps must not reach across app boundaries. */

export const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-charcoal outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-500 focus:border-seafoam-500 focus:ring-2 focus:ring-seafoam-400/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400";

/* ── Error copy ──────────────────────────────────────────────────────────
 * Committee-approved wording. We map Clerk error codes onto Sweepr-voice copy;
 * anything unmapped falls back to Clerk's own message, then a generic line. */
export const AUTH_ERROR_COPY: Record<string, string> = {
  form_identifier_not_found: "We couldn't find an account for that email. Create one instead.",
  form_password_incorrect: "That password doesn't match. Try again or reset it.",
  form_identifier_exists: "That email already has an account. Sign in instead.",
  form_code_incorrect: "That code isn't right. Check it and re-enter.",
  verification_failed: "That code isn't right. Check it and re-enter.",
  verification_expired: "That code expired. Send a new one.",
  form_param_format_invalid: "Enter a valid email address.",
  form_password_pwned: "That password appeared in a breach. Choose another.",
  too_many_requests: "Too many attempts. Wait a moment, then try again.",
  captcha_invalid: "We couldn't verify you're human. Refresh and retry.",
  fallback: "Something went wrong. Please try again.",
};

type ClerkError = {
  errors?: { code?: string; message?: string; longMessage?: string }[];
};

export function clerkErrorCode(err: unknown): string | undefined {
  return (err as ClerkError)?.errors?.[0]?.code;
}

export function friendlyAuthError(err: unknown): string {
  const first = (err as ClerkError)?.errors?.[0];
  const code = first?.code;
  if (code && AUTH_ERROR_COPY[code]) return AUTH_ERROR_COPY[code];
  return first?.message ?? AUTH_ERROR_COPY.fallback;
}

/* ── Field / labels ──────────────────────────────────────────────────────*/
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-charcoal dark:text-white">{label}</span>
      {children}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} pr-11`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition-colors hover:text-charcoal dark:hover:text-white"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}

/* ── Error box ───────────────────────────────────────────────────────────*/
export function ErrorBox({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
    >
      <p>{message}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────*/
export function SubmitButton({
  loading,
  disabled,
  label,
}: {
  loading: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-seafoam-700 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-seafoam-900/25 transition-[transform,background-color] duration-150 ease-out hover:bg-seafoam-800 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

export function TextLinkButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-medium text-seafoam-700 underline-offset-2 transition-colors hover:text-seafoam-800 hover:underline dark:text-seafoam-400 dark:hover:text-seafoam-300 ${className}`}
    >
      {children}
    </button>
  );
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-charcoal dark:text-slate-400 dark:hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

/* ── Divider ─────────────────────────────────────────────────────────────*/
export function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      <span className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

/* ── Segmented control (Sign in / Create account) ────────────────────────*/
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="tablist"
      aria-label="Choose an action"
      className="relative grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:bg-slate-950"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition-colors duration-150 ${
              active ? "text-charcoal dark:text-white" : "text-slate-600 hover:text-charcoal dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── OAuth buttons ───────────────────────────────────────────────────────*/
export function OAuthButton({
  label,
  onClick,
  provider,
  disabled,
}: {
  label: string;
  onClick: () => void;
  provider: "oauth_google" | "oauth_apple";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium text-charcoal shadow-sm transition-[transform,background-color] duration-150 ease-out hover:bg-slate-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
    >
      {provider === "oauth_google" ? (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ) : (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      )}
      {label}
    </button>
  );
}

/* ── OTP: six auto-advancing cells with paste, auto-submit, shake-on-error ─
 * The value is a compact digit string; cell i renders value[i]. Focus advances
 * as digits land, paste fills all cells, reaching six auto-submits, and a
 * failed attempt shakes (unless reduced motion) and re-focuses the first cell. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const reduced = useReducedMotion();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [shaking, setShaking] = useState(false);
  const wasError = useRef(false);

  const focusCell = (i: number) => {
    const idx = Math.max(0, Math.min(5, i));
    const el = refs.current[idx];
    el?.focus();
    el?.select();
  };

  useEffect(() => {
    if (autoFocus) focusCell(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  useEffect(() => {
    if (error && !wasError.current) {
      focusCell(0);
      if (!reduced) {
        setShaking(true);
        const t = setTimeout(() => setShaking(false), 340);
        wasError.current = true;
        return () => clearTimeout(t);
      }
    }
    wasError.current = Boolean(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, reduced]);

  const emit = (next: string) => {
    onChange(next);
    if (next.length === 6) onComplete(next);
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") return;
    if (digits.length > 1) {
      const next = (value.slice(0, i) + digits).replace(/\D/g, "").slice(0, 6);
      emit(next);
      focusCell(next.length);
      return;
    }
    const next = (value.slice(0, i) + digits + value.slice(i + 1)).slice(0, 6);
    emit(next);
    focusCell(i + 1);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
        focusCell(i);
      } else {
        onChange(value.slice(0, Math.max(0, i - 1)) + value.slice(i));
        focusCell(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusCell(i + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    emit(pasted);
    focusCell(pasted.length);
  };

  return (
    <div className={`flex gap-2 ${shaking ? "auth-shake" : ""}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={error || undefined}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`h-12 min-w-0 flex-1 rounded-xl border bg-white text-center text-lg font-semibold text-charcoal outline-none transition-[border-color,box-shadow] duration-150 focus:border-seafoam-500 focus:ring-2 focus:ring-seafoam-400/40 disabled:opacity-60 dark:bg-slate-800 dark:text-white ${
            error ? "border-red-300 dark:border-red-800" : "border-slate-300 dark:border-slate-700"
          }`}
        />
      ))}
    </div>
  );
}
