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
