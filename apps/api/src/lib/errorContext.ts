/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request buffer of logger.error/logger.warn calls, so a single global
 * middleware (see index.ts) can flush them all to the admin error feed
 * (`error_logs`) without every call site needing to know about `recordError`.
 *
 * Also keeps a per-request breadcrumb trail (every logger.info/warn/error,
 * in order) and the request start time, so a flushed row can carry the full
 * "what happened leading up to this" picture for the admin error feed.
 *
 * IMPORTANT: this module must never import `./logger` — logger.ts imports
 * FROM this module (to call captureLoggedError/addBreadcrumb), and a reverse
 * import would create a circular dependency.
 */

export type BufferedLevel = "error" | "warn";
export type BreadcrumbLevel = "info" | "warn" | "error";

export interface BufferedEntry {
  level: BufferedLevel;
  message: string;
  err: unknown;
  data: unknown;
  timestamp: string;
}

export interface Breadcrumb {
  ts: string;
  level: BreadcrumbLevel;
  msg: string;
  data: unknown;
}

interface ErrorCaptureStore {
  entries: BufferedEntry[];
  seen: Set<string>;
  breadcrumbs: Breadcrumb[];
  startedAt: string;
  /** Reference ID (ERR-XXXXXXXX) shown to the customer for a 5xx response,
   * set from app.onError so the flushed error_logs row uses the exact same
   * code the customer saw. */
  responseReference: string | null;
}

const MAX_ENTRIES_PER_REQUEST = 50;
const MAX_BREADCRUMBS_PER_REQUEST = 50;

const als = new AsyncLocalStorage<ErrorCaptureStore>();

/**
 * Run `fn` inside a fresh error-capture context. Any `logger.error`/
 * `logger.warn` calls made during `fn` (including across `await`
 * boundaries) get buffered and can later be drained with
 * `drainErrorBuffer()`. `logger.info/warn/error` calls also get recorded as
 * breadcrumbs, retrievable with `getBreadcrumbs()`.
 */
export function runWithErrorCapture<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const store: ErrorCaptureStore = {
    entries: [],
    seen: new Set(),
    breadcrumbs: [],
    startedAt: new Date().toISOString(),
    responseReference: null,
  };
  return als.run(store, fn);
}

/**
 * Record a logged error/warning against the active request's buffer, if
 * any. Deduped per request by `${level}:${message}` so the same failure
 * logged multiple times within one request produces a single row. Never
 * throws — logging must never be able to break the caller.
 */
export function captureLoggedError(
  level: BufferedLevel,
  message: string,
  err: unknown,
  data: unknown
): void {
  try {
    const store = als.getStore();
    if (!store) return;
    if (store.entries.length >= MAX_ENTRIES_PER_REQUEST) return;

    const key = `${level}:${message}`;
    if (store.seen.has(key)) return;
    store.seen.add(key);

    store.entries.push({
      level,
      message,
      err,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* buffering must never throw */
  }
}

/**
 * Return and clear the active request's buffered entries. Returns `[]` if
 * there is no active capture context.
 */
export function drainErrorBuffer(): BufferedEntry[] {
  try {
    const store = als.getStore();
    if (!store) return [];
    const drained = store.entries;
    store.entries = [];
    store.seen = new Set();
    return drained;
  } catch {
    return [];
  }
}

/**
 * Append a breadcrumb to the active request's trail. Called by logger.ts on
 * every info/warn/error. Not deduped (unlike the error buffer) — breadcrumbs
 * are a timeline, so repeats matter. Capped at MAX_BREADCRUMBS_PER_REQUEST;
 * never throws.
 */
export function addBreadcrumb(level: BreadcrumbLevel, msg: string, data: unknown): void {
  try {
    const store = als.getStore();
    if (!store) return;
    if (store.breadcrumbs.length >= MAX_BREADCRUMBS_PER_REQUEST) return;
    store.breadcrumbs.push({ ts: new Date().toISOString(), level, msg, data });
  } catch {
    /* buffering must never throw */
  }
}

/** Return the active request's breadcrumb trail (does not clear it). */
export function getBreadcrumbs(): Breadcrumb[] {
  try {
    return als.getStore()?.breadcrumbs ?? [];
  } catch {
    return [];
  }
}

/** ISO timestamp of when the active request's capture context started. */
export function getStartedAt(): string | null {
  try {
    return als.getStore()?.startedAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Stash the reference ID shown to the customer on a 5xx response (set from
 * app.onError) so the flushed error_logs row for the same incident uses the
 * identical code.
 */
export function setResponseReference(reference: string): void {
  try {
    const store = als.getStore();
    if (store) store.responseReference = reference;
  } catch {
    /* never throw */
  }
}

/** Read back the reference ID stashed by `setResponseReference`, if any. */
export function getResponseReference(): string | null {
  try {
    return als.getStore()?.responseReference ?? null;
  } catch {
    return null;
  }
}
