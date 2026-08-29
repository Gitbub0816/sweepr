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
 * sweepr-mcp — MCP pricing-sandbox worker (mcp.getsweepr.com).
 *
 * An OAuth-2.1-protected MCP server that lets an external LLM (ChatGPT /
 * Claude) explore Sweepr's pricing config READ-ONLY, tweak a QUARANTINED
 * simulator config, run quote simulations, and emit a JSON payload a human
 * admin later uploads in the admin console. NO write path to live site data.
 *
 * Auth chain: MCP client registers (stateless signed client_id) → the human
 * admin signs in on /oauth/authorize against the SEPARATE admin Clerk
 * application → role-gated (owner / super_admin / finance) → auth code →
 * token exchange (PKCE S256) → Bearer access tokens on /mcp.
 *
 * Kill switch: MCP_ENABLED must be exactly "true" or everything is 503
 * (fail closed, mirroring the auth-broker convention).
 */

import { Hono, type Context } from "hono";
import { computeQuoteV2, buildColdStartConfig, type PricingConfigV2 } from "@sweepr/quote-engine";
import { getDb } from "./lib/db";
import { verifyAdminForPricing } from "./lib/adminAuth";
import {
  isAcceptableRedirectUri,
  mintClientId,
  verifyClientId,
  mintAuthCode,
  mintAccessToken,
  mintRefreshToken,
  verifyMcpToken,
  verifyPkce,
  ACCESS_TOKEN_TTL_SECONDS,
  type AuthCodeClaims,
  type SessionTokenClaims,
  type ShareTokenClaims,
} from "./lib/oauth";
import { handleMcpMessage } from "./mcp/protocol";
import { renderSimulatorPage, renderSimulatorErrorPage } from "./pages/simulator";
import type { AppBindings } from "./types";

