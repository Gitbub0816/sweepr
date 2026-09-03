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
 * Mobile BFF — the iOS/Android apps' bridge into the central auth broker.
 *
 * A phone can never hold broker service keys, so this worker plays the role
 * the per-app Pages-Functions BFF plays on web: it is the only holder of
 * BROKER_KEY_CUSTOMER / BROKER_KEY_CLEANER on the mobile path. The app signs
 * in natively against Clerk (Clerk proves WHO), presents its fresh Clerk
 * session JWT here, and receives a long-lived broker app session (kept in the
 * device keychain — this is what makes sign-in persist) plus a short-lived
 * HS256 API token. The API token is the Bearer for every other route (verified
 * by requireAuth's BFF path, iss broker.getsweepr.com/bff); when it expires
 * the app re-mints from the broker session, which also slides the session's
 * idle expiry at the broker. Raw session tokens are never logged.
 *
 * Fail closed: any missing piece of broker config → 503, never a bypass.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../types";

export const mobileAuthRouter = new Hono<AppBindings>();

/** Mobile API tokens live longer than the web BFF's 120s to cut re-mint
 * chatter on cellular; still short enough that revocation (broker logout)
 * bites within minutes. */
const MOBILE_API_TOKEN_TTL_SECONDS = 600;

/** Issuer requireAuth recognizes as BFF-minted (must match middleware/auth.ts). */
const API_TOKEN_ISS = "https://broker.getsweepr.com/bff";

const MOBILE_APPS = ["customer", "cleaner"] as const;
type MobileApp = (typeof MOBILE_APPS)[number];

function brokerKeyFor(env: AppBindings["Bindings"], app: MobileApp): string | undefined {
  return app === "customer" ? env.BROKER_KEY_CUSTOMER : env.BROKER_KEY_CLEANER;
}

function brokerUrl(env: AppBindings["Bindings"]): string {
  // Off-zone Fly origin, same reasoning as the web BFFs: Cloudflare can't
  // inject the origin-verify header on same-zone Worker subrequests, so we
  // reach Fly directly and present the shared secret ourselves.
  return (env.BROKER_URL || "https://sweepr.fly.dev").replace(/\/+$/, "");
}

async function brokerFetch(
  env: AppBindings["Bindings"],
  app: MobileApp,
  path: string,
  body: unknown,
  clientIp: string | undefined,
  clientUa: string | undefined,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const key = brokerKeyFor(env, app);
  if (!key) return { ok: false, status: 503, data: null };
  try {
    const res = await fetch(`${brokerUrl(env)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(env.ORIGIN_SHARED_SECRET ? { "X-Sweepr-Origin-Verify": env.ORIGIN_SHARED_SECRET } : {}),
        // Forward the device's IP/UA so the broker's rate limits and
        // correlation hashes key on the phone, not this worker's egress.
        // Trusted because only origin-verified, keyed callers reach the broker.
        ...(clientIp ? { "CF-Connecting-IP": clientIp } : {}),
        ...(clientUa ? { "User-Agent": clientUa } : {}),
      },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      /* non-JSON broker error body */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Mint the short-lived HS256 API token requireAuth's BFF path verifies.
 * Identical claim shape to the web BFF's mintApiToken (apps/business). */
async function mintApiToken(
  secret: string,
  opts: { sub: string; app: MobileApp; principalUserId: string | null },
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + MOBILE_API_TOKEN_TTL_SECONDS;
  const enc = (o: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    iss: API_TOKEN_ISS,
    sub: opts.sub,
    app: opts.app,
    principal_user_id: opts.principalUserId,
    iat: now,
    exp,
  })}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return { token: `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`, expiresAt: exp * 1000 };
}

/** 503 unless every broker-path secret this app needs is present. */
function checkConfig(env: AppBindings["Bindings"], app: MobileApp): string | null {
  if (!brokerKeyFor(env, app)) return "auth_unconfigured";
  if (!env.API_BROKER_TOKEN_SECRET) return "auth_unconfigured";
  return null;
}

const appSchema = z.enum(MOBILE_APPS);

// POST /mobile-auth/session — Clerk proof → broker mobile session + API token.
const createSessionSchema = z.object({
  app: appSchema,
  clerkToken: z.string().min(20).max(4096),
});

mobileAuthRouter.post("/session", zValidator("json", createSessionSchema), async (c) => {
  const { app, clerkToken } = c.req.valid("json");
  const cfgErr = checkConfig(c.env, app);
  if (cfgErr) return c.json({ error: cfgErr }, 503);

  const ip = c.req.header("CF-Connecting-IP");
  const ua = c.req.header("User-Agent");
  const res = await brokerFetch(
    c.env, app, "/v1/auth/native/exchange", { clerk_token: clerkToken }, ip, ua,
  );
  if (!res.ok || !res.data) {
    // Surface the broker's own vocabulary (authentication_failed,
    // reverification_required, not_authorized_for_application, rate_limited)
    // so the app can react precisely; anything unshaped becomes a 502.
    const code = typeof res.data?.error === "string" ? res.data.error : "broker_unavailable";
    const status = res.status === 401 || res.status === 403 || res.status === 429 ? res.status : 502;
    return c.json({ error: code }, status as 401 | 403 | 429 | 502);
  }

  const sessionToken = res.data.session_token;
  const clerkUserId = res.data.clerk_user_id;
  if (typeof sessionToken !== "string" || typeof clerkUserId !== "string") {
    return c.json({ error: "broker_unavailable" }, 502);
  }
  const principalUserId =
    typeof res.data.principal_user_id === "string" ? res.data.principal_user_id : null;

  const minted = await mintApiToken(c.env.API_BROKER_TOKEN_SECRET as string, {
    sub: clerkUserId,
    app,
    principalUserId,
  });
  return c.json({
    sessionToken,
    sessionExpiresAt: typeof res.data.expires_at === "string" ? res.data.expires_at : null,
    apiToken: minted.token,
    apiTokenExpiresAt: minted.expiresAt,
  });
});

// POST /mobile-auth/token — broker session → fresh short-lived API token.
// Called on launch and whenever the previous token nears expiry; each call
// also slides the mobile session's idle window at the broker.
const sessionRefSchema = z.object({
  app: appSchema,
  sessionToken: z.string().min(20).max(256),
});

mobileAuthRouter.post("/token", zValidator("json", sessionRefSchema), async (c) => {
  const { app, sessionToken } = c.req.valid("json");
  const cfgErr = checkConfig(c.env, app);
  if (cfgErr) return c.json({ error: cfgErr }, 503);

  const ip = c.req.header("CF-Connecting-IP");
  const ua = c.req.header("User-Agent");
  const res = await brokerFetch(
    c.env, app, "/v1/auth/introspect", { session_token: sessionToken }, ip, ua,
  );
  if (!res.ok || !res.data) return c.json({ error: "broker_unavailable" }, 502);
  if (res.data.active !== true || typeof res.data.clerk_user_id !== "string") {
    // Revoked/expired/foreign session: the app clears its keychain and shows
    // sign-in. 401 (not 502) so the client can distinguish "sign in again"
    // from "try later".
    return c.json({ error: "session_inactive" }, 401);
  }
  const principalUserId =
    typeof res.data.principal_user_id === "string" ? res.data.principal_user_id : null;
  const minted = await mintApiToken(c.env.API_BROKER_TOKEN_SECRET as string, {
    sub: res.data.clerk_user_id,
    app,
    principalUserId,
  });
  return c.json({
    apiToken: minted.token,
    apiTokenExpiresAt: minted.expiresAt,
    sessionExpiresAt: typeof res.data.expires_at === "string" ? res.data.expires_at : null,
  });
});

// POST /mobile-auth/logout — revoke the broker session (sign out this device).
mobileAuthRouter.post("/logout", zValidator("json", sessionRefSchema), async (c) => {
  const { app, sessionToken } = c.req.valid("json");
  if (!brokerKeyFor(c.env, app)) return c.json({ error: "auth_unconfigured" }, 503);
  const ip = c.req.header("CF-Connecting-IP");
  const ua = c.req.header("User-Agent");
  await brokerFetch(c.env, app, "/v1/auth/logout", { session_token: sessionToken }, ip, ua);
  // Best-effort: the device wipes its keychain regardless; a broker blip must
  // not trap someone in a signed-in state.
  return c.json({ ok: true });
});
