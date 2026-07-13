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
 * GET /auth/session — introspect the current session for the frontend.
 *
 * Reads the HttpOnly session cookie, asks the broker (introspection is the
 * ONLY way signed-in state is validated), and returns a token-free JSON
 * summary. The session token never appears in the response body.
 */

import {
  type CustomerAuthEnv,
  brokerFetch,
  checkAuthConfig,
  json,
  parseCookies,
  SESSION_COOKIE,
} from "../_lib";

export const onRequestGet: PagesFunction<CustomerAuthEnv> = async ({ request, env }) => {
  const misconfigured = checkAuthConfig(env);
  if (misconfigured) return misconfigured;

  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!token) return json(200, { active: false });

  const res = await brokerFetch(env, "/v1/auth/introspect", { session_token: token });
  if (!res.ok || res.data?.active !== true) return json(200, { active: false });

  return json(200, {
    active: true,
    principal_user_id: res.data.principal_user_id ?? null,
    expires_at: res.data.expires_at ?? null,
  });
};
