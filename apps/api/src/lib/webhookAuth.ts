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
 * Shared helpers for HMAC-signed inbound webhooks (MailerSend inbound
 * routes, etc). Every caller must fail closed when its secret is
 * unconfigured — see individual route files for that check.
 */
import type { Context } from "hono";
import { captureFromContext } from "./securityEvents";
import type { AppBindings } from "../types";

export async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SvixVerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a Svix-signed webhook (Clerk, Seam, and other Svix-backed providers all
 * use the same scheme). The signing secret is `whsec_<base64>`; the signed
 * content is `${svixId}.${svixTimestamp}.${rawBody}`, HMAC-SHA256'd, base64'd,
 * and compared constant-time against the space-delimited `v1,<sig>` list in the
 * `svix-signature` header. Rejects deliveries outside a 5-minute replay window.
 */
export async function verifySvixSignature(
  secret: string,
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignatures: string,
): Promise<SvixVerifyResult> {
  if (!svixId || !svixTimestamp || !svixSignatures) {
    return { ok: false, reason: "missing_svix_headers" };
  }
  if (!secret.startsWith("whsec_")) {
    return { ok: false, reason: "secret_not_whsec (configure the webhook Signing Secret whsec_…, not an API key)" };
  }
  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  let secretBytes: Uint8Array;
  try {
    const b64 = secret.slice("whsec_".length).replace(/-/g, "+").replace(/_/g, "/");
    secretBytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    return { ok: false, reason: "secret_base64_decode_failed" };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const matched = svixSignatures.split(" ").some((s) => {
    const comma = s.indexOf(",");
    const b64 = comma === -1 ? s : s.slice(comma + 1);
    return timingSafeEqual(b64, computed);
  });
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

/** SHA-256 hex digest — dedup key fallback when a webhook body carries no id. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison — avoids timing side-channels on signature checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Record a `webhook_signature_failure` security event (high severity).
 * Call this from the 401 branch of any inbound webhook verification —
 * MailerSend inbound routes, Clerk webhook, etc. Best-effort, never throws.
 */
export function recordWebhookSignatureFailure(
  c: Context<AppBindings>,
  details?: Record<string, unknown>,
): void {
  captureFromContext(c, "webhook_signature_failure", "high", details);
}