const ISSUER = "https://mcp.getsweepr.com";
const RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource`;

// Public admin Clerk publishable key (pk_… may live in code) + its JS origin.
const ADMIN_CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuYWRtaW4uZ2V0c3dlZXByLmNvbSQ";
const ADMIN_CLERK_JS =
  "https://clerk.admin.getsweepr.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

const app = new Hono<AppBindings>();

// ── Kill switch: fail closed on every route ─────────────────────────────────
app.use("*", async (c, next) => {
  if (c.env.MCP_ENABLED !== "true") {
    return c.json({ error: "service_unavailable", message: "Sweepr MCP is disabled." }, 503);
  }
  if (!c.env.MCP_TOKEN_SECRET || !c.env.DATABASE_URL || !c.env.CLERK_ADMIN_SECRET_KEY) {
    return c.json({ error: "service_unavailable", message: "Sweepr MCP is not configured." }, 503);
  }
  await next();
});

// ── Minimal CORS (bearer auth, no cookies — '*' is safe here) ───────────────
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
      "Access-Control-Max-Age": "86400",
    });
  }
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
});

// ── OAuth server metadata (RFC 8414 + RFC 9728) ─────────────────────────────
function authServerMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

app.get("/.well-known/oauth-authorization-server", (c) => c.json(authServerMetadata()));
app.get("/.well-known/oauth-protected-resource", (c) =>
  c.json({
    resource: ISSUER,
    authorization_servers: [ISSUER],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
  }),
);

// ── Dynamic client registration (RFC 7591, stateless) ───────────────────────
app.post("/oauth/register", async (c) => {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }
  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAcceptableRedirectUri)) {
    return c.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be https URLs (or http://localhost for dev).",
      },
      400,
    );
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 200) : "MCP client";
  const clientId = await mintClientId(c.env.MCP_TOKEN_SECRET, uris, name);
  // Public client: no secret, PKCE required.
  return c.json(
    {
      client_id: clientId,
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
});

// ── Authorize page ──────────────────────────────────────────────────────────
app.get("/oauth/authorize", async (c) => {
  const q = c.req.query();
  const clientId = q.client_id ?? "";
  const redirectUri = q.redirect_uri ?? "";
  const state = q.state ?? "";
  const codeChallenge = q.code_challenge ?? "";

  const client = await verifyClientId(c.env.MCP_TOKEN_SECRET, clientId);
  if (!client) return c.text("Unknown client.", 400);
  if (!client.redirect_uris.includes(redirectUri)) {
    return c.text("redirect_uri does not match the registered client.", 400);
  }
  if (q.response_type !== "code") return c.text("Only response_type=code is supported.", 400);
  if (!codeChallenge || (q.code_challenge_method ?? "S256") !== "S256") {
    return c.text("PKCE with S256 is required.", 400);
  }

  const params = { clientId, redirectUri, state, codeChallenge };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sweepr admin sign-in</title>
<style>
  body { margin:0; background:#f9f8f6; color:#1c1a17;
         font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .wrap { max-width: 420px; margin: 48px auto; padding: 0 16px; }
  .wordmark { font-weight:800; font-size:24px; letter-spacing:-0.02em; margin-bottom:16px; }
  .wordmark span { color:#0d9488; }
  .card { background:#fff; border:1px solid #e7e5e2; border-radius:16px; padding:24px; }
  h1 { font-size:18px; margin:0 0 8px; }
  p { font-size:14px; color:#57524c; }
  button { width:100%; padding:12px; border:0; border-radius:12px; background:#0d9488;
           color:#fff; font:inherit; font-weight:700; cursor:pointer; margin-top:12px; }
  button:disabled { opacity:.5; cursor:default; }
  .err { color:#b91c1c; font-size:13px; margin-top:10px; }
  #signin { margin-top: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="wordmark">Sweepr<span>.</span></div>
  <div class="card">
    <h1>Connect ${escapeHtml(client.client_name)}</h1>
    <p>This grants <b>${escapeHtml(client.client_name)}</b> access to the Sweepr pricing sandbox
    (read-only pricing config plus your quarantined simulator). It can never change live pricing.
    Sign in with your Sweepr admin account to continue.</p>
    <div id="signin"></div>
    <button id="authorize" hidden>Authorize access</button>
    <div class="err" id="err" hidden></div>
  </div>
</div>
<script src="${ADMIN_CLERK_JS}" data-clerk-publishable-key="${ADMIN_CLERK_PUBLISHABLE_KEY}" crossorigin="anonymous"></script>
<script>
const PARAMS = ${JSON.stringify(params)};
const err = (m) => { const e = document.getElementById("err"); e.hidden = false; e.textContent = m; };
window.addEventListener("load", async () => {
  try {
    await window.Clerk.load();
    if (!window.Clerk.session) {
      window.Clerk.mountSignIn(document.getElementById("signin"));
      window.Clerk.addListener(({ session }) => { if (session) showAuthorize(); });
    } else {
      showAuthorize();
    }
  } catch (e) { err("Could not load sign-in: " + (e.message || e)); }
});
function showAuthorize() {
  const btn = document.getElementById("authorize");
  btn.hidden = false;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const token = await window.Clerk.session.getToken();
      const res = await fetch("/oauth/authorize/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clerk_token: token,
          client_id: PARAMS.clientId,
          redirect_uri: PARAMS.redirectUri,
          state: PARAMS.state,
          code_challenge: PARAMS.codeChallenge,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirect) throw new Error(data.error_description || data.error || "Authorization failed");
      window.location.href = data.redirect;
    } catch (e) { btn.disabled = false; err(e.message || String(e)); }
  };
}
</script>
</body>
</html>`;
  return c.html(html);
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Authorize completion: verify Clerk admin + role gate → mint code ────────
// (Called via fetch from the consent page, so it returns {redirect} JSON and
// the page navigates — the same net effect as a 302 back to the client.)
app.post("/oauth/authorize/complete", async (c) => {
  let body: {
    clerk_token?: string;
    client_id?: string;
    redirect_uri?: string;
    state?: string;
    code_challenge?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }
  const client = await verifyClientId(c.env.MCP_TOKEN_SECRET, body.client_id ?? "");
  if (!client || !body.redirect_uri || !client.redirect_uris.includes(body.redirect_uri)) {
    return c.json({ error: "invalid_client" }, 400);
  }
  if (!body.code_challenge || !body.clerk_token) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const verdict = await verifyAdminForPricing(c.env, sql, body.clerk_token);
  if (!verdict.ok) {
    return c.json(
      {
        error: "access_denied",
        error_description:
          verdict.reason === "insufficient_role" || verdict.reason === "no_user_row"
            ? "Your account does not have pricing access (finance or super admin required)."
            : "Admin sign-in could not be verified.",
      },
      403,
    );
  }

  const { code } = await mintAuthCode(c.env.MCP_TOKEN_SECRET, {
    adminEmail: verdict.admin.email,
    clientId: body.client_id as string,
    redirectUri: body.redirect_uri,
    codeChallenge: body.code_challenge,
  });

  // Audit the grant (best-effort).
  try {
    await sql`
      INSERT INTO mcp_action_log (admin_email, tool, detail)
      VALUES (${verdict.admin.email}, 'oauth_authorize',
              ${JSON.stringify({ client_name: client.client_name })}::jsonb)
    `;
  } catch {
    /* non-fatal */
  }

  const redirect = new URL(body.redirect_uri);
  redirect.searchParams.set("code", code);
  if (body.state) redirect.searchParams.set("state", body.state);
  return c.json({ redirect: redirect.toString() });
});

