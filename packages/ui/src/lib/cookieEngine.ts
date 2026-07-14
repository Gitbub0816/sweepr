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
 * Sweepr cookie engine — the single gate every non-HttpOnly cookie on our
 * sites passes through.
 *
 * Why: consent isn't just a banner. Third-party scripts (Stripe, PostHog,
 * future ad pixels) drop cookies of their own, so the engine does two jobs:
 *
 *  1. WRITE PATH — `setCookie` refuses to write a cookie whose category the
 *     visitor hasn't consented to. All first-party code must use it.
 *  2. ENFORCEMENT PATH — `enforceCookiePolicy()` sweeps `document.cookie`
 *     against the classification registry and deletes anything belonging to
 *     a denied category. Run at load and after every consent change, it
 *     keeps third-party cookies honest too.
 *
 * Categories (aligned with the Cookie Policy at legal.getsweepr.com):
 *  - essential: sign-in, security, fraud prevention. Always on; a site
 *    can't function without them, and consent laws don't require opt-in.
 *  - functional: preferences (theme, language) and payment-session helpers.
 *    On by default, disclosed in the policy.
 *  - analytics: product analytics (PostHog). Opt-in via the consent banner
 *    (the existing `sweepr_cookie_consent` choice), GPC honored.
 *  - advertising: ad/measurement cookies. DENIED until explicitly granted —
 *    we run no ads today, so this category exists to fail closed when an ad
 *    partner's tag shows up before consent tooling catches up with it.
 */

import { CONSENT_KEY, getAnalyticsConsent } from "./analytics";

export type CookieCategory = "essential" | "functional" | "analytics" | "advertising";

export const ADVERTISING_CONSENT_KEY = "sweepr_ads_consent";

interface CookieRule {
  /** Prefix match unless `exact`. */
  pattern: string;
  exact?: boolean;
  category: CookieCategory;
  provider: string;
  purpose: string;
}

/**
 * Classification registry. Order matters: first match wins. Keep this in
 * sync with the Cookie Policy document whenever a new integration lands.
 */
export const COOKIE_REGISTRY: CookieRule[] = [
  // ── Sweepr first-party ──
  { pattern: "sweepr_", category: "essential", provider: "Sweepr", purpose: "Session, consent record, and security state" },
  { pattern: "__Host-sweepr_", category: "essential", provider: "Sweepr", purpose: "Signed-in session (host-locked)" },
  { pattern: "theme", exact: true, category: "functional", provider: "Sweepr", purpose: "Light/dark preference" },
  { pattern: "lang", exact: true, category: "functional", provider: "Sweepr", purpose: "Language preference" },
  // ── Clerk (authentication) ──
  { pattern: "__session", category: "essential", provider: "Clerk", purpose: "Sign-in session" },
  { pattern: "__client", category: "essential", provider: "Clerk", purpose: "Sign-in device state" },
  { pattern: "__clerk", category: "essential", provider: "Clerk", purpose: "Sign-in infrastructure" },
  { pattern: "__cf", category: "essential", provider: "Cloudflare", purpose: "Bot and abuse protection" },
  { pattern: "cf_clearance", category: "essential", provider: "Cloudflare", purpose: "Security challenge clearance" },
  // ── Stripe (payments) ──
  // Stripe.js sets these for fraud prevention on card payments. They are
  // strictly payment-security cookies, not tracking: classified functional,
  // disclosed in the Cookie Policy, and never used for advertising.
  { pattern: "__stripe_mid", category: "functional", provider: "Stripe", purpose: "Payment fraud prevention (device)" },
  { pattern: "__stripe_sid", category: "functional", provider: "Stripe", purpose: "Payment fraud prevention (session)" },
  { pattern: "m", exact: true, category: "functional", provider: "Stripe", purpose: "Payment fraud signals" },
  // ── PostHog (analytics, consent-gated) ──
  { pattern: "ph_", category: "analytics", provider: "PostHog", purpose: "Product analytics" },
  // ── Advertising (none active today; fail closed if any appear) ──
  { pattern: "_ga", category: "advertising", provider: "Google", purpose: "Ads/analytics measurement" },
  { pattern: "_gid", category: "advertising", provider: "Google", purpose: "Ads/analytics measurement" },
  { pattern: "_gcl_", category: "advertising", provider: "Google", purpose: "Ad click attribution" },
  { pattern: "_fbp", category: "advertising", provider: "Meta", purpose: "Ad attribution" },
  { pattern: "_fbc", category: "advertising", provider: "Meta", purpose: "Ad click attribution" },
  { pattern: "fr", exact: true, category: "advertising", provider: "Meta", purpose: "Ad delivery" },
  { pattern: "IDE", exact: true, category: "advertising", provider: "Google DoubleClick", purpose: "Ad targeting" },
  { pattern: "_ttp", category: "advertising", provider: "TikTok", purpose: "Ad attribution" },
  { pattern: "_uet", category: "advertising", provider: "Microsoft", purpose: "Ad attribution" },
  { pattern: "_pin_", category: "advertising", provider: "Pinterest", purpose: "Ad attribution" },
];

