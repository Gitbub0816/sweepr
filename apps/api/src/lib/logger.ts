/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { captureLoggedError, addBreadcrumb } from "./errorContext";

const REDACT_KEYS = [
  "password",
  "ssn",
  "ssnLast4",
  "dateOfBirth",
  "cardNumber",
  "cvv",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "card",
  "cvc",
  // Smart Entry — never let a working credential or lock secret reach a log,
  // error payload, or breadcrumb (spec §18). Substring match, case-insensitive.
  "door_code",
  "doorcode",
  "entry_code",
  "access_code",
  "accesscode",
  "lock_code",
  "temporary_pin",
  "keypad",
  "credential",
  "digital_key",
  "lock_token",
  "hidden_key_location",
  "alarm_code",
  "access_instructions",
];

export function redact(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACT_KEYS.some((r) => k.toLowerCase().includes(r))
        ? "[REDACTED]"
        : redact(v),
    ])
  );
}

/** Serialize an Error (with its `.cause` chain, up to 5 deep) for logging. */
function serializeErrForLog(err: unknown, depth = 0): unknown {
  if (depth >= 5) return undefined;
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    if (err.cause !== undefined) out.cause = serializeErrForLog(err.cause, depth + 1);
    return out;
  }
  return err;
}

export const logger = {
  info: (msg: string, data?: unknown) => {
    const redacted = redact(data);
    console.log(
      JSON.stringify({
        level: "info",
        msg,
        data: redacted,
        ts: new Date().toISOString(),
      })
    );
    addBreadcrumb("info", msg, redacted);
  },
  warn: (msg: string, data?: unknown) => {
    const redacted = redact(data);
    console.warn(
      JSON.stringify({
        level: "warn",
        msg,
        data: redacted,
        ts: new Date().toISOString(),
      })
    );
    captureLoggedError("warn", msg, undefined, redacted);
    addBreadcrumb("warn", msg, redacted);
  },
  error: (msg: string, err: unknown, data?: unknown) => {
    const redacted = redact(data);
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        err: serializeErrForLog(err),
        data: redacted,
        ts: new Date().toISOString(),
      })
    );
    captureLoggedError("error", msg, err, redacted);
    addBreadcrumb("error", msg, redacted);
  },
};
