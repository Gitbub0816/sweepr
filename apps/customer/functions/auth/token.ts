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
 * GET /auth/token — mint a short-lived API bearer for central-auth mode.
 *
 * The browser can't read the HttpOnly broker session cookie, and the API
 * (api.getsweepr.com) is a different origin so the cookie never reaches it.
 * This BFF holds the session: it introspects it via the broker, then mints a
 * short-lived HS256 token carrying the primary-instance Clerk user id. The
 * frontend sends THAT to the API as `Authorization: Bearer`. The broker
 * session token itself never leaves the BFF.
 *
 * Fails closed: no session / inactive / unconfigured → no token.
 */

import {
  type CustomerAuthEnv,
  APP_ID,
  brokerFetch,
  checkAuthConfig,
  json,
  mintApiToken,
  parseCookies,
  SESSION_COOKIE,
} from "../_lib";

export const onRequestGet: PagesFunction<CustomerAuthEnv> = async ({ request, env }) => {
  const misconfigured = checkAuthConfig(env);
  if (misconfigured) return misconfigured;
  if (!env.API_BROKER_TOKEN_SECRET) return json(503, { error: "api_token_unconfigured" });

  const session = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!session) return json(401, { error: "no_session" });

  const res = await brokerFetch(env, "/v1/auth/introspect", { session_token: session });
  if (!res.ok || res.data?.active !== true) return json(401, { error: "session_inactive" });

  const clerkUserId = typeof res.data.clerk_user_id === "string" ? res.data.clerk_user_id : null;
  const principal =
    typeof res.data.principal_user_id === "string" ? res.data.principal_user_id : null;
  if (!clerkUserId) return json(401, { error: "no_identity" });

  const minted = await mintApiToken(env.API_BROKER_TOKEN_SECRET, {
    sub: clerkUserId,
    app: APP_ID,
    principalUserId: principal,
  });
  return json(200, { token: minted.token, expires_at: minted.expiresAt });
};
