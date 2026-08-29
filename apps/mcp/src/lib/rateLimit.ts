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
 * Light in-isolate rate limiter for MCP tool calls, keyed by admin email.
 * Deliberately simple (no KV): the worker serves a handful of staff users,
 * and the limit only needs to stop a runaway LLM loop, not a distributed
 * attacker. Per-isolate counters reset when the isolate recycles — fine for
 * that purpose.
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 120;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Returns true when the call is allowed; false when the bucket is exhausted. */
export function allowToolCall(adminEmail: string, now = Date.now()): boolean {
  const b = buckets.get(adminEmail);
  if (!b || now >= b.resetAt) {
    buckets.set(adminEmail, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_CALLS_PER_WINDOW) return false;
  b.count += 1;
  return true;
}
