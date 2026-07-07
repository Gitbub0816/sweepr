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
 * Unit tests for the error telemetry write-side helpers: reference id
 * generation, fingerprint normalization/stability, error serialization
 * (with cause chains), Postgres error extraction, and log redaction.
 *
 * Pure unit tests — no DB, no network.
 */
import { describe, it, expect } from "vitest";
import {
  makeReferenceId,
  makeFingerprint,
  serializeError,
  extractPgError,
} from "../src/lib/errorLog";
import { redact } from "../src/lib/logger";

describe("makeReferenceId", () => {
  it("has the ERR- prefix followed by 8 characters", () => {
    const ref = makeReferenceId();
    expect(ref).toMatch(/^ERR-[A-Z0-9]{8}$/);
  });

  it("never contains ambiguous characters 0/O/1/I", () => {
    for (let i = 0; i < 200; i++) {
      const ref = makeReferenceId();
      expect(ref).not.toMatch(/[0O1I]/);
    }
  });

  it("generates distinct values across calls", () => {
    const refs = new Set(Array.from({ length: 50 }, () => makeReferenceId()));
    expect(refs.size).toBeGreaterThan(45); // astronomically unlikely to collide
  });
});

describe("makeFingerprint", () => {
  it("is a 16-char hex string", async () => {
    const fp = await makeFingerprint("TypeError", "x is not a function", "GET", "/bookings/123");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for identical inputs", async () => {
    const a = await makeFingerprint("TypeError", "boom", "POST", "/admin/x");
    const b = await makeFingerprint("TypeError", "boom", "POST", "/admin/x");
    expect(a).toBe(b);
  });

  it("normalizes numeric ids in the message so they group together", async () => {
    const a = await makeFingerprint("Error", "booking 12345 not found", "GET", "/bookings");
    const b = await makeFingerprint("Error", "booking 98765 not found", "GET", "/bookings");
    expect(a).toBe(b);
  });

  it("normalizes uuids in the message so they group together", async () => {
    const a = await makeFingerprint(
      "Error",
      "user 3fa85f64-5717-4562-b3fc-2c963f66afa6 not found",
      "GET",
      "/users"
    );
    const b = await makeFingerprint(
      "Error",
      "user 9c858901-8a57-4791-81fe-4c455b099bc9 not found",
      "GET",
      "/users"
    );
    expect(a).toBe(b);
  });

  it("normalizes numeric and uuid path segments so they group together", async () => {
    const a = await makeFingerprint("Error", "boom", "GET", "/bookings/123/photos");
    const b = await makeFingerprint("Error", "boom", "GET", "/bookings/456/photos");
    expect(a).toBe(b);

    const c = await makeFingerprint(
      "Error",
      "boom",
      "GET",
      "/bookings/3fa85f64-5717-4562-b3fc-2c963f66afa6/photos"
    );
    expect(a).toBe(c);
  });

  it("differs when the error name, message shape, method, or static path segments differ", async () => {
    const base = await makeFingerprint("TypeError", "boom", "GET", "/bookings/123");
    expect(await makeFingerprint("RangeError", "boom", "GET", "/bookings/123")).not.toBe(base);
    expect(await makeFingerprint("TypeError", "boom", "POST", "/bookings/123")).not.toBe(base);
    expect(await makeFingerprint("TypeError", "boom", "GET", "/cleaners/123")).not.toBe(base);
    expect(await makeFingerprint("TypeError", "kaboom", "GET", "/bookings/123")).not.toBe(base);
  });
});

