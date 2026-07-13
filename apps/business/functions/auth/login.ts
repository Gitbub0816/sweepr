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
 * GET /auth/login — start a central-auth login ceremony.
 *
 * Generates a PKCE verifier + S256 challenge, asks the broker to create a
 * login transaction (service-authenticated; the bearer key is the app
 * identity), stashes {verifier, state, tx, rp} in a short-lived HttpOnly
 * host-only cookie, and 302s the browser to the broker's hosted login page.
 * The URL carries only the opaque tx handle — never a token or state.
 *
 * ?fail=1 (set by the callback after a failed exchange) renders a static
 * error page instead of re-entering the loop.
 */

import {
  type BusinessAuthEnv,
  base64UrlEncode,
  brokerFetch,
  checkAuthConfig,
  json,
  loginCookieHeader,
  pkceChallengeS256,
  randomToken,
  sanitizeReturnPath,
} from "../_lib";

const FAIL_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in problem — Sweepr Business</title>
<style>body{font-family:system-ui,sans-serif;background:#1c1a17;color:#e7e4df;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:26rem;padding:2rem;text-align:center}a{color:#cfcbc4}</style></head>
<body><main><h1>We couldn't sign you in</h1>
<p>Something went wrong completing sign-in. This is usually temporary.</p>
<p><a href="/auth/login">Try signing in again</a></p></main></body></html>`;

export const onRequestGet: PagesFunction<BusinessAuthEnv> = async ({ request, env }) => {
  const misconfigured = checkAuthConfig(env);
  if (misconfigured) return misconfigured;

  const url = new URL(request.url);
  if (url.searchParams.get("fail") === "1") {
    return new Response(FAIL_PAGE, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const returnPath = sanitizeReturnPath(url.searchParams.get("return_to"));
  const verifier = randomToken(); // 43-char base64url of 32 random bytes
  const challenge = await pkceChallengeS256(verifier);

  const tx = await brokerFetch(env, "/v1/auth/transactions", {
    return_path: returnPath,
    pkce_challenge: challenge,
  });
  const loginUrl = tx.data?.login_url;
  const state = tx.data?.state;
  const handle = tx.data?.transaction;
  if (!tx.ok || typeof loginUrl !== "string" || typeof state !== "string" || typeof handle !== "string") {
    return json(502, { error: "auth_unavailable", broker_status: tx.status, broker_error: (tx.data && tx.data.error) || null });
  }

  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ verifier, state, tx: handle, rp: returnPath }))
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: loginUrl,
      "Set-Cookie": loginCookieHeader(payload),
      "Cache-Control": "no-store",
    },
  });
};
