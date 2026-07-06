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
