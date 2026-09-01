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
 * Shared integer-money math and the quote input error. Split out of engine.ts
 * so the extended (multi-service) module and the core engine can share them
 * without a circular import. Everything here is pure and deterministic.
 */

/** Raised for input the service layer should surface as a 400. */
export class QuoteInputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Integer round-half-up division — no binary-float division in charge math. */
export function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** Basis-point application: cents × bps, integer round-half-up. */
export function applyBps(cents: number, bps: number): number {
  return roundDiv(cents * bps, 10_000);
}

/** Round a cents total UP so the dollars part ends in `digit` and cents are
 *  .00-free charm pricing (mirrors the live engine's ending-9 policy). */
export function roundUpToEndingDigit(cents: number, digit: number): number {
  const dollars = Math.ceil(cents / 100);
  const last = dollars % 10;
  const add = last <= digit ? digit - last : 10 - last + digit;
  return (dollars + add) * 100;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${body.join(",")}}`;
}

/** FNV-1a 64-bit over the canonical (sorted-keys) JSON — the deterministic
 *  calculation fingerprint stamped on every quote. */
export function calculationFingerprint(value: unknown): string {
  const canonical = canonicalJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= BigInt(canonical.charCodeAt(i) & 0xff);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
