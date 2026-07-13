/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Sweepr central authentication broker.
//!
//! Clerk proves WHO authenticated; this service decides WHICH app the login is
//! for, whether the person may enter it, and issues the app's own isolated
//! session. One deployment serves the standard instance (customer/cleaner/
//! business); a physically separate deployment with its own secrets serves
//! admin. Neither deployment holds the other's Clerk keys.
//!
//! Hard rules enforced here (not in frontends):
//!  - a session for one app never authenticates another app
//!  - authorization codes: single-use, ≤60s, app+callback+PKCE+tx bound
//!  - no bearer tokens in URLs; the browser only ever sees tx handles and codes
//!  - a live Clerk session is NEVER sufficient — completion requires a fresh,
//!    explicit ceremony (token issued-at freshness enforced)
//!  - fail closed: missing config disables the endpoint, never bypasses it

mod crypto;
mod db;
mod jwt;
mod registry;

use db::Db;
use registry::{app, AppId, AuthInstance};
use serde::Deserialize;
use serde_json::{json, Value};
use worker::*;

const TX_TTL_SECONDS: i64 = 300; // 5-minute login transactions
const CODE_TTL_SECONDS: i64 = 45; // one-time authorization codes
const CLERK_TOKEN_MAX_AGE: i64 = 120; // "explicit ceremony" freshness bound

struct Config {
    enabled: bool,
    deployment: AuthInstance,
    database_url: String,
    clerk_issuer: String,
    ip_salt: String,
    auth_page_origin: String,
}

fn config(env: &Env) -> std::result::Result<Config, Response> {
    let get = |k: &str| env.secret(k).map(|s| s.to_string()).or_else(|_| env.var(k).map(|v| v.to_string()));
    let enabled = get("CENTRAL_AUTH_ENABLED").map(|v| v == "true").unwrap_or(false);
    if !enabled {
        return Err(fail(503, "central_auth_disabled"));
    }
    let deployment = match get("BROKER_DEPLOYMENT").ok().as_deref() {
        Some("admin") => AuthInstance::Admin,
        Some("standard") => AuthInstance::Standard,
        _ => return Err(fail(503, "broker_deployment_unset")),
    };
    let (issuer_key, page_key) = match deployment {
        AuthInstance::Standard => ("CLERK_ISSUER", "AUTH_PAGE_ORIGIN"),
        AuthInstance::Admin => ("CLERK_ADMIN_ISSUER", "ADMIN_AUTH_PAGE_ORIGIN"),
    };
    let cfg = Config {
        enabled,
        deployment,
        database_url: get("DATABASE_URL").map_err(|_| fail(503, "database_unconfigured"))?,
        clerk_issuer: get(issuer_key).map_err(|_| fail(503, "clerk_issuer_unconfigured"))?,
        ip_salt: get("IP_HASH_SALT").map_err(|_| fail(503, "ip_salt_unconfigured"))?,
        auth_page_origin: get(page_key).map_err(|_| fail(503, "auth_page_unconfigured"))?,
    };
    Ok(cfg)
}

fn fail(status: u16, code: &str) -> Response {
    Response::from_json(&json!({ "error": code }))
        .map(|r| r.with_status(status))
        .unwrap_or_else(|_| Response::error("error", status).unwrap())
}

fn no_store(mut resp: Response) -> Response {
    let _ = resp.headers_mut().set("Cache-Control", "no-store");
    let _ = resp.headers_mut().set("X-Content-Type-Options", "nosniff");
    resp
}

