/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const GENERIC_5XX_MESSAGE = "Something went wrong on our end. Please try again in a moment.";

/**
 * Safe error serializer for unexpected (5xx) failures — never leaks stack
 * traces, SQL, or class names to the client. Always includes a `reference`
 * code the customer can quote to support, which must match the row written
 * to the admin error feed for this incident (see `setResponseReference` in
 * lib/errorContext.ts). In development only, a non-sensitive `detail` field
 * is added to speed up local debugging — the shape stays the same.
 */
export function toSafeError(
  err: unknown,
  isDev: boolean,
  reference: string
): { error: string; code: string; reference: string; detail?: string } {
  const base = { error: GENERIC_5XX_MESSAGE, code: "internal_error", reference };
  if (!isDev) return base;
  if (err instanceof Error) return { ...base, detail: err.message };
  return { ...base, detail: String(err) };
}
