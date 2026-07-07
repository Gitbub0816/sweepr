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
 * Shared sanitizer for free-text fields that get stored and later rendered
 * (ticket bodies, review text, notes, names, addresses, etc).
 *
 * Intentionally does NOT HTML-escape — React (and other consumers) escape on
 * render, so escaping here would double-escape. This only:
 *   - strips control characters (including null bytes) that have no business
 *     being in stored text and can confuse downstream parsers/terminals,
 *   - collapses excessive whitespace runs,
 *   - trims leading/trailing whitespace,
 *   - caps length to a caller-supplied bound.
 */
export function sanitizeText(input: string, maxLen: number): string {
  const stripped = input
    // Strip C0/C1 control characters (incl. NUL) but keep \n and \t.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
    // Collapse runs of 3+ blank lines down to 2, and long horizontal
    // whitespace runs down to a single space.
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}