// ── Token endpoint ──────────────────────────────────────────────────────────
app.post("/oauth/token", async (c) => {
  // Accept both form-encoded (spec) and JSON bodies.
  let params: Record<string, string> = {};
  const contentType = c.req.header("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      params = (await c.req.json()) as Record<string, string>;
    } else {
      const form = await c.req.parseBody();
      for (const [k, v] of Object.entries(form)) if (typeof v === "string") params[k] = v;
    }
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const secret = c.env.MCP_TOKEN_SECRET;
  const grantType = params.grant_type;

  if (grantType === "authorization_code") {
    const claims = (await verifyMcpToken(secret, params.code ?? "", "code")) as AuthCodeClaims | null;
    if (!claims) return c.json({ error: "invalid_grant" }, 400);
    if (params.client_id && params.client_id !== claims.client_id) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (params.redirect_uri && params.redirect_uri !== claims.redirect_uri) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (!(await verifyPkce(claims.code_challenge, params.code_verifier ?? ""))) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    // Single-use enforcement via the append-only action log (SELECT then
    // INSERT — not serializable; accepted tradeoff at this scale given the
    // 60s TTL and PKCE requirement).
    const sql = getDb(c.env.DATABASE_URL);
    const used = (await sql`
      SELECT id FROM mcp_action_log
      WHERE tool = 'oauth_code_use' AND detail->>'jti' = ${claims.jti} LIMIT 1
    `) as Array<{ id: string }>;
    if (used.length > 0) return c.json({ error: "invalid_grant", error_description: "Code already used" }, 400);
    await sql`
      INSERT INTO mcp_action_log (admin_email, tool, detail)
      VALUES (${claims.admin_email}, 'oauth_code_use', ${JSON.stringify({ jti: claims.jti })}::jsonb)
    `;

    return c.json({
      access_token: await mintAccessToken(secret, claims.admin_email),
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: await mintRefreshToken(secret, claims.admin_email),
      scope: "mcp",
    });
  }

  if (grantType === "refresh_token") {
    const claims = (await verifyMcpToken(
      secret,
      params.refresh_token ?? "",
      "refresh",
    )) as SessionTokenClaims | null;
    if (!claims) return c.json({ error: "invalid_grant" }, 400);
    // Rotate: issue a fresh pair. (Stateless tokens can't be revoked
    // individually — the kill moves are MCP_ENABLED=false or rotating
    // MCP_TOKEN_SECRET, both of which cut everything instantly.)
    return c.json({
      access_token: await mintAccessToken(secret, claims.admin_email),
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: await mintRefreshToken(secret, claims.admin_email),
      scope: "mcp",
    });
  }

  return c.json({ error: "unsupported_grant_type" }, 400);
});

// ── MCP endpoint (streamable HTTP, single-response mode) ────────────────────
function unauthorized(c: Context<AppBindings>) {
  return c.json({ error: "unauthorized" }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
  });
}

