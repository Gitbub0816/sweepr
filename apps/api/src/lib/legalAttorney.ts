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
 * External reviewing attorney — an isolated identity (NOT staff admin, NOT a
 * customer/cleaner) who signs in via a signed, single-use magic link to view,
 * edit, and approve archived legal documents. Sessions are short-lived
 * HMAC-signed tokens; the signing key is a dedicated secret when present, else
 * derived from DATABASE_URL so the feature fails closed rather than open.
 */

import type { Sql } from "./db";
import { sha256Hex } from "./invitations";

export interface LegalAttorney {
  id: string;
  email: string;
  fullName: string;
  barNumber: string | null;
  barState: string | null;
  firmName: string | null;
  title: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
}

interface LegalAttorneyRow {
  id: string;
  email: string;
  full_name: string;
  bar_number: string | null;
  bar_state: string | null;
  firm_name: string | null;
  title: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

function toAttorney(r: LegalAttorneyRow): LegalAttorney {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    barNumber: r.bar_number,
    barState: r.bar_state,
    firmName: r.firm_name,
    title: r.title,
    phone: r.phone,
    active: r.active,
    createdAt: r.created_at,
  };
}

const SESSION_TTL_SECONDS = 60 * 60 * 4; // 4 hours
const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return new Uint8Array([...b].map((c) => c.charCodeAt(0)));
}

async function signingKey(env: { LEGAL_ATTORNEY_SESSION_SECRET?: string; DATABASE_URL: string }): Promise<CryptoKey> {
  const secret = env.LEGAL_ATTORNEY_SESSION_SECRET || `legal-attorney::${env.DATABASE_URL}`;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Mints a compact HMAC session token: base64url(payload).base64url(sig). */
export async function mintAttorneySession(
  env: { LEGAL_ATTORNEY_SESSION_SECRET?: string; DATABASE_URL: string },
  attorneyId: string,
): Promise<string> {
  const payload = JSON.stringify({ sub: attorneyId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const payloadB64 = b64url(new TextEncoder().encode(payload));
  const key = await signingKey(env);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)));
  return `${payloadB64}.${b64url(sig)}`;
}

/** Verifies a session token; returns the attorney id or null. */
export async function verifyAttorneySession(
  env: { LEGAL_ATTORNEY_SESSION_SECRET?: string; DATABASE_URL: string },
  token: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const key = await signingKey(env);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(payloadB64));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as { sub: string; exp: number };
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────

export async function getAttorneyById(sql: Sql, id: string): Promise<LegalAttorney | null> {
  const rows = (await sql`
    SELECT id, email, full_name, bar_number, bar_state, firm_name, title, phone, active, created_at
    FROM legal_attorneys WHERE id = ${id} LIMIT 1
  `) as LegalAttorneyRow[];
  return rows[0] ? toAttorney(rows[0]) : null;
}

export async function getActiveAttorneyByEmail(sql: Sql, email: string): Promise<LegalAttorney | null> {
  const rows = (await sql`
    SELECT id, email, full_name, bar_number, bar_state, firm_name, title, phone, active, created_at
    FROM legal_attorneys WHERE LOWER(email) = LOWER(${email}) AND active = TRUE LIMIT 1
  `) as LegalAttorneyRow[];
  return rows[0] ? toAttorney(rows[0]) : null;
}

export async function listAttorneys(sql: Sql): Promise<LegalAttorney[]> {
  const rows = (await sql`
    SELECT id, email, full_name, bar_number, bar_state, firm_name, title, phone, active, created_at
    FROM legal_attorneys ORDER BY created_at DESC
  `) as LegalAttorneyRow[];
  return rows.map(toAttorney);
}

export async function upsertAttorney(
  sql: Sql,
  input: {
    email: string;
    fullName: string;
    barNumber: string | null;
    barState: string | null;
    firmName: string | null;
    title: string | null;
    phone: string | null;
    active: boolean;
  },
): Promise<LegalAttorney> {
  const rows = (await sql`
    INSERT INTO legal_attorneys (email, full_name, bar_number, bar_state, firm_name, title, phone, active)
    VALUES (${input.email}, ${input.fullName}, ${input.barNumber}, ${input.barState},
            ${input.firmName}, ${input.title}, ${input.phone}, ${input.active})
    ON CONFLICT (email) DO UPDATE SET
      full_name = EXCLUDED.full_name, bar_number = EXCLUDED.bar_number,
      bar_state = EXCLUDED.bar_state, firm_name = EXCLUDED.firm_name,
      title = EXCLUDED.title, phone = EXCLUDED.phone, active = EXCLUDED.active,
      updated_at = NOW()
    RETURNING id, email, full_name, bar_number, bar_state, firm_name, title, phone, active, created_at
  `) as LegalAttorneyRow[];
  return toAttorney(rows[0]);
}

/** Creates a single-use login token; returns the plaintext (email it, never store it). */
export async function createAttorneyLoginToken(sql: Sql, attorneyId: string): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256Hex(raw);
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString();
  await sql`
    INSERT INTO legal_attorney_login_tokens (attorney_id, token_hash, expires_at)
    VALUES (${attorneyId}, ${tokenHash}, ${expiresAt})
  `;
  return raw;
}

/** Claims a login token (single-use); returns the attorney id or null. */
export async function claimAttorneyLoginToken(sql: Sql, rawToken: string): Promise<string | null> {
  const tokenHash = await sha256Hex(rawToken);
  const rows = (await sql`
    UPDATE legal_attorney_login_tokens
    SET used_at = NOW()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
    RETURNING attorney_id
  `) as Array<{ attorney_id: string }>;
  return rows[0]?.attorney_id ?? null;
}

/** Records the attorney's approval on the current archived version of a doc. */
export async function approveDocVersion(
  sql: Sql,
  slug: string,
  attorney: LegalAttorney,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE legal_document_versions
    SET attorney_approved_by = ${attorney.id},
        attorney_approved_at = NOW(),
        attorney_name = ${attorney.fullName},
        attorney_bar_number = ${attorney.barNumber}
    WHERE slug = ${slug} AND is_current = TRUE
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}

/** Marks that the attorney saved an edited HTML snapshot for a doc's current version. */
export async function markDocEdited(sql: Sql, slug: string): Promise<void> {
  await sql`
    UPDATE legal_document_versions SET edited_html_at = NOW()
    WHERE slug = ${slug} AND is_current = TRUE
  `;
}