/// Resolve which app a service key represents. The bearer key IS the app
/// identity — app_id is never trusted from a request body. Admin only exists
/// on the admin deployment; the standard deployment has no BROKER_KEY_ADMIN.
fn app_for_service_key(env: &Env, deployment: AuthInstance, header: Option<String>) -> Option<AppId> {
    let presented = header?.strip_prefix("Bearer ")?.to_string();
    let candidates: &[(AppId, &str)] = match deployment {
        AuthInstance::Standard => &[
            (AppId::Customer, "BROKER_KEY_CUSTOMER"),
            (AppId::Cleaner, "BROKER_KEY_CLEANER"),
            (AppId::Business, "BROKER_KEY_BUSINESS"),
        ],
        AuthInstance::Admin => &[(AppId::Admin, "BROKER_KEY_ADMIN")],
    };
    for (app_id, key_name) in candidates {
        if let Ok(secret) = env.secret(key_name) {
            if crypto::digest_eq(&crypto::digest(&secret.to_string()), &crypto::digest(&presented)) {
                return Some(*app_id);
            }
        }
    }
    None
}

fn now_epoch() -> i64 {
    (Date::now().as_millis() / 1000) as i64
}

fn client_meta(cfg: &Config, req: &Request) -> (Value, Value) {
    let ip = req
        .headers()
        .get("CF-Connecting-IP")
        .ok()
        .flatten()
        .unwrap_or_default();
    let ua = req.headers().get("User-Agent").ok().flatten().unwrap_or_default();
    (
        Value::String(crypto::correlation_hash(&cfg.ip_salt, &ip)),
        Value::String(crypto::correlation_hash(&cfg.ip_salt, &ua)),
    )
}

async fn audit(db: &Db, event: &str, app_id: Option<AppId>, instance: AuthInstance, detail: Value, ip_hash: &Value) {
    let _ = db
        .query(
            "INSERT INTO auth_audit_events (event_type, app_id, auth_instance, detail, ip_hash)
             VALUES ($1, $2, $3, $4, $5)",
            &[
                json!(event),
                app_id.map(|a| json!(a.as_str())).unwrap_or(Value::Null),
                json!(instance.as_str()),
                detail,
                ip_hash.clone(),
            ],
        )
        .await;
}

/// KV fixed-window rate limiter; fails CLOSED on KV errors for auth-critical
/// scopes (an attacker should not profit from breaking the limiter).
async fn rate_limit(env: &Env, scope: &str, key: &str, limit: u32, window_secs: u64) -> bool {
    let kv = match env.kv("RATE_KV") {
        Ok(kv) => kv,
        Err(_) => return false,
    };
    let bucket = now_epoch() as u64 / window_secs;
    let k = format!("rl:{scope}:{key}:{bucket}");
    let current: u32 = kv
        .get(&k)
        .text()
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if current >= limit {
        return false;
    }
    match kv.put(&k, (current + 1).to_string()) {
        Ok(p) => p.expiration_ttl(window_secs * 2).execute().await.is_ok(),
        Err(_) => false,
    }
}

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct CreateTransaction {
    return_path: Option<String>,
    pkce_challenge: String,
}

#[derive(Deserialize)]
struct CompleteTransaction {
    clerk_token: String,
    completion_token: String,
}

#[derive(Deserialize)]
struct Exchange {
    code: String,
    state: String,
    pkce_verifier: String,
}

#[derive(Deserialize)]
struct SessionRef {
    session_token: String,
}

// ── Entry ─────────────────────────────────────────────────────────────────────

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let cfg = match config(&env) {
        Ok(c) => c,
        Err(resp) => return Ok(no_store(resp)),
    };
    debug_assert!(cfg.enabled);

    let url = req.url()?;
    let path = url.path().to_string();
    let method = req.method();

    let resp = match (method, path.as_str()) {
        (Method::Post, "/v1/auth/transactions") => create_transaction(req, &env, &cfg).await,
        (Method::Get, p) if p.starts_with("/v1/auth/transactions/") && p.ends_with("/context") => {
            transaction_context(&req, &env, &cfg, p).await
        }
        (Method::Post, p) if p.starts_with("/v1/auth/transactions/") && p.ends_with("/complete") => {
            complete_transaction(req, &env, &cfg, p).await
        }
        (Method::Post, "/v1/auth/exchange") => exchange(req, &env, &cfg).await,
        (Method::Post, "/v1/auth/introspect") => introspect(req, &env, &cfg).await,
        (Method::Post, "/v1/auth/logout") => logout(req, &env, &cfg, false).await,
        (Method::Post, "/v1/auth/logout-all") => logout(req, &env, &cfg, true).await,
        (Method::Get, "/v1/health") => Ok(Response::from_json(&json!({ "ok": true }))?),
        _ => Ok(fail(404, "not_found")),
    };
    resp.map(no_store)
}

