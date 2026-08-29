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
 * Stateless OAuth 2.1 state, all HMAC-signed under MCP_TOKEN_SECRET.
 *
 * Design: the MCP worker keeps NO OAuth storage of its own (migrations are
 * owned elsewhere and the sandbox tables are quarantined for pricing
 * proposals). Instead every artifact — registered client, auth code, access
 * token, refresh token, simulator share link — is a compact HS256-signed
 * token (JWS-style header.payload.signature, base64url). Validity =
 * signature + `typ` + expiry. The only statefulness is single-use
 * enforcement for auth codes, which piggybacks on the append-only
 * mcp_action_log (SELECT for a prior 'oauth_code_use' row with the same jti,
 * then INSERT). That check is not serializable, so a perfectly timed double
 * redemption could race — an accepted tradeoff at this scale (single-digit
 * admin users, 60s code TTL, PKCE still required on both attempts).
 *
 * Rotating MCP_TOKEN_SECRET instantly invalidates everything outstanding.
 */

const encoder = new TextEncoder();

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeJson(obj: unknown): string {
  return b64urlEncodeBytes(encoder.encode(JSON.stringify(obj)));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/** Token types minted by this worker; `typ` prevents cross-purpose replay. */
export type TokenType =
  | "client" // registered OAuth client (client_id IS the registration)
  | "code" // authorization code (60s, single-use)
  | "access" // bearer token for /mcp (12h)
  | "refresh" // refresh token (30d, rotated on use)
  | "share"; // simulator page share link (7d)

export interface TokenClaims {
  typ: TokenType;
  iat: number;
  exp?: number;
  [k: string]: unknown;
}

/** Sign claims into a compact header.payload.signature token. */
export async function signToken(secret: string, claims: TokenClaims): Promise<string> {
  const header = b64urlEncodeJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlEncodeJson(claims);
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64urlEncodeBytes(new Uint8Array(sig))}`;
}

/**
 * Verify a token's signature, type and expiry. Returns the claims or null —
 * fails closed on any anomaly (bad shape, bad sig, wrong typ, expired).
 */
export async function verifyMcpToken(
  secret: string,
  token: string,
  expectedType: TokenType,
): Promise<TokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const key = await hmacKey(secret, "verify");
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecodeToBytes(sig),
      encoder.encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(p))) as TokenClaims;
    if (claims.typ !== expectedType) return null;
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Random URL-safe id (jti/nonce/state). */
export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlEncodeBytes(buf);
}

// ── Client registration (RFC 7591, stateless) ───────────────────────────────

export interface ClientClaims extends TokenClaims {
  typ: "client";
  redirect_uris: string[];
  client_name: string;
}

/** https only, or http://localhost[:port] for local development. */
export function isAcceptableRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
    return true;
  }
  return false;
}

export async function mintClientId(
  secret: string,
  redirectUris: string[],
  clientName: string,
): Promise<string> {
  const claims: ClientClaims = {
    typ: "client",
    iat: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    client_name: clientName,
    // Client registrations do not expire: expiry would silently break saved
    // connector setups, and the registration grants nothing by itself (the
    // human admin still authenticates through Clerk on every authorize).
  };
  return signToken(secret, claims);
}

export async function verifyClientId(secret: string, clientId: string): Promise<ClientClaims | null> {
  const claims = await verifyMcpToken(secret, clientId, "client");
  if (!claims) return null;
  if (!Array.isArray(claims.redirect_uris) || typeof claims.client_name !== "string") return null;
  return claims as ClientClaims;
}

// ── PKCE (S256 only) ────────────────────────────────────────────────────────

export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return b64urlEncodeBytes(new Uint8Array(digest));
}

export async function verifyPkce(codeChallenge: string, codeVerifier: string): Promise<boolean> {
  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const expected = await pkceChallengeFromVerifier(codeVerifier);
  return timingSafeEqualStr(expected, codeChallenge);
}

/** Constant-time-ish string compare (both sides are short base64url). */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Auth codes / access / refresh / share tokens ────────────────────────────

export const AUTH_CODE_TTL_SECONDS = 60;
export const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60; // matches admin session TTL
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SHARE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthCodeClaims extends TokenClaims {
  typ: "code";
  admin_email: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  jti: string;
}

export async function mintAuthCode(
  secret: string,
  input: { adminEmail: string; clientId: string; redirectUri: string; codeChallenge: string },
): Promise<{ code: string; jti: string }> {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomId();
  const code = await signToken(secret, {
    typ: "code",
    iat: now,
    exp: now + AUTH_CODE_TTL_SECONDS,
    admin_email: input.adminEmail,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    jti,
  } satisfies AuthCodeClaims);
  return { code, jti };
}

export interface SessionTokenClaims extends TokenClaims {
  typ: "access" | "refresh";
  admin_email: string;
  scope: string;
}

export async function mintAccessToken(secret: string, adminEmail: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(secret, {
    typ: "access",
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    admin_email: adminEmail,
    scope: "mcp",
  } satisfies SessionTokenClaims);
}

export async function mintRefreshToken(secret: string, adminEmail: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(secret, {
    typ: "refresh",
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
    admin_email: adminEmail,
    scope: "mcp",
  } satisfies SessionTokenClaims);
}

export interface ShareTokenClaims extends TokenClaims {
  typ: "share";
  admin_email: string;
  name: string;
}

export async function mintShareToken(
  secret: string,
  adminEmail: string,
  name: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(secret, {
    typ: "share",
    iat: now,
    exp: now + SHARE_TOKEN_TTL_SECONDS,
    admin_email: adminEmail,
    name,
  } satisfies ShareTokenClaims);
}
