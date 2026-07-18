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
 * Unified API-token source.
 *
 * The API (api.getsweepr.com) authenticates every request with a Bearer token.
 * - Native Clerk mode: that token is Clerk's session JWT (useAuth().getToken).
 * - Central-auth mode: the browser has no Clerk session on this origin — only
 *   the HttpOnly broker session cookie, which JS can't read. Instead the app
 *   asks its same-origin BFF (/auth/token) to introspect the session and mint
 *   a short-lived HS256 token the API trusts. We cache it and re-mint shortly
 *   before it expires.
 *
 * `useAppToken().getToken` is a drop-in for `useAuth().getToken`, so call sites
 * work unchanged in either mode.
 */

import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { CENTRAL_AUTH_ENABLED } from "@/components/CentralSession";

let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchCentralToken(): Promise<string | null> {
  const now = Date.now();
  // Re-use while comfortably fresh (10s guard against clock skew / in-flight).
  if (cached && cached.exp - 10_000 > now) return cached.token;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/auth/token", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        cached = null;
        return null;
      }
      const d = (await res.json()) as { token?: string; expires_at?: number };
      if (!d.token) {
        cached = null;
        return null;
      }
      cached = { token: d.token, exp: d.expires_at ?? now + 60_000 };
      return d.token;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop-in replacement for `useAuth().getToken` that is central-auth-aware. */
export function useAppToken(): { getToken: () => Promise<string | null> } {
  const { getToken: clerkGetToken } = useAuth();
  const getToken = useCallback(async (): Promise<string | null> => {
    if (CENTRAL_AUTH_ENABLED) return fetchCentralToken();
    return clerkGetToken();
  }, [clerkGetToken]);
  return { getToken };
}
