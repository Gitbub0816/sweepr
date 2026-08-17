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
 * Pure helpers shared by the sweepr-analytics worker (ingest/redirect), the
 * API's admin Site Analytics routes, and their tests. No I/O here — anything
 * that touches the network or DB lives in the worker/API.
 */

// ---------------------------------------------------------------------------
// Tracking-link codes
// ---------------------------------------------------------------------------

/** 2–64 chars, alphanumeric with inner hyphens/underscores (URL-safe slug). */
export function isValidLinkCode(code: string): boolean {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/i.test(code) && code.length >= 2;
}

/** Slugify a label into a link code ("Facebook Spring '26" → "facebook-spring-26"). */
export function slugifyLinkCode(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Random URL-safe suffix used to de-collide generated codes. */
export function randomCodeSuffix(len = 4): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no lookalikes
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// ---------------------------------------------------------------------------
// Redirect destination validation (anti open-redirect)
// ---------------------------------------------------------------------------

const ALLOWED_DEST_HOST = /^(?:[a-z0-9-]+\.)*getsweepr\.com$/i;

/**
 * Normalize a tracking-link destination to an absolute https URL on a
 * *.getsweepr.com host, or null if it can't be made safe. Accepts a path
 * ("/pricing?x=1") or an absolute URL. This is the single gate that keeps
 * /go/{code} from ever becoming an open redirect — the worker re-validates
 * at redirect time even though the admin API validates at write time.
 */
export function normalizeDestination(dest: string): string | null {
  const trimmed = (dest ?? "").trim();
  if (!trimmed) return null;
  // Protocol-relative ("//evil.com") and backslash tricks are rejected by
  // resolving against the marketing origin and re-checking the host.
  if (/^[\\/]{2}/.test(trimmed)) return null;
  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, "https://getsweepr.com")
      : new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_DEST_HOST.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// User-agent parsing (compact, dependency-free)
// ---------------------------------------------------------------------------

export interface ParsedUserAgent {
  browser: string;
  browserVer: string | null;
  os: string;
  osVer: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "bot";
  isBot: boolean;
}

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|monitor|scrape|curl|wget|python-requests|httpclient|facebookexternalhit|preview/i;

/** Order matters: more specific tokens are matched before generic ones. */
const BROWSERS: Array<[string, RegExp]> = [
  ["Edge", /edg(?:e|a|ios)?\/([\d.]+)/i],
  ["Opera", /(?:opr|opera)[\s/]([\d.]+)/i],
  ["Samsung Internet", /samsungbrowser\/([\d.]+)/i],
  ["Firefox", /(?:firefox|fxios)\/([\d.]+)/i],
  ["Chrome", /(?:chrome|crios)\/([\d.]+)/i],
  ["Safari", /version\/([\d.]+).*safari/i],
];

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua ?? "";
  const isBot = BOT_RE.test(s) || s.trim() === "";

  let browser = "Other";
  let browserVer: string | null = null;
  for (const [name, re] of BROWSERS) {
    const m = s.match(re);
    if (m) {
      browser = name;
      browserVer = m[1]?.split(".").slice(0, 2).join(".") ?? null;
      break;
    }
  }

  let os = "Other";
  let osVer: string | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/iphone os ([\d_]+)|ipad; cpu os ([\d_]+)/i))) {
    os = "iOS";
    osVer = (m[1] ?? m[2])?.replace(/_/g, ".").split(".").slice(0, 2).join(".") ?? null;
  } else if (/ipad|iphone|ipod/i.test(s)) {
    os = "iOS";
  } else if ((m = s.match(/android ([\d.]+)/i))) {
    os = "Android";
    osVer = m[1].split(".").slice(0, 2).join(".");
  } else if (/android/i.test(s)) {
    os = "Android";
  } else if ((m = s.match(/windows nt ([\d.]+)/i))) {
    os = "Windows";
    // Windows 11 also reports NT 10.0 — not distinguishable from the UA.
    osVer = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[m[1]] ?? m[1];
  } else if ((m = s.match(/mac os x ([\d_.]+)/i))) {
    os = "macOS";
    osVer = m[1].replace(/_/g, ".").split(".").slice(0, 2).join(".");
  } else if (/macintosh/i.test(s)) {
    os = "macOS";
  } else if (/cros/i.test(s)) {
    os = "ChromeOS";
  } else if (/linux/i.test(s)) {
    os = "Linux";
  }

  let deviceType: ParsedUserAgent["deviceType"];
  if (isBot) {
    deviceType = "bot";
  } else if (/ipad|(?:android(?!.*mobile))|tablet/i.test(s)) {
    deviceType = "tablet";
  } else if (/mobi|iphone|ipod|android/i.test(s)) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  return { browser, browserVer, os, osVer, deviceType, isBot };
}