app.post("/mcp", async (c) => {
  const header = c.req.header("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return unauthorized(c);
  const claims = (await verifyMcpToken(
    c.env.MCP_TOKEN_SECRET,
    header.slice("Bearer ".length),
    "access",
  )) as SessionTokenClaims | null;
  if (!claims || typeof claims.admin_email !== "string") return unauthorized(c);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const ctx = { sql: getDb(c.env.DATABASE_URL), env: c.env, adminEmail: claims.admin_email };
  const out = await handleMcpMessage(ctx, raw);
  if (out.body === null) return c.body(null, out.status as 202);
  return c.json(out.body, out.status as 200);
});

// Clients probing GET /mcp (SSE mode) get a clean "not supported".
app.get("/mcp", (c) => c.json({ error: "method_not_allowed" }, 405));
app.delete("/mcp", (c) => c.body(null, 204)); // session teardown: nothing to tear down

// ── Simulator page (share-token gated, read-only) ───────────────────────────
async function resolveShare(
  c: { env: AppBindings["Bindings"] },
  token: string,
): Promise<{ adminEmail: string; name: string } | null> {
  const claims = (await verifyMcpToken(c.env.MCP_TOKEN_SECRET, token, "share")) as ShareTokenClaims | null;
  if (!claims || typeof claims.admin_email !== "string" || typeof claims.name !== "string") return null;
  return { adminEmail: claims.admin_email, name: claims.name };
}

async function loadShareConfig(
  env: AppBindings["Bindings"],
  adminEmail: string,
  name: string,
): Promise<{ config: PricingConfigV2; found: boolean }> {
  const sql = getDb(env.DATABASE_URL);
  const rows = (await sql`
    SELECT config FROM mcp_simulator_configs
    WHERE admin_email = ${adminEmail} AND name = ${name} LIMIT 1
  `) as Array<{ config: PricingConfigV2 }>;
  if (rows[0]) return { config: rows[0].config, found: true };
  return { config: buildColdStartConfig(), found: false };
}

app.get("/simulator", async (c) => {
  const token = c.req.query("token") ?? "";
  const share = await resolveShare(c, token);
  if (!share) return c.html(renderSimulatorErrorPage(), 403);
  const { config, found } = await loadShareConfig(c.env, share.adminEmail, share.name);
  return c.html(
    renderSimulatorPage({ token, name: share.name, extras: config.extras, configFound: found }),
  );
});

app.post("/simulator/quote", async (c) => {
  let body: { token?: string; input?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
  const share = await resolveShare(c, body.token ?? "");
  if (!share) return c.json({ error: "This simulator link has expired. Ask your assistant for a fresh one." }, 403);
  const { config } = await loadShareConfig(c.env, share.adminEmail, share.name);

  const input = body.input ?? {};
  const counts = (input.counts ?? {}) as Record<string, number>;
  const conditions = (input.conditions ?? {}) as Record<string, number>;
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
  try {
    const result = computeQuoteV2(
      config,
      {
        serviceArea: "default",
        currency: "USD",
        counts: {
          kitchen: clamp(counts.kitchen, 0, 6, 1),
          bathroom: clamp(counts.bathroom, 0, 12, 1),
          bedroom: clamp(counts.bedroom, 0, 14, 1),
          living_room: clamp(counts.living_room, 0, 8, 1),
        },
        conditions: {
          kitchen: clamp(conditions.kitchen, 1, 4, 2) as 1 | 2 | 3 | 4,
          bathroom: clamp(conditions.bathroom, 1, 4, 2) as 1 | 2 | 3 | 4,
          bedroom: clamp(conditions.bedroom, 1, 4, 2) as 1 | 2 | 3 | 4,
          living_room: clamp(conditions.living_room, 1, 4, 2) as 1 | 2 | 3 | 4,
        },
        sqft: typeof input.sqft === "number" ? input.sqft : undefined,
        extras: Array.isArray(input.extras)
          ? (input.extras as Array<{ key: string; quantity: number }>).slice(0, 30)
          : [],
      },
      { pricingVersionId: "mcp-sim" },
    );
    return c.json({ result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Quote failed" }, 400);
  }
});

// ── Root ────────────────────────────────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    service: "sweepr-mcp",
    description: "Sweepr pricing sandbox MCP server (quarantined; no write path to live data).",
    mcp_endpoint: `${ISSUER}/mcp`,
    oauth_metadata: `${ISSUER}/.well-known/oauth-authorization-server`,
  }),
);

export default app;