// ── Step 2: login transaction creation (server-to-server) ────────────────────

async fn create_transaction(mut req: Request, env: &Env, cfg: &Config) -> Result<Response> {
    let Some(app_id) = app_for_service_key(env, cfg.deployment, req.headers().get("Authorization")?) else {
        return Ok(fail(401, "service_auth_required"));
    };
    let def = app(app_id);
    if def.auth_instance != cfg.deployment {
        return Ok(fail(403, "wrong_auth_instance"));
    }
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let (ip_hash, ua_hash) = client_meta(cfg, &req);
    if !rate_limit(env, "tx", app_id.as_str(), 600, 60).await {
        audit(&db, "auth.transaction.rejected", Some(app_id), cfg.deployment, json!({"reason":"rate_limited"}), &ip_hash).await;
        return Ok(fail(429, "rate_limited"));
    }

    let body: CreateTransaction = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(fail(400, "invalid_body")),
    };
    if body.pkce_challenge.len() != 43
        || !body.pkce_challenge.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return Ok(fail(400, "invalid_pkce_challenge"));
    }

    let handle = crypto::random_token();
    let state = crypto::random_token();
    let completion = crypto::random_token(); // "nonce": binds context-fetch → completion
    let return_path = registry::sanitize_return_path(body.return_path.as_deref().unwrap_or("/"));

    db.query(
        "INSERT INTO auth_login_transactions
           (app_id, auth_instance, handle_digest, state_digest, state_value, nonce_digest,
            pkce_challenge, callback_uri, return_path, expires_at, created_ip_hash, created_ua_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() + make_interval(secs => $10), $11, $12)",
        &[
            json!(app_id.as_str()),
            json!(def.auth_instance.as_str()),
            json!(crypto::digest(&handle)),
            json!(crypto::digest(&state)),
            json!(state),
            json!(crypto::digest(&completion)),
            json!(body.pkce_challenge),
            json!(def.callback_uri),
            json!(return_path),
            json!(TX_TTL_SECONDS),
            ip_hash.clone(),
            ua_hash,
        ],
    )
    .await
    .map_err(|e| Error::RustError(e.0))?;

    audit(&db, "auth.transaction.created", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;

    // `state` returns ONLY to the app backend (it sets its own CSRF cookie);
    // the browser URL carries nothing but the opaque tx handle.
    Response::from_json(&json!({
        "transaction": handle,
        "state": state,
        "login_url": format!("{}/login?tx={handle}", cfg.auth_page_origin),
        "expires_in": TX_TTL_SECONDS,
    }))
}

// ── Step 4: app-specific auth context for the auth page (public) ─────────────