// ---------------------------------------------------------------------------
// Referrer → source classification (organic attribution fallback)
// ---------------------------------------------------------------------------

const REFERRER_SOURCES: Array<[RegExp, string]> = [
  [/(?:^|\.)google\./i, "google"],
  [/(?:^|\.)bing\.com$/i, "bing"],
  [/(?:^|\.)duckduckgo\.com$/i, "duckduckgo"],
  [/(?:^|\.)search\.yahoo\.com$/i, "yahoo"],
  [/(?:^|\.)(?:chatgpt|openai)\.com$/i, "chatgpt"],
  [/(?:^|\.)perplexity\.ai$/i, "perplexity"],
  [/(?:^|\.)claude\.ai$/i, "claude"],
  [/(?:^|\.)gemini\.google\.com$/i, "gemini"],
  [/(?:^|\.)(?:facebook|fb)\.com$/i, "facebook"],
  [/(?:^|\.)instagram\.com$/i, "instagram"],
  [/(?:^|\.)nextdoor\.com$/i, "nextdoor"],
  [/(?:^|\.)(?:twitter|x)\.com$/i, "x"],
  [/(?:^|\.)t\.co$/i, "x"],
  [/(?:^|\.)linkedin\.com$/i, "linkedin"],
  [/(?:^|\.)tiktok\.com$/i, "tiktok"],
  [/(?:^|\.)reddit\.com$/i, "reddit"],
  [/(?:^|\.)pinterest\./i, "pinterest"],
  [/(?:^|\.)youtube\.com$/i, "youtube"],
  [/(?:^|\.)yelp\.com$/i, "yelp"],
];

/**
 * Classify a document.referrer into a coarse source name. Returns null for
 * empty/self referrers (direct) and "referral:<host>" for unknown sites.
 */
export function referrerToSource(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    if (/(?:^|\.)getsweepr\.com$/i.test(host)) return null; // internal nav
    for (const [re, source] of REFERRER_SOURCES) {
      if (re.test(host)) return source;
    }
    return `referral:${host.toLowerCase()}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ingest payload shape (shared between tracker, worker, and tests)
// ---------------------------------------------------------------------------

/** Client-supplied portion of one analytics event (worker adds geo/UA/etc). */
export interface SiteEventInput {
  type: string;
  app: string;
  ts?: number;
  path?: string;
  referrer?: string;
  source?: string;
  campaignId?: string;
  linkCode?: string;
  clickTarget?: string;
  clickHref?: string;
  clickText?: string;
  screenW?: number;
  screenH?: number;
  viewportW?: number;
  viewportH?: number;
  language?: string;
  meta?: Record<string, unknown>;
}

export const SITE_EVENT_TYPES = new Set(["pageview", "click", "link_hit", "custom"]);
export const SITE_APPS = new Set(["marketing", "customer", "cleaner", "legal", "status", "business"]);

/** Hard caps applied at ingest so a hostile client can't bloat rows. */
export const INGEST_LIMITS = {
  maxBatch: 25,
  maxString: 512,
  maxClickText: 120,
  maxMetaJson: 2048,
} as const;
