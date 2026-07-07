/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a comma/semicolon-separated list of email addresses. Empty string is invalid (required field). */
export function isValidEmailList(value: string): boolean {
  const parts = value
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => EMAIL_RE.test(p));
}

/** Optional email list — empty is OK (e.g. Cc), but if non-empty every entry must be valid. */
export function isValidOptionalEmailList(value: string): boolean {
  if (!value.trim()) return true;
  return isValidEmailList(value);
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDay > 365 ? "numeric" : undefined });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function quoteBody(m: { created_at: string; sender_name: string | null; sender_email: string; to_email: string | null; direction: "inbound" | "outbound"; body_text: string }): string {
  const who = m.direction === "inbound" ? (m.sender_name ? `${m.sender_name} <${m.sender_email}>` : m.sender_email) : (m.to_email ?? "");
  const quoted = (m.body_text || "").split("\n").map((line) => `> ${line}`).join("\n");
  return `\n\nOn ${fullDate(m.created_at)}, ${who} wrote:\n${quoted}`;
}