/** Classify a cookie name. Unknown cookies default to "advertising" so an
 * unrecognized third-party cookie is swept unless consent covers it —
 * fail closed, never open. */
export function classifyCookie(name: string): CookieRule {
  for (const rule of COOKIE_REGISTRY) {
    if (rule.exact ? name === rule.pattern : name.startsWith(rule.pattern)) return rule;
  }
  return { pattern: name, category: "advertising", provider: "Unknown", purpose: "Unclassified third-party cookie" };
}

function gpcActive(): boolean {
  return (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** Current effective consent per category. */
export function getCookieConsent(): Record<CookieCategory, boolean> {
  let ads = false;
  try {
    ads = localStorage.getItem(ADVERTISING_CONSENT_KEY) === "granted";
  } catch {
    /* storage unavailable → denied */
  }
  const gpc = gpcActive();
  return {
    essential: true,
    functional: true,
    analytics: !gpc && getAnalyticsConsent() === "granted",
    advertising: !gpc && ads,
  };
}

export function setAdvertisingConsent(granted: boolean): void {
  try {
    localStorage.setItem(ADVERTISING_CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    /* ignore */
  }
  enforceCookiePolicy();
}

export interface SetCookieOptions {
  category: CookieCategory;
  /** Max age in seconds. Omit for a session cookie. */
  maxAge?: number;
  path?: string;
  sameSite?: "Lax" | "Strict";
  /** Set true only when the cookie must be readable on subdomains. */
  domainWide?: boolean;
}

/**
 * Consent-gated cookie write. Returns false (and writes nothing) when the
 * category isn't consented. Always Secure; SameSite=Lax by default.
 */
export function setCookie(name: string, value: string, opts: SetCookieOptions): boolean {
  if (!getCookieConsent()[opts.category]) return false;
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? "/"}`,
    `SameSite=${opts.sameSite ?? "Lax"}`,
    "Secure",
  ];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.domainWide) parts.push(`Domain=.${location.hostname.split(".").slice(-2).join(".")}`);
  document.cookie = parts.join("; ");
  return true;
}

export function getCookie(name: string): string | null {
  const target = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(target)) return decodeURIComponent(part.slice(target.length));
  }
  return null;
}

function expire(name: string, domain?: string): void {
  const base = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  document.cookie = base;
  if (domain) document.cookie = `${base}; Domain=${domain}`;
}

export function deleteCookie(name: string): void {
  const apex = `.${location.hostname.split(".").slice(-2).join(".")}`;
  expire(name);
  expire(name, apex);
  expire(name, location.hostname);
}

/** Current cookie inventory with classification — feeds the policy page and
 * makes audits trivial. */
export function cookieInventory(): Array<{ name: string; category: CookieCategory; provider: string; purpose: string }> {
  return document.cookie
    .split("; ")
    .filter(Boolean)
    .map((pair) => {
      const name = decodeURIComponent(pair.split("=")[0]);
      const rule = classifyCookie(name);
      return { name, category: rule.category, provider: rule.provider, purpose: rule.purpose };
    });
}

/**
 * Sweep document.cookie and delete every cookie whose category the visitor
 * has not consented to. Safe to call often; call it at page load and after
 * every consent change.
 */
export function enforceCookiePolicy(): void {
  const consent = getCookieConsent();
  for (const { name, category } of cookieInventory()) {
    if (!consent[category]) deleteCookie(name);
  }
}

/** Boot the engine: immediate sweep plus a slow patrol that catches cookies
 * dropped later by lazily-loaded third-party scripts. */
export function initCookieEngine(): () => void {
  enforceCookiePolicy();
  const timer = window.setInterval(enforceCookiePolicy, 30_000);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_KEY || e.key === ADVERTISING_CONSENT_KEY) enforceCookiePolicy();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("storage", onStorage);
  };
}
