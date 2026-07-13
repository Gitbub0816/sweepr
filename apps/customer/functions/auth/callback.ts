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
 * GET /auth/callback?code=…&state=…[&rp=/path] — finish the login ceremony.
 *
 * Verifies the broker-issued state against the value stashed in the login
 * cookie (constant-time compare; the cookie is our CSRF anchor), exchanges
 * the one-time code + PKCE verifier for a session token, sets the
 * __Host- session cookie exactly as the broker specifies, clears the login
 * cookie, and redirects to the sanitized relative return path.
 *
 * Any failure 302s to /auth/login?fail=1 which renders a static error page —
 * never an automatic retry loop. Tokens and codes are never logged.
 */

import {
  type CustomerAuthEnv,
  base64UrlDecodeToString,
  brokerFetch,
  checkAuthConfig,
  clearLoginCookieHeader,
  DEFAULT_RETURN_PATH,
  LOGIN_COOKIE,
  parseCookies,
  sanitizeReturnPath,
  SESSION_COOKIE,
  timingSafeEqual,
} from "../_lib";

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

const OPAQUE_RE = /^[A-Za-z0-9_-]{20,128}$/;

export const onRequestGet: PagesFunction<CustomerAuthEnv> = async ({ request, env }) => {
  const misconfigured = checkAuthConfig(env);
  if (misconfigured) return misconfigured;

  const failure = () => redirect("/auth/login?fail=1", [clearLoginCookieHeader()]);

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!OPAQUE_RE.test(code) || !OPAQUE_RE.test(state)) return failure();

  // Recover the login transaction context from the HttpOnly cookie.
  const raw = parseCookies(request.headers.get("Cookie"))[LOGIN_COOKIE];
  if (!raw) return failure();
  const decoded = base64UrlDecodeToString(raw);
  if (!decoded) return failure();
  let stash: { verifier?: unknown; state?: unknown; tx?: unknown; rp?: unknown };
  try {
    stash = JSON.parse(decoded) as typeof stash;
  } catch {
    return failure();
  }
  const verifier = typeof stash.verifier === "string" ? stash.verifier : "";
  const expectedState = typeof stash.state === "string" ? stash.state : "";
  if (!OPAQUE_RE.test(verifier) || !expectedState) return failure();

  // CSRF/state binding: the state in the URL must match the cookie's copy.
  if (!timingSafeEqual(state, expectedState)) return failure();

  const exchange = await brokerFetch(env, "/v1/auth/exchange", {
    code,
    state,
    pkce_verifier: verifier,
  });
  const token = exchange.data?.session_token;
  const cookie = exchange.data?.cookie as { name?: unknown; attributes?: unknown } | undefined;
  if (!exchange.ok || typeof token !== "string" || !token) return failure();

  // Set the session cookie exactly as the broker's contract specifies; the
  // name must be our registered host-only cookie — anything else is refused.
  const name = typeof cookie?.name === "string" ? cookie.name : "";
  const attributes = typeof cookie?.attributes === "string" ? cookie.attributes : "";
  if (name !== SESSION_COOKIE || !attributes || /[\r\n;]/.test(name) || /[\r\n]/.test(attributes)) {
    return failure();
  }

  const returnPath = sanitizeReturnPath(
    typeof stash.rp === "string" ? stash.rp : url.searchParams.get("rp"),
    DEFAULT_RETURN_PATH
  );
  return redirect(returnPath, [`${name}=${token}; ${attributes}`, clearLoginCookieHeader()]);
};
