import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request buffer of logger.error/logger.warn calls, so a single global
 * middleware (see index.ts) can flush them all to the admin error feed
 * (`error_logs`) without every call site needing to know about `recordError`.
 *
 * IMPORTANT: this module must never import `./logger` — logger.ts imports
 * FROM this module (to call captureLoggedError), and a reverse import would
 * create a circular dependency.
 */

export type BufferedLevel = "error" | "warn";

export interface BufferedEntry {
  level: BufferedLevel;
  message: string;
  err: unknown;
  data: unknown;
  timestamp: string;
}

interface ErrorCaptureStore {
  entries: BufferedEntry[];
  seen: Set<string>;
}

const MAX_ENTRIES_PER_REQUEST = 50;

const als = new AsyncLocalStorage<ErrorCaptureStore>();

/**
 * Run `fn` inside a fresh error-capture context. Any `logger.error`/
 * `logger.warn` calls made during `fn` (including across `await`
 * boundaries) get buffered and can later be drained with
 * `drainErrorBuffer()`.
 */
export function runWithErrorCapture<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const store: ErrorCaptureStore = { entries: [], seen: new Set() };
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
