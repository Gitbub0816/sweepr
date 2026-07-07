/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

// Reads the same consent record written by <CookieConsent /> and decides
// whether it's OK to start analytics. Keep the storage key and shape in sync
// with apps/marketing/src/components/CookieConsent.tsx.
const STORAGE_KEY = "sweepr_cookie_consent";

interface ConsentRecord {
  choice: "all" | "essential" | "custom";
  analytics: boolean;
  marketing: boolean;
  at: string;
}

function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConsentRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Global Privacy Control: a browser/extension signal that means "treat me as
 * opted out of sale/sharing and non-essential tracking." When present and on,
 * we never start analytics regardless of any stored consent.
 */
function gpcSignaled(): boolean {
  try {
    return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function hasAnalyticsConsent(): boolean {
  if (gpcSignaled()) return false;
  return readConsent()?.analytics === true;
}

/** Call once at startup: only initializes analytics if consent already allows it. */
export async function initAnalyticsIfConsented(initAnalytics: () => Promise<void> | void): Promise<void> {
  if (hasAnalyticsConsent()) await initAnalytics();
}
