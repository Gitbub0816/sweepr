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
 * Sweepr first-party site tracker — feeds the admin Site Analytics dashboard
 * via the sweepr-analytics worker (metrics.getsweepr.com). Completely separate
 * from PostHog product analytics (analytics.ts): this is OUR pipeline, OUR
 * database, no third party ever sees the events.
 *
 * Privacy model (mirrors the Privacy & Cookie Policies — keep them in sync):
 *  • Default mode is COOKIELESS: no cookies, no localStorage. Visitor/session
 *    ids live in sessionStorage only (tab-scoped, gone when the tab closes),
 *    so there is no cross-visit identity without consent.
 *  • When the visitor grants analytics consent via the cookie banner, ids are
 *    persisted as first-party `swa_*` cookies (registered in cookieEngine.ts
 *    under the "analytics" category) so return visits can be recognized.
 *    The cookie engine deletes them automatically if consent is withdrawn.
 *  • Global Privacy Control keeps the tracker permanently in cookieless mode
 *    (getCookieConsent() already treats GPC as analytics denied).
 *  • The server stores a salted hash of the IP, never the IP itself.
 */

import {
  referrerToSource,
  type SiteEventInput,
} from "@sweepr/utils";
import { setCookie, getCookie, getCookieConsent } from "./cookieEngine";

export type SiteApp = "marketing" | "customer" | "cleaner" | "legal" | "status" | "business";

const DEFAULT_ENDPOINT = "https://metrics.getsweepr.com/collect";
const VID_COOKIE = "swa_vid";
const SID_COOKIE = "swa_sid";
const ATTR_COOKIE = "swa_attr";
const SESSION_KEY = "swa_s";
const VID_MAX_AGE = 60 * 60 * 24 * 395; // 13 months
const SID_MAX_AGE = 60 * 30; // 30-minute sliding session
const ATTR_MAX_AGE = 60 * 60 * 24 * 90; // 90-day attribution window
const FLUSH_MS = 5_000;
const FLUSH_AT = 12;

interface Attribution {
  source?: string;
  campaignId?: string;
  linkCode?: string;
}

interface TrackerState {
  app: SiteApp;
  endpoint: string;
  vid: string;
  sid: string;
  attr: Attribution;
  queue: SiteEventInput[];
  lastPath: string | null;
  timer: number | null;
}

let state: TrackerState | null = null;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function readSessionIds(): { vid: string; sid: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { vid?: string; sid?: string };
    if (parsed.vid && parsed.sid) return { vid: parsed.vid, sid: parsed.sid };
  } catch {
    /* storage unavailable */
  }
  return null;
}

function writeSessionIds(vid: string, sid: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ vid, sid }));
  } catch {
    /* fine — ids just won't survive a reload */
  }
}

/**
 * Resolve visitor/session ids. Consent-granted visitors get durable cookie
 * ids (created on first need); everyone else gets tab-scoped ids. setCookie
 * itself refuses to write without consent, so this can never leak an id into
 * a cookie for a non-consenting visitor.
 */
function resolveIds(): { vid: string; sid: string } {
  const consented = getCookieConsent().analytics;
  if (consented) {
    const existing = readSessionIds();
    // Prefer cookie ids; adopt tab ids (mid-session consent upgrade) so the
    // session isn't split in two when the visitor accepts the banner.
    const vid = getCookie(VID_COOKIE) ?? existing?.vid ?? newId();
    const sid = getCookie(SID_COOKIE) ?? existing?.sid ?? newId();
    setCookie(VID_COOKIE, vid, { category: "analytics", maxAge: VID_MAX_AGE, domainWide: true });
    setCookie(SID_COOKIE, sid, { category: "analytics", maxAge: SID_MAX_AGE, domainWide: true });
    writeSessionIds(vid, sid);
    return { vid, sid };
  }
  const existing = readSessionIds();
  if (existing) return existing;
  const ids = { vid: newId(), sid: newId() };
  writeSessionIds(ids.vid, ids.sid);
  return ids;
}

/** Sliding session: refresh the session cookie's Max-Age while active. */
function touchSession(): void {
  if (!state) return;
  if (getCookieConsent().analytics) {
    setCookie(SID_COOKIE, state.sid, { category: "analytics", maxAge: SID_MAX_AGE, domainWide: true });
    setCookie(VID_COOKIE, state.vid, { category: "analytics", maxAge: VID_MAX_AGE, domainWide: true });
  }
}

/**
 * Landing attribution, priority: our tracking-link params (appended by the
 * /go/{code} redirector) → UTM params → referrer classification. Stored so
 * later pageviews/clicks in the window still carry the source; a new explicit
 * source overwrites (last-touch).
 */
