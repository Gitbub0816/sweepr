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
 * Shared client-side form validation. Mirrors the server's zod checks so users
 * get an immediate, friendly message before a request is ever sent — the server
 * remains the source of truth (never trust the client), this just fails fast.
 */

/** Pragmatic email shape check — matches the auth flow's validator. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * Validate an email field. Returns a user-facing error string, or null when
 * valid. Pass `{ required: false }` for optional fields (empty → valid).
 */
export function validateEmail(value: string, opts?: { required?: boolean }): string | null {
  const v = value.trim();
  if (!v) return opts?.required === false ? null : "Please enter your email address.";
  if (v.length > 254) return "That email address is too long.";
  if (!isValidEmail(v)) return "Please enter a valid email address.";
  return null;
}

/** Validate a required free-text field (summary/title). Returns error or null. */
export function validateText(
  value: string,
  opts: { min?: number; max: number; label?: string },
): string | null {
  const v = value.trim();
  const label = opts.label ?? "This field";
  if (opts.min && v.length < opts.min) return `${label} must be at least ${opts.min} characters.`;
  if (v.length > opts.max) return `${label} must be ${opts.max} characters or fewer.`;
  return null;
}

/** Loose North-American phone check for optional phone fields (empty → valid). */
export function validatePhone(value: string, opts?: { required?: boolean }): string | null {
  const v = value.trim();
  if (!v) return opts?.required ? "Please enter a phone number." : null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "Please enter a valid phone number.";
  return null;
}
