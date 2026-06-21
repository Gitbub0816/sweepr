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

export const logger = {
  info: (msg: string, data?: unknown) =>
    console.log(
      JSON.stringify({
        level: "info",
        msg,
        data: redact(data),
        ts: new Date().toISOString(),
      })
    ),
  warn: (msg: string, data?: unknown) =>
    console.warn(
      JSON.stringify({
        level: "warn",
        msg,
        data: redact(data),
        ts: new Date().toISOString(),
      })
    ),
  error: (msg: string, err: unknown, data?: unknown) =>
    console.error(
      JSON.stringify({
        level: "error",
        msg,
        err:
          err instanceof Error
            ? { message: err.message, name: err.name }
            : err,
        data: redact(data),
        ts: new Date().toISOString(),
      })
    ),
};
