/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import type { Env } from "../types";

const TOKEN_TTL_SECONDS = 30 * 60; // MapKit JS refetches on expiry via authorizationCallback

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const contents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(contents);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedKey: { pem: string; key: CryptoKey } | null = null;

async function importSigningKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.pem === pem) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  cachedKey = { pem, key };
  return key;
}

export class AppleMapsNotConfiguredError extends Error {
  constructor() {
    super("Apple Maps signing credentials are not configured");
    this.name = "AppleMapsNotConfiguredError";
  }
}

/**
 * Mints a short-lived MapKit JS authorization token (ES256 JWT signed with
 * the Apple Maps private key). The private key stays server-side; the
 * frontend only ever sees this token, refreshed via mapkit's
 * authorizationCallback well before TOKEN_TTL_SECONDS elapses.
 */
export async function signAppleMapsToken(env: Env): Promise<{ token: string; expiresAt: number }> {
  const { APPLE_MAPS_TEAM_ID, APPLE_MAPS_KEY_ID, APPLE_MAPS_PRIVATE_KEY } = env;
  if (!APPLE_MAPS_TEAM_ID || !APPLE_MAPS_KEY_ID || !APPLE_MAPS_PRIVATE_KEY) {
    throw new AppleMapsNotConfiguredError();
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_SECONDS;

  const header = { alg: "ES256", typ: "JWT", kid: APPLE_MAPS_KEY_ID };
  const payload = { iss: APPLE_MAPS_TEAM_ID, iat: now, exp: expiresAt };

  const encoder = new TextEncoder();
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;

  const key = await importSigningKey(APPLE_MAPS_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput)
  );

  return { token: `${signingInput}.${base64url(signature)}`, expiresAt };
}
