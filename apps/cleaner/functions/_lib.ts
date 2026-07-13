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
 * Shared helpers for the Sweepr Sweepr Cleaner BFF (Cloudflare Pages Functions).
 *
 * The BFF is the ONLY holder of broker credentials and session tokens on this
 * origin: the browser sees host-only HttpOnly cookies and JSON booleans, never
 * a token. Everything here fails closed — missing config disables the auth
 * endpoints rather than bypassing them. Never log tokens, codes, or cookies.
 */

export interface CleanerAuthEnv {
  /** Broker base URL; defaults to production. Plain var, not a secret. */
  BROKER_URL?: string;
  /** Service bearer key — IS the app identity at the broker. Secret. */
  BROKER_KEY_CLEANER?: string;
  /** Migration gate; central auth endpoints are dead unless "true". */
  CENTRAL_AUTH_ENABLED?: string;
}

export const APP_ORIGIN = "https://clean.getsweepr.com";
export const SESSION_COOKIE = "__Host-sweepr_cleaner_session";
export const LOGIN_COOKIE = "__Host-sweepr_cleaner_login";
export const LOGIN_COOKIE_TTL_SECONDS = 300;
export const DEFAULT_RETURN_PATH = "/";

// ── Responses ────────────────────────────────────────────────────────────────

export function json(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** 503 when the broker integration is not (fully) configured — fail closed. */
export function checkAuthConfig(env: CleanerAuthEnv): Response | null {
  if (env.CENTRAL_AUTH_ENABLED !== "true") return json(503, { error: "central_auth_disabled" });
  if (!env.BROKER_KEY_CLEANER) return json(503, { error: "auth_unconfigured" });
  return null;
}

// ── Broker client ────────────────────────────────────────────────────────────

export function brokerUrl(env: CleanerAuthEnv): string {
  return (env.BROKER_URL || "https://broker.getsweepr.com").replace(/\/+$/, "");
}

/** Service-to-service call to the auth broker. Never throws. */
export async function brokerFetch(
  env: CleanerAuthEnv,
  path: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${brokerUrl(env)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.BROKER_KEY_CLEANER}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      /* non-JSON broker error body */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// ── Cookies ──────────────────────────────────────────────────────────────────

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Host-only login cookie: HttpOnly + Secure + SameSite=Lax, short-lived. */
export function loginCookieHeader(value: string, maxAge: number = LOGIN_COOKIE_TTL_SECONDS): string {
  return `${LOGIN_COOKIE}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearLoginCookieHeader(): string {
  return `${LOGIN_COOKIE}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Encoding / crypto ────────────────────────────────────────────────────────

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecodeToString(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64);
  } catch {
    return null;
  }
}

/** 43-char base64url of 32 random bytes (PKCE verifier / opaque values). */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** PKCE S256 challenge for a verifier. */
export async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Constant-time-ish string comparison (no early exit on mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i % (ab.length || 1)] ?? 0) ^ (bb[i % (bb.length || 1)] ?? 0);
  }
  return diff === 0;
}

// ── Return-path sanitizer (mirror of the broker's sanitize_return_path) ─────

/**
 * Sanitize a browser-supplied return path to a safe RELATIVE application
 * path. Rejects schemes, protocol-relative ("//"), backslashes, control
 * chars, and encoding tricks — fail closed to the fallback.
 */
export function sanitizeReturnPath(raw: string | null | undefined, fallback: string = DEFAULT_RETURN_PATH): string {
  if (!raw || raw.length > 512) return fallback;
  // No control characters anywhere.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  // Exactly one leading '/': rejects schemes ("https:"), protocol-relative
  // ("//host"), and backslash tricks ("/\host").
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return fallback;
  if (raw.includes("\\")) return fallback;
  const lower = raw.toLowerCase();
  for (const needle of ["http:", "https:", "javascript:", "data:", "%2f%2f", "%5c", "@"]) {
    if (lower.includes(needle)) return fallback;
  }
  return raw;
}
