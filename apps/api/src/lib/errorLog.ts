import type { Sql } from "@sweepr/db";
import { logger } from "./logger";

export interface ErrorLogInput {
  source?: "server" | "client";
  app?: string | null;
  level?: "error" | "warn" | "fatal";
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  clerkId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  context?: Record<string, unknown>;
  /** Stable grouping hash — see `makeFingerprint`. */
  fingerprint?: string | null;
  /** Public "ERR-XXXXXXXX" code, shared with the customer on 5xx. */
  referenceId?: string | null;
  /** `err.name`, e.g. "TypeError", "NeonDbError", "AppError". */
  errorName?: string | null;
  /** AppError `.code`, or a Postgres SQLSTATE when present. */
  errorCode?: string | null;
  /** Wall-clock ms from request start to flush. */
  durationMs?: number | null;
}

/** Truncate long strings so a single error can't bloat the table. */
function trunc(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Persist an error to the admin error feed. Best-effort: never throws, so
 * logging an error can't itself break a request.
 */
export async function recordError(sql: Sql, input: ErrorLogInput): Promise<void> {
  try {
    await sql`
      INSERT INTO error_logs (
        source, app, level, message, stack, path, method,
        status_code, clerk_id, user_id, request_id, context,
        fingerprint, reference_id, error_name, error_code, duration_ms
      ) VALUES (
        ${input.source ?? "server"},
        ${input.app ?? null},
        ${input.level ?? "error"},
        ${trunc(input.message, 2000) ?? "Unknown error"},
        ${trunc(input.stack, 8000)},
        ${trunc(input.path, 512)},
        ${input.method ?? null},
        ${input.statusCode ?? null},
        ${trunc(input.clerkId, 128)},
        ${input.userId ?? null},
        ${trunc(input.requestId, 128)},
        ${JSON.stringify(input.context ?? {})},
        ${trunc(input.fingerprint, 32)},
        ${trunc(input.referenceId, 32)},
        ${trunc(input.errorName, 128)},
        ${trunc(input.errorCode, 64)},
        ${input.durationMs ?? null}
      )
    `;
  } catch (err) {
    // Swallow — the error feed must never take down the request path.
    logger.error("recordError failed", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reference IDs — short public codes shown to end users on 5xx responses.
// ─────────────────────────────────────────────────────────────────────────

// No 0/O/1/I — avoids ambiguity when a customer reads the code aloud/copies it.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** "ERR-" + 8 unambiguous, crypto-random characters, e.g. "ERR-7K4QXH2M". */
export function makeReferenceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return `ERR-${out}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Fingerprinting — stable grouping hash so the admin feed can cluster
// repeats of "the same" failure together regardless of the exact ids/values
// involved in any one occurrence.
// ─────────────────────────────────────────────────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_RUN_RE = /\b[0-9a-f]{6,}\b/gi;
const DIGIT_RE = /\d+/g;

/** Collapse ids/hex/digits out of a message so similar errors group together. */
function normalizeMessage(message: string): string {
  return message
    .replace(UUID_RE, "#")
    .replace(HEX_RUN_RE, "#")
    .replace(DIGIT_RE, "#");
}

/** Collapse uuid/numeric path segments to `:id` so `/bookings/123` groups with `/bookings/456`. */
function normalizePath(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (UUID_RE.test(seg)) return ":id";
      UUID_RE.lastIndex = 0;
      if (/^\d+$/.test(seg)) return ":id";
      return seg;
    })
    .join("/");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable grouping hash: SHA-256 (hex, first 16 chars) of
 * `${errorName}|${normalizedMessage}|${method} ${normalizedPath}`.
 */
export async function makeFingerprint(
  errorName: string | null | undefined,
  message: string | null | undefined,
  method: string | null | undefined,
  path: string | null | undefined
): Promise<string> {
  const name = errorName || "Error";
  const normMsg = normalizeMessage(message ?? "");
  const normPath = normalizePath(path ?? "");
  const input = `${name}|${normMsg}|${(method ?? "").toUpperCase()} ${normPath}`;
  const hex = await sha256Hex(input);
  return hex.slice(0, 16);
}

// ─────────────────────────────────────────────────────────────────────────
// Error serialization — full detail for the admin feed, cause chain included.
// ─────────────────────────────────────────────────────────────────────────

export interface SerializedError {
  name: string;
  message: string;
  stack: string | null;
  cause?: SerializedError | { name: string; message: string } | null;
}

/** Serialize an error (and its `.cause` chain, up to 5 deep) into plain JSON. */
export function serializeError(err: unknown, depth = 0): SerializedError | null {
  if (depth >= 5) return null;
  if (err instanceof Error) {
    const out: SerializedError = {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
    };
    if (err.cause !== undefined && err.cause !== null) {
      out.cause =
        err.cause instanceof Error
          ? serializeError(err.cause, depth + 1)
          : { name: "cause", message: safeStringify(err.cause) };
    }
    return out;
  }
  if (err === null || err === undefined) return null;
  return { name: "NonError", message: safeStringify(err), stack: null };
}

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Postgres error extraction — NeonDbError / node-postgres style errors carry
// rich structured fields (SQLSTATE, offending table/column/constraint, …)
// that are gold for debugging but easy to lose once wrapped/rethrown.
// ─────────────────────────────────────────────────────────────────────────

export interface PgErrorInfo {
  code: string | null;
  detail: string | null;
  hint: string | null;
  table: string | null;
  column: string | null;
  constraint: string | null;
  schema: string | null;
  severity: string | null;
  routine: string | null;
  position: string | null;
}

const PG_FIELDS = [
  "code",
  "detail",
  "hint",
  "table",
  "column",
  "constraint",
  "schema",
  "severity",
  "routine",
  "position",
] as const;

/** True if `v` looks like a Postgres/NeonDbError (has a 5-char SQLSTATE code). */
function looksLikePgError(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const code = (v as Record<string, unknown>).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}

/**
 * Walk `err` and its `.cause` chain (max 5 deep) looking for Postgres error
 * fields (as set by @neondatabase/serverless / node-postgres). Returns null
 * when the error isn't (or doesn't wrap) a database error.
 */
export function extractPgError(err: unknown): PgErrorInfo | null {
  try {
    let cur: unknown = err;
    let depth = 0;
    while (cur !== undefined && cur !== null && depth < 5) {
      if (looksLikePgError(cur)) {
        const rec = cur as Record<string, unknown>;
        const info = {} as PgErrorInfo;
        for (const field of PG_FIELDS) {
          const v = rec[field];
          info[field] = v === undefined || v === null ? null : String(v);
        }
        return info;
      }
      cur = cur instanceof Error ? cur.cause : undefined;
      depth++;
    }
    return null;
  } catch {
    return null;
  }
}