async fn transaction_context(req: &Request, env: &Env, cfg: &Config, path: &str) -> Result<Response> {
    let handle = path
        .trim_start_matches("/v1/auth/transactions/")
        .trim_end_matches("/context");
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let (ip_hash, _) = client_meta(cfg, req);
    if !rate_limit(env, "ctx", ip_hash.as_str().unwrap_or("?"), 60, 60).await {
        return Ok(fail(429, "rate_limited"));
    }

    // Rotate the completion token on every context fetch so only the page that
    // most recently rendered the ceremony can complete it.
    let completion = crypto::random_token();
    let row = db
        .query_one(
            "UPDATE auth_login_transactions
             SET nonce_digest = $2
             WHERE handle_digest = $1 AND status = 'pending' AND expires_at > NOW()
             RETURNING app_id, return_path",
            &[json!(crypto::digest(handle)), json!(crypto::digest(&completion))],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;

    let Some(row) = row else {
        return Ok(fail(404, "transaction_invalid_or_expired"));
    };
    let app_id = AppId::parse(row["app_id"].as_str().unwrap_or("")).ok_or(Error::RustError("bad app".into()))?;
    let def = app(app_id);

    Response::from_json(&json!({
        "app_id": def.app_id,
        "display_name": def.display_name,
        "application_origin": def.application_origin,
        "cancel_url": def.application_origin,
        "autocomplete_section": format!("section-sweepr-{}", def.app_id.as_str()),
        "completion_token": completion,
        "heading": format!("Sign in to {}", def.display_name),
    }))
}

// ── Steps 5–8: verify Clerk, authorize the app, issue a one-time code ────────

async fn complete_transaction(mut req: Request, env: &Env, cfg: &Config, path: &str) -> Result<Response> {
    let handle = path
        .trim_start_matches("/v1/auth/transactions/")
        .trim_end_matches("/complete");
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let (ip_hash, _) = client_meta(cfg, &req);
    if !rate_limit(env, "complete", ip_hash.as_str().unwrap_or("?"), 20, 60).await {
        return Ok(fail(429, "rate_limited"));
    }

    let body: CompleteTransaction = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(fail(400, "invalid_body")),
    };

    // Claim the transaction FIRST (single completion), binding the completion
    // token issued at context render. Anything invalid → generic failure.
    let row = db
        .query_one(
            "UPDATE auth_login_transactions
             SET status = 'authenticated'
             WHERE handle_digest = $1 AND nonce_digest = $2
               AND status = 'pending' AND expires_at > NOW()
             RETURNING id, app_id, auth_instance, callback_uri, pkce_challenge, state_value, return_path",
            &[json!(crypto::digest(handle)), json!(crypto::digest(&body.completion_token))],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;
    let Some(tx) = row else {
        audit(&db, "auth.authentication.failed", None, cfg.deployment, json!({"reason":"tx_invalid"}), &ip_hash).await;
        return Ok(fail(400, "transaction_invalid"));
    };
    let app_id = AppId::parse(tx["app_id"].as_str().unwrap_or("")).ok_or(Error::RustError("bad app".into()))?;
    let def = app(app_id);
    if def.auth_instance != cfg.deployment {
        return Ok(fail(403, "wrong_auth_instance"));
    }

    // Verify the Clerk token against THIS deployment's instance only.
    let jwks_url = format!("{}/.well-known/jwks.json", cfg.clerk_issuer.trim_end_matches('/'));
    let mut jwks_resp = Fetch::Url(jwks_url.parse().map_err(|_| Error::RustError("jwks url".into()))?)
        .send()
        .await?;
    let jwks: jwt::Jwks = jwks_resp.json().await?;
    let now = now_epoch();
    let claims = match jwt::verify_rs256(&body.clerk_token, &jwks, &cfg.clerk_issuer, None, now) {
        Ok(c) => c,
        Err(e) => {
            audit(&db, "auth.authentication.failed", Some(app_id), cfg.deployment, json!({"reason": format!("{e:?}")}), &ip_hash).await;
            return Ok(fail(401, "authentication_failed"));
        }
    };

    // Explicit-ceremony freshness: a lingering Clerk session must not complete
    // a login. The frontend performs sign-in/reverification, which mints a
    // token whose iat is now; stale tokens are refused.
    #[derive(Deserialize)]
    struct Iat { iat: Option<i64> }
    let iat = body
        .clerk_token
        .split('.')
        .nth(1)
        .and_then(|p| base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, p).ok())
        .and_then(|b| serde_json::from_slice::<Iat>(&b).ok())
        .and_then(|c| c.iat);
    match iat {
        Some(iat) if now - iat <= CLERK_TOKEN_MAX_AGE => {}
        _ => {
            audit(&db, "auth.reverification.required", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;
            return Ok(fail(401, "reverification_required"));
        }
    }

    // App authorization (authentication ≠ admission).
    let principal = authorize(&db, cfg, app_id, &claims).await;
    let principal_id = match principal {
        Ok(p) => p,
        Err(reason) => {
            audit(&db, "auth.authorization.denied", Some(app_id), cfg.deployment, json!({"reason": reason}), &ip_hash).await;
            return Ok(fail(403, "not_authorized_for_application"));
        }
    };

    // Issue the one-time code bound to tx/app/callback/PKCE.
    let code = crypto::random_token();
    db.query(
        "INSERT INTO auth_authorization_codes
           (transaction_id, code_digest, app_id, auth_instance, principal_user_id,
            clerk_user_id, callback_uri, pkce_challenge, expires_at)
         SELECT id, $2, app_id, auth_instance, ($3)::uuid, $4, callback_uri, pkce_challenge,
                NOW() + make_interval(secs => $5)
         FROM auth_login_transactions WHERE id = ($1)::uuid",
        &[
            tx["id"].clone(),
            json!(crypto::digest(&code)),
            principal_id.clone(),
            json!(claims.sub),
            json!(CODE_TTL_SECONDS),
        ],
    )
    .await
    .map_err(|e| Error::RustError(e.0))?;
    db.query(
        "UPDATE auth_login_transactions SET clerk_user_id = $2, principal_user_id = ($3)::uuid WHERE id = ($1)::uuid",
        &[tx["id"].clone(), json!(claims.sub), principal_id],
    )
    .await
    .map_err(|e| Error::RustError(e.0))?;

    audit(&db, "auth.code.issued", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;

    let state = tx["state_value"].as_str().unwrap_or("");
    let return_path = tx["return_path"].as_str().unwrap_or("/");
    Response::from_json(&json!({
        // Exact registered callback; the URL carries only the one-time code and
        // CSRF state — never a token.
        "redirect": format!("{}?code={code}&state={state}", def.callback_uri),
        "return_path": return_path,
    }))
}

/// App-specific admission. Returns principal users.id (may be NULL for a
/// brand-new customer whose row is created on first API touch).
async fn authorize(
    db: &Db,
    cfg: &Config,
    app_id: AppId,
    claims: &jwt::Claims,
) -> std::result::Result<Value, &'static str> {
    let user = db
        .query_one(
            "SELECT id, role FROM users WHERE clerk_id = $1 LIMIT 1",
            &[json!(claims.sub)],
        )
        .await
        .map_err(|_| "db_unavailable")?;

    match app_id {
        AppId::Customer => Ok(user.map(|u| u["id"].clone()).unwrap_or(Value::Null)),
        AppId::Business => Ok(user.map(|u| u["id"].clone()).unwrap_or(Value::Null)),
        AppId::Cleaner => {
            // Must have (or be building) a cleaner profile; suspension blocks.
            let Some(user) = user else { return Err("no_cleaner_profile") };
            let cleaner = db
                .query_one(
                    "SELECT to_jsonb(c) AS c FROM cleaners c WHERE c.user_id = ($1)::uuid LIMIT 1",
                    &[user["id"].clone()],
                )
                .await
                .map_err(|_| "db_unavailable")?;
            let Some(cleaner) = cleaner else { return Err("no_cleaner_profile") };
            let status = cleaner["c"]["status"].as_str().unwrap_or("");
            if status == "suspended" || status == "banned" || status == "deactivated" {
                return Err("cleaner_not_eligible");
            }
            Ok(user["id"].clone())
        }
        AppId::Admin => {
            // Admin deployment only; explicit provisioning required.
            if cfg.deployment != AuthInstance::Admin {
                return Err("admin_on_standard_deployment");
            }
            let Some(user) = user else { return Err("admin_not_provisioned") };
            let role = user["role"].as_str().unwrap_or("");
            if !role.ends_with("_admin") && role != "admin" && role != "super_admin" {
                return Err("admin_not_provisioned");
            }
            Ok(user["id"].clone())
        }
    }
}

// ── Step 9–10: code exchange → app session (server-to-server) ────────────────

async fn exchange(mut req: Request, env: &Env, cfg: &Config) -> Result<Response> {
    let Some(app_id) = app_for_service_key(env, cfg.deployment, req.headers().get("Authorization")?) else {
        return Ok(fail(401, "service_auth_required"));
    };
    let def = app(app_id);
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let (ip_hash, ua_hash) = client_meta(cfg, &req);
    if !rate_limit(env, "exchange", app_id.as_str(), 300, 60).await {
        return Ok(fail(429, "rate_limited"));
    }

    let body: Exchange = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(fail(400, "invalid_body")),
    };

    // Atomic single-use consumption with every binding in the WHERE clause.
    let row = db
        .query_one(
            "UPDATE auth_authorization_codes c
             SET consumed_at = NOW()
             FROM auth_login_transactions t
             WHERE c.code_digest = $1
               AND c.consumed_at IS NULL
               AND c.expires_at > NOW()
               AND c.app_id = $2
               AND c.callback_uri = $3
               AND t.id = c.transaction_id
               AND t.status = 'authenticated'
               AND t.state_digest = $4
             RETURNING c.id, c.transaction_id, c.principal_user_id, c.clerk_user_id,
                       c.pkce_challenge, c.auth_instance",
            &[
                json!(crypto::digest(&body.code)),
                json!(app_id.as_str()),
                json!(def.callback_uri),
                json!(crypto::digest(&body.state)),
            ],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;
    let Some(code) = row else {
        audit(&db, "auth.code.replay_blocked", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;
        return Ok(fail(400, "exchange_failed"));
    };

    // PKCE proof after the claim; failure marks the tx rejected (code is dead
    // either way — single use).
    if !crypto::pkce_challenge_matches(&body.pkce_verifier, code["pkce_challenge"].as_str().unwrap_or("")) {
        db.query(
            "UPDATE auth_login_transactions SET status = 'rejected' WHERE id = ($1)::uuid",
            &[code["transaction_id"].clone()],
        )
        .await
        .ok();
        audit(&db, "auth.transaction.rejected", Some(app_id), cfg.deployment, json!({"reason":"pkce"}), &ip_hash).await;
        return Ok(fail(400, "exchange_failed"));
    }

    // Complete the transaction exactly once.
    let completed = db
        .query_one(
            "UPDATE auth_login_transactions
             SET status = 'completed', completed_at = NOW()
             WHERE id = ($1)::uuid AND status = 'authenticated'
             RETURNING id",
            &[code["transaction_id"].clone()],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;
    if completed.is_none() {
        return Ok(fail(400, "exchange_failed"));
    }

    // Mint the opaque app session (32 random bytes; digest at rest).
    let token = crypto::random_token();
    let session = db
        .query_one(
            "INSERT INTO app_sessions
               (token_digest, app_id, auth_instance, principal_user_id, clerk_user_id,
                expires_at, created_ip_hash, created_ua_hash, last_ip_hash, last_ua_hash)
             VALUES ($1,$2,$3,($4)::uuid,$5, NOW() + make_interval(secs => $6), $7,$8,$7,$8)
             RETURNING id, expires_at",
            &[
                json!(crypto::digest(&token)),
                json!(app_id.as_str()),
                code["auth_instance"].clone(),
                code["principal_user_id"].clone(),
                code["clerk_user_id"].clone(),
                json!(def.session_ttl_seconds),
                ip_hash.clone(),
                ua_hash,
            ],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?
        .ok_or(Error::RustError("session insert failed".into()))?;

    audit(&db, "auth.session.created", Some(app_id), cfg.deployment, json!({"session_id": session["id"]}), &ip_hash).await;

    // Token goes ONLY to the app backend, which sets the host-only cookie.
    Response::from_json(&json!({
        "session_token": token,
        "session_id": session["id"],
        "expires_at": session["expires_at"],
        "cookie": {
            "name": def.cookie_name,
            "attributes": format!("Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age={}", def.session_ttl_seconds),
        },
    }))
}

// ── Introspection: the ONLY way an app validates signed-in state ──────────────

async fn introspect(mut req: Request, env: &Env, cfg: &Config) -> Result<Response> {
    let Some(app_id) = app_for_service_key(env, cfg.deployment, req.headers().get("Authorization")?) else {
        return Ok(fail(401, "service_auth_required"));
    };
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let body: SessionRef = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(fail(400, "invalid_body")),
    };
    let (ip_hash, ua_hash) = client_meta(cfg, &req);

    // App binding lives in the WHERE clause: a Business token presented by the
    // Customer BFF simply does not match — cross-app reuse is structurally
    // impossible, not merely discouraged.
    let row = db
        .query_one(
            "UPDATE app_sessions
             SET last_seen_at = NOW(), last_ip_hash = $3, last_ua_hash = $4
             WHERE token_digest = $1 AND app_id = $2
               AND revoked_at IS NULL AND expires_at > NOW()
             RETURNING id, principal_user_id, clerk_user_id, expires_at, authorization_version",
            &[
                json!(crypto::digest(&body.session_token)),
                json!(app_id.as_str()),
                ip_hash,
                ua_hash,
            ],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;

    match row {
        Some(s) => Response::from_json(&json!({
            "active": true,
            "app_id": app_id.as_str(),
            "principal_user_id": s["principal_user_id"],
            "clerk_user_id": s["clerk_user_id"],
            "expires_at": s["expires_at"],
        })),
        None => Response::from_json(&json!({ "active": false })),
    }
}

// ── Logout: app-specific by default; logout-all covers standard apps only ────

async fn logout(mut req: Request, env: &Env, cfg: &Config, all: bool) -> Result<Response> {
    let Some(app_id) = app_for_service_key(env, cfg.deployment, req.headers().get("Authorization")?) else {
        return Ok(fail(401, "service_auth_required"));
    };
    let db = Db::from_connection_string(&cfg.database_url).map_err(|e| Error::RustError(e.0))?;
    let body: SessionRef = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(fail(400, "invalid_body")),
    };
    let (ip_hash, _) = client_meta(cfg, &req);

    if all && cfg.deployment == AuthInstance::Standard {
        // "Sign out of all Sweepr apps" — every STANDARD session of the same
        // principal; never touches admin (separate deployment + tables scope).
        db.query(
            "UPDATE app_sessions SET revoked_at = NOW(), revocation_reason = 'global_logout'
             WHERE revoked_at IS NULL
               AND auth_instance = 'standard'
               AND principal_user_id = (
                 SELECT principal_user_id FROM app_sessions
                 WHERE token_digest = $1 AND app_id = $2 AND revoked_at IS NULL
               )
               AND principal_user_id IS NOT NULL",
            &[json!(crypto::digest(&body.session_token)), json!(app_id.as_str())],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;
        audit(&db, "auth.logout.global", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;
    } else {
        db.query(
            "UPDATE app_sessions SET revoked_at = NOW(), revocation_reason = 'logout'
             WHERE token_digest = $1 AND app_id = $2 AND revoked_at IS NULL",
            &[json!(crypto::digest(&body.session_token)), json!(app_id.as_str())],
        )
        .await
        .map_err(|e| Error::RustError(e.0))?;
        audit(&db, "auth.logout.app", Some(app_id), cfg.deployment, json!({}), &ip_hash).await;
    }
    Response::from_json(&json!({ "ok": true }))
}
