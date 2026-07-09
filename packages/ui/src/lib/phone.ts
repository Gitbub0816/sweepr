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
 * US phone helpers. UI shows a human-friendly (XXX) XXX-XXXX mask while the
 * value we store/submit is always E.164 (+1XXXXXXXXXX). Keeping this in one
 * place means every phone input across the apps normalizes identically.
 */

/** Strip to digits and drop a leading US country code; returns ≤10 digits. */
export function usPhoneDigits(input: string): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Progressive display mask: "", "(41", "(415) 212", "(415) 212-3721". */
export function formatUsPhoneDisplay(input: string): string {
  const d = usPhoneDigits(input);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Convert any US entry to E.164 (+1XXXXXXXXXX), or null if not 10 digits. */
export function toE164US(input: string): string | null {
  const d = usPhoneDigits(input);
  return d.length === 10 ? `+1${d}` : null;
}

/** True when the value is a complete, valid US number. */
export function isCompleteUsPhone(input: string): boolean {
  return usPhoneDigits(input).length === 10;
}