function resolveAttribution(url: URL): Attribution {
  const stored = ((): Attribution => {
    try {
      const raw = getCookie(ATTR_COOKIE) ?? sessionStorage.getItem(SESSION_KEY + "_attr");
      return raw ? (JSON.parse(raw) as Attribution) : {};
    } catch {
      return {};
    }
  })();

  const p = url.searchParams;
  const fresh: Attribution = {};
  const linkCode = p.get("swl");
  const source = p.get("sws") ?? p.get("utm_source");
  const campaign = p.get("swc") ?? p.get("utm_campaign") ?? p.get("utm_id");
  if (linkCode) fresh.linkCode = linkCode;
  if (source) fresh.source = source.slice(0, 64);
  if (campaign) fresh.campaignId = campaign.slice(0, 64);
  if (!fresh.source && !fresh.linkCode) {
    const organic = referrerToSource(document.referrer);
    if (organic) fresh.source = organic;
  }

  const attr = fresh.source || fresh.linkCode ? { ...stored, ...fresh } : stored;
  try {
    const json = JSON.stringify(attr);
    if (!setCookie(ATTR_COOKIE, json, { category: "analytics", maxAge: ATTR_MAX_AGE, domainWide: true })) {
      sessionStorage.setItem(SESSION_KEY + "_attr", json);
    }
  } catch {
    /* ignore */
  }
  return attr;
}

/** Strip our tracking params from the address bar after capture. */
function cleanUrl(url: URL): void {
  const params = ["swl", "sws", "swc"];
  if (!params.some((k) => url.searchParams.has(k))) return;
  for (const k of params) url.searchParams.delete(k);
  try {
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

function baseEvent(type: string): SiteEventInput {
  const s = state!;
  return {
    type,
    app: s.app,
    ts: Date.now(),
    path: location.pathname,
    source: s.attr.source,
    campaignId: s.attr.campaignId,
    linkCode: s.attr.linkCode,
    language: navigator.language,
    screenW: screen.width,
    screenH: screen.height,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
  };
}

function enqueue(event: SiteEventInput): void {
  if (!state) return;
  state.queue.push(event);
  touchSession();
  if (state.queue.length >= FLUSH_AT) {
    flush(false);
  } else if (state.timer === null) {
    state.timer = window.setTimeout(() => flush(false), FLUSH_MS);
  }
}

function flush(unloading: boolean): void {
  if (!state || state.queue.length === 0) return;
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const body = JSON.stringify({
    vid: state.vid,
    sid: state.sid,
    events: state.queue.splice(0),
  });
  // A plain-string body is a CORS "simple request" — no preflight, and
  // sendBeacon delivery survives page unload.
  try {
    if (unloading && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(state.endpoint, body);
    } else {
      void fetch(state.endpoint, {
        method: "POST",
        body,
        keepalive: true,
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
      }).catch(() => undefined);
    }
  } catch {
    /* analytics must never break the page */
  }
}

function pageview(): void {
  if (!state) return;
  if (state.lastPath === location.pathname) return;
  state.lastPath = location.pathname;
  enqueue({
    ...baseEvent("pageview"),
    referrer: document.referrer ? document.referrer.slice(0, 512) : undefined,
    meta: document.title ? { title: document.title.slice(0, 120) } : undefined,
  });
}

function describeTarget(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    !id && typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return (tag + id + cls).slice(0, 160);
}

function onClick(e: MouseEvent): void {
  if (!state) return;
  const el = (e.target as Element | null)?.closest?.("a, button, [role='button']");
  if (!el) return;
  const href = el instanceof HTMLAnchorElement ? el.href : undefined;
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  enqueue({
    ...baseEvent("click"),
    clickTarget: describeTarget(el),
    clickHref: href?.slice(0, 512),
    clickText: text || undefined,
  });
}

/** SPA route changes: patch pushState/replaceState + listen to popstate. */
function watchRoutes(): void {
  const fire = () => setTimeout(pageview, 0); // let the SPA update the title
  const wrap = (fn: History["pushState"]) =>
    function (this: History, ...args: Parameters<History["pushState"]>) {
      fn.apply(this, args);
      fire();
    };
  history.pushState = wrap(history.pushState.bind(history));
  history.replaceState = wrap(history.replaceState.bind(history));
  window.addEventListener("popstate", fire);
}

/**
 * Start the site tracker. Call once from an app's main.tsx; re-init is a
 * no-op. Never throws.
 */
export function initSiteTracker(opts: { app: SiteApp; endpoint?: string }): void {
  try {
    if (typeof window === "undefined" || state) return;
    // Skip local dev and automated browsers — this pipeline is for real traffic.
    if (/^(localhost|127\.|0\.0\.0\.0|192\.168\.)/.test(location.hostname)) return;
    if ((navigator as { webdriver?: boolean }).webdriver) return;

    const url = new URL(location.href);
    const ids = resolveIds();
    state = {
      app: opts.app,
      endpoint: opts.endpoint ?? DEFAULT_ENDPOINT,
      vid: ids.vid,
      sid: ids.sid,
      attr: {},
      queue: [],
      lastPath: null,
      timer: null,
    };
    state.attr = resolveAttribution(url);
    cleanUrl(url);

    watchRoutes();
    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush(true);
    });
    window.addEventListener("pagehide", () => flush(true));

    pageview();
  } catch {
    /* analytics must never break the page */
  }
}

/** Record a custom event (e.g. a conversion step) from app code. */
export function trackSiteEvent(name: string, meta?: Record<string, unknown>): void {
  try {
    if (!state) return;
    enqueue({ ...baseEvent("custom"), meta: { name, ...(meta ?? {}) } });
  } catch {
    /* never break the page */
  }
}
