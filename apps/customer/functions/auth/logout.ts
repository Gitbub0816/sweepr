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
 * POST /auth/logout — revoke the session at the broker and expire the cookie.
 *
 * POST only (no state change via GET) and Origin-checked (CSRF): the request
 * must originate from business.getsweepr.com. Always expires the cookie
 * locally, even if the broker call fails — logout must not be blockable.
 */

import {
  APP_ORIGIN,
  type CustomerAuthEnv,
  brokerFetch,
  checkAuthConfig,
  clearSessionCookieHeader,
  json,
  parseCookies,
  SESSION_COOKIE,
} from "../_lib";

export const onRequestPost: PagesFunction<CustomerAuthEnv> = async ({ request, env }) => {
  const misconfigured = checkAuthConfig(env);
  if (misconfigured) return misconfigured;

  if (request.headers.get("Origin") !== APP_ORIGIN) {
    return json(403, { error: "origin_mismatch" });
  }

  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (token) {
    await brokerFetch(env, "/v1/auth/logout", { session_token: token });
  }
  return json(200, { ok: true }, { "Set-Cookie": clearSessionCookieHeader() });
};

/** Anything but POST is refused — logout never happens via GET. */
export const onRequest: PagesFunction<CustomerAuthEnv> = async (ctx) => {
  if (ctx.request.method === "POST") return onRequestPost(ctx);
  return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
};
