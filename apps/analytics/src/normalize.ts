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
 * Pure ingest-payload validation/normalization for the sweepr-analytics
 * worker. No I/O — unit-tested from apps/api/tests/site-analytics.test.ts.
 */

import {
  INGEST_LIMITS,
  SITE_APPS,
  SITE_EVENT_TYPES,
  type SiteEventInput,
} from "@sweepr/utils";

export interface NormalizedBatch {
  vid: string;
  sid: string;
  events: NormalizedEvent[];
}

export interface NormalizedEvent {
  occurred_at: string;
  app: string;
  event_type: string;
  path: string | null;
  referrer: string | null;
  source: string | null;
  campaign_id: string | null;
  link_code: string | null;
  click_target: string | null;
  click_href: string | null;
  click_text: string | null;
  screen_w: number | null;
  screen_h: number | null;
  viewport_w: number | null;
  viewport_h: number | null;
  language: string | null;
  meta: Record<string, unknown>;
}

const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
/** Client timestamps are advisory: clamp into [now - 10 min, now + 1 min]. */
const MAX_PAST_MS = 10 * 60_000;
const MAX_FUTURE_MS = 60_000;

function str(v: unknown, max: number = INGEST_LIMITS.maxString): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function dim(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000
    ? Math.round(v)
    : null;
}

function clampTs(ts: unknown, now: number): string {
  const t = typeof ts === "number" && Number.isFinite(ts) ? ts : now;
  return new Date(Math.min(now + MAX_FUTURE_MS, Math.max(now - MAX_PAST_MS, t))).toISOString();
}

function normalizeMeta(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  try {
    const json = JSON.stringify(v);
    if (json.length > INGEST_LIMITS.maxMetaJson) return {};
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Validate a raw /collect body. Returns null when the payload is not usable
 * at all; otherwise a batch with only the valid events (bad ones dropped).
 */
export function normalizeBatch(raw: unknown, now = Date.now()): NormalizedBatch | null {
  if (raw === null || typeof raw !== "object") return null;
  const body = raw as { vid?: unknown; sid?: unknown; events?: unknown };
  const vid = typeof body.vid === "string" && ID_RE.test(body.vid) ? body.vid : null;
  const sid = typeof body.sid === "string" && ID_RE.test(body.sid) ? body.sid : null;
  if (!vid || !sid || !Array.isArray(body.events)) return null;

  const events: NormalizedEvent[] = [];
  for (const item of body.events.slice(0, INGEST_LIMITS.maxBatch)) {
    if (item === null || typeof item !== "object") continue;
    const e = item as SiteEventInput;
    const app = typeof e.app === "string" && SITE_APPS.has(e.app) ? e.app : null;
    const type = typeof e.type === "string" && SITE_EVENT_TYPES.has(e.type) ? e.type : null;
    if (!app || !type) continue;
    events.push({
      occurred_at: clampTs(e.ts, now),
      app,
      event_type: type,
      path: str(e.path),
      referrer: str(e.referrer),
      source: str(e.source, 64),
      campaign_id: str(e.campaignId, 64),
      link_code: str(e.linkCode, 64),
      click_target: str(e.clickTarget, 160),
      click_href: str(e.clickHref),
      click_text: str(e.clickText, INGEST_LIMITS.maxClickText),
      screen_w: dim(e.screenW),
      screen_h: dim(e.screenH),
      viewport_w: dim(e.viewportW),
      viewport_h: dim(e.viewportH),
      language: str(e.language, 35),
      meta: normalizeMeta(e.meta),
    });
  }
  if (events.length === 0) return null;
  return { vid, sid, events };
}

/** Origins allowed to post events — every Sweepr web property. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return /^https:\/\/(?:[a-z0-9-]+\.)*getsweepr\.com$/i.test(origin);
}

/** Parse the ids we care about out of a Cookie header (redirect attribution). */
export function parseTrackerCookies(header: string | null | undefined): {
  vid: string | null;
  sid: string | null;
} {
  const out: { vid: string | null; sid: string | null } = { vid: null, sid: null };
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === "swa_vid" && ID_RE.test(value)) out.vid = value;
    if (name === "swa_sid" && ID_RE.test(value)) out.sid = value;
  }
  return out;
}
