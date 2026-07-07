/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import DOMPurify from "dompurify";

export function sanitizeText(dirty: string): string {
  if (typeof window === "undefined") return dirty;
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

interface SafeTextProps {
  text: string;
  className?: string;
}

export function SafeText({ text, className }: SafeTextProps) {
  return <span className={className}>{sanitizeText(text)}</span>;
}
