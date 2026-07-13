/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/** Sweepr central authentication broker client.
 *
 * Hard rules mirrored from the broker contract (services/auth-broker):
 *  - tokens NEVER appear in URLs, storage, or logs — they travel only in
 *    fetch bodies with `cache: "no-store"`;
 *  - the completion token is single-use and rotates on every context fetch;
 *  - the browser only ever handles the opaque `tx` handle. */

export const BROKER_URL = (
  (import.meta.env.VITE_BROKER_URL as string | undefined)?.trim() ||
  "https://broker.getsweepr.com"
).replace(/\/+$/, "");

/** GET /v1/auth/transactions/{tx}/context response. */
export interface TransactionContext {
  app_id: "customer" | "cleaner" | "business" | "admin";
  display_name: string;
  application_origin: string;
  cancel_url: string;
  autocomplete_section: string;
  completion_token: string;
  heading: string;
}

/** POST /v1/auth/transactions/{tx}/complete success response. */
export interface CompletionResult {
  redirect: string;
  return_path: string;
}

export type ContextResult =
  | { ok: true; context: TransactionContext }
  | { ok: false; expired: boolean };

/** Only tx handles matching the broker's token alphabet are ever sent. */
const HANDLE_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function isValidHandle(tx: string | null): tx is string {
  return typeof tx === "string" && HANDLE_RE.test(tx);
}

export async function fetchTransactionContext(tx: string): Promise<ContextResult> {
  try {
    const res = await fetch(`${BROKER_URL}/v1/auth/transactions/${encodeURIComponent(tx)}/context`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    });
    if (res.status === 404) return { ok: false, expired: true };
    if (!res.ok) return { ok: false, expired: false };
    return { ok: true, context: (await res.json()) as TransactionContext };
  } catch {
    return { ok: false, expired: false };
  }
}

export type CompleteResult =
  | { ok: true; result: CompletionResult }
  | { ok: false; error: string };

export async function completeTransaction(
  tx: string,
  clerkToken: string,
  completionToken: string
): Promise<CompleteResult> {
  try {
    const res = await fetch(
      `${BROKER_URL}/v1/auth/transactions/${encodeURIComponent(tx)}/complete`,
      {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerk_token: clerkToken, completion_token: completionToken }),
      }
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: typeof body.error === "string" ? body.error : "unknown_error" };
    }
    return { ok: true, result: body as unknown as CompletionResult };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Build the final redirect. The broker's `redirect` already carries the
 * one-time code and CSRF state; the ONLY thing we may append is the return
 * path as `rp`, and only when it is a safe relative path (the app callback
 * re-sanitizes it anyway). */
export function buildRedirectUrl(result: CompletionResult): string {
  const rp = result.return_path;
  if (
    typeof rp === "string" &&
    rp.startsWith("/") &&
    !rp.startsWith("//") &&
    !rp.startsWith("/\\") &&
    rp !== "/"
  ) {
    return `${result.redirect}&rp=${encodeURIComponent(rp)}`;
  }
  return result.redirect;
}