describe("serializeError", () => {
  it("captures name, message, and stack", () => {
    const err = new TypeError("bad input");
    const ser = serializeError(err);
    expect(ser).not.toBeNull();
    expect(ser?.name).toBe("TypeError");
    expect(ser?.message).toBe("bad input");
    expect(typeof ser?.stack).toBe("string");
  });

  it("walks the cause chain", () => {
    const root = new Error("root cause");
    const mid = new Error("middle failure", { cause: root });
    const top = new Error("top-level failure", { cause: mid });
    const ser = serializeError(top);
    expect(ser?.message).toBe("top-level failure");
    expect((ser?.cause as { message?: string })?.message).toBe("middle failure");
    expect(((ser?.cause as { cause?: { message?: string } })?.cause)?.message).toBe("root cause");
  });

  it("caps the cause chain depth at 5", () => {
    let err: Error | undefined;
    for (let i = 0; i < 8; i++) {
      err = new Error(`level ${i}`, err ? { cause: err } : undefined);
    }
    let ser = serializeError(err);
    let depth = 0;
    while (ser?.cause && "message" in ser.cause) {
      ser = ser.cause as typeof ser;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(5);
  });

  it("returns null for null/undefined", () => {
    expect(serializeError(null)).toBeNull();
    expect(serializeError(undefined)).toBeNull();
  });

  it("handles non-Error thrown values", () => {
    const ser = serializeError("just a string");
    expect(ser?.name).toBe("NonError");
    expect(ser?.message).toBe("just a string");
  });
});

describe("extractPgError", () => {
  it("returns null for a plain Error", () => {
    expect(extractPgError(new Error("nope"))).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(extractPgError(null)).toBeNull();
    expect(extractPgError(undefined)).toBeNull();
  });

  it("extracts fields from a NeonDbError-shaped object", () => {
    const pgErr = Object.assign(new Error("column does not exist"), {
      code: "42703",
      detail: "Perhaps you meant to reference the column",
      hint: "check the spelling",
      table: "bookings",
      column: "nonexistent_col",
      constraint: null,
      schema: "public",
      severity: "ERROR",
      routine: "errorMissingColumn",
      position: "42",
    });
    const info = extractPgError(pgErr);
    expect(info).toEqual({
      code: "42703",
      detail: "Perhaps you meant to reference the column",
      hint: "check the spelling",
      table: "bookings",
      column: "nonexistent_col",
      constraint: null,
      schema: "public",
      severity: "ERROR",
      routine: "errorMissingColumn",
      position: "42",
    });
  });

  it("walks the cause chain to find a wrapped pg error", () => {
    const pgErr = Object.assign(new Error("unique violation"), {
      code: "23505",
      constraint: "bookings_pkey",
    });
    const wrapper = new Error("failed to insert booking", { cause: pgErr });
    const info = extractPgError(wrapper);
    expect(info?.code).toBe("23505");
    expect(info?.constraint).toBe("bookings_pkey");
  });

  it("does not misfire on codes that aren't 5-char SQLSTATEs", () => {
    const err = Object.assign(new Error("app error"), { code: "not_found" });
    expect(extractPgError(err)).toBeNull();
  });
});

describe("redact", () => {
  it("redacts known sensitive keys", () => {
    const out = redact({ password: "hunter2", token: "abc", ok: "fine" }) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.ok).toBe("fine");
  });

  it("redacts the newly added key patterns", () => {
    const out = redact({
      apiKey: "sk_live_x",
      api_key: "sk_live_y",
      cardNumber: "4111",
      card: "4111",
      cvc: "123",
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.cardNumber).toBe("[REDACTED]");
    expect(out.card).toBe("[REDACTED]");
    expect(out.cvc).toBe("[REDACTED]");
  });

  it("recurses into nested objects and arrays", () => {
    const out = redact({
      user: { password: "hunter2", email: "a@b.com" },
      items: [{ token: "x" }, { ok: true }],
    }) as { user: { password: string; email: string }; items: Array<Record<string, unknown>> };
    expect(out.user.password).toBe("[REDACTED]");
    expect(out.user.email).toBe("a@b.com");
    expect(out.items[0].token).toBe("[REDACTED]");
    expect(out.items[1].ok).toBe(true);
  });

  it("keeps emails and phone numbers (admins need them)", () => {
    const out = redact({ email: "a@b.com", phone: "555-1234" }) as Record<string, unknown>;
    expect(out.email).toBe("a@b.com");
    expect(out.phone).toBe("555-1234");
  });

  it("passes through non-object values unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
