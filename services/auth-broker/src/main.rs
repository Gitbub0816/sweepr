/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Sweepr central authentication broker — native Linux service (Axum + sqlx),
//! deployed to Fly.io behind Cloudflare at auth.getsweepr.com.
//!
//! Clerk proves WHO authenticated; this service decides WHICH app the login is
//! for, whether the person may enter, and issues that app's own isolated
//! session. Hard rules enforced here (never in a frontend):
//!  - a session for one app never authenticates another app
//!  - one-time authorization codes: single-use, ≤60s, app+callback+PKCE+state
//!    bound, consumed by an atomic conditional UPDATE
//!  - no bearer tokens in URLs; the browser sees only tx handles and codes
//!  - a live Clerk session is never sufficient — completion needs a fresh
//!    ceremony (token iat freshness enforced)
//!  - fail closed: missing config disables an endpoint, never bypasses it

mod crypto;
mod jwt;
mod registry;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use time::OffsetDateTime;
use tokio::sync::Mutex;
use uuid::Uuid;

use registry::{app, AppId, AuthInstance};

const TX_TTL_SECONDS: i64 = 300; // 5-minute login transactions
const CODE_TTL_SECONDS: i64 = 45; // one-time authorization codes
const CLERK_TOKEN_MAX_AGE: i64 = 120; // "explicit ceremony" freshness bound

// ── Configuration (fail closed) ───────────────────────────────────────────────

struct Config {
    deployment: AuthInstance,
    clerk_issuer: String,
    ip_salt: String,
    auth_page_origin: String,
    public_host: String,
    origin_shared_secret: Option<String>,
    broker_keys: HashMap<AppId, String>,
}

impl Config {
    fn from_env() -> Result<Self, String> {
        if std::env::var("CENTRAL_AUTH_ENABLED").ok().as_deref() != Some("true") {
            return Err("CENTRAL_AUTH_ENABLED must be 'true'".into());
        }
        let deployment = match std::env::var("BROKER_DEPLOYMENT").ok().as_deref() {
            // This Fly deployment is standard-only by design; admin auth is a
            // separate, out-of-scope deployment. Default to standard.
            Some("standard") | None => AuthInstance::Standard,
            Some("admin") => AuthInstance::Admin,
            _ => return Err("BROKER_DEPLOYMENT invalid".into()),
        };
        let req = |k: &str| std::env::var(k).map_err(|_| format!("{k} is required"));
        let (issuer_key, page_key) = match deployment {
            AuthInstance::Standard => ("CLERK_ISSUER", "AUTH_PAGE_ORIGIN"),
            AuthInstance::Admin => ("CLERK_ADMIN_ISSUER", "ADMIN_AUTH_PAGE_ORIGIN"),
        };
        let mut broker_keys = HashMap::new();
        for (app_id, key_name) in [
            (AppId::Customer, "BROKER_KEY_CUSTOMER"),
            (AppId::Cleaner, "BROKER_KEY_CLEANER"),
            (AppId::Business, "BROKER_KEY_BUSINESS"),
        ] {
            if deployment == AuthInstance::Standard {
                if let Ok(v) = std::env::var(key_name) {
                    if !v.is_empty() {
                        broker_keys.insert(app_id, v);
                    }
                }
            }
        }
        if deployment == AuthInstance::Standard && broker_keys.is_empty() {
            return Err("at least one BROKER_KEY_* service key is required".into());
        }
        Ok(Config {
            deployment,
            clerk_issuer: req(issuer_key)?,
            ip_salt: req("IP_HASH_SALT")?,
            auth_page_origin: req(page_key)?,
            public_host: std::env::var("PUBLIC_HOST")
                .unwrap_or_else(|_| "auth.getsweepr.com".into()),
            origin_shared_secret: std::env::var("ORIGIN_SHARED_SECRET")
                .ok()
                .filter(|s| !s.is_empty()),
            broker_keys,
        })
    }
}

struct AppState {
    cfg: Config,
    pool: PgPool,
    http: reqwest::Client,
    limiter: Mutex<HashMap<String, (u64, u32)>>,
}

type SharedState = Arc<AppState>;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    let cfg = Config::from_env().map_err(|e| {
        // Fail closed and loud: the process refuses to start misconfigured.
        tracing::error!(reason = %e, "startup configuration invalid");
        e
    })?;

    let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let state: SharedState = Arc::new(AppState {
        cfg,
        pool,
        http,
        limiter: Mutex::new(HashMap::new()),
    });

    let app = Router::new()
        // Unauthenticated, lightweight liveness check for Fly.
        .route("/healthz", get(healthz))
        .route("/v1/auth/transactions", post(create_transaction))
        .route(
            "/v1/auth/transactions/:tx/context",
            get(transaction_context),
        )
        .route(
            "/v1/auth/transactions/:tx/complete",
            post(complete_transaction),
        )
        .route("/v1/auth/exchange", post(exchange))
        .route("/v1/auth/introspect", post(introspect))
        .route("/v1/auth/logout", post(logout_app))
        .route("/v1/auth/logout-all", post(logout_all))
        .layer(middleware::from_fn_with_state(state.clone(), origin_guard))
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "sweepr-auth listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

// ── Origin verification: reject direct .fly.dev / missing shared secret ──────

async fn origin_guard(
    State(state): State<SharedState>,
    headers: HeaderMap,
    req: axum::extract::Request,
    next: Next,
) -> Response {
    // Fly health checks hit /healthz directly on the origin; exempt it (it
    // reveals only "ok").
    if req.uri().path() == "/healthz" {
        return next.run(req).await;
    }
    if let Some(expected) = state.cfg.origin_shared_secret.as_deref() {
        let host = headers
            .get("host")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let presented = headers
            .get("x-sweepr-origin-verify")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");
        let host_ok = host == state.cfg.public_host;
        let secret_ok = crypto::digest_eq(&crypto::digest(presented), &crypto::digest(expected));
        if !host_ok || !secret_ok || presented.is_empty() {
            return fail(StatusCode::FORBIDDEN, "origin_forbidden");
        }
    }
    next.run(req).await
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn fail(status: StatusCode, code: &str) -> Response {
    (status, no_store(), Json(json!({ "error": code }))).into_response()
}

fn no_store() -> [(&'static str, &'static str); 2] {
    [
        ("cache-control", "no-store"),
        ("x-content-type-options", "nosniff"),
    ]
}

fn now_epoch() -> i64 {
    OffsetDateTime::now_utc().unix_timestamp()
}

/// The bearer service key IS the app identity; app_id is never trusted from a
/// body. Constant-time compared against each configured key.
fn app_for_service_key(state: &AppState, headers: &HeaderMap) -> Option<AppId> {
    let presented = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))?;
    let presented_digest = crypto::digest(presented);
    for (app_id, key) in &state.cfg.broker_keys {
        if crypto::digest_eq(&presented_digest, &crypto::digest(key)) {
            return Some(*app_id);
        }
    }
    None
}

fn ip_ua_hashes(state: &AppState, headers: &HeaderMap) -> (String, String) {
    let ip = headers
        .get("cf-connecting-ip")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let ua = headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    (
        crypto::correlation_hash(&state.cfg.ip_salt, ip),
        crypto::correlation_hash(&state.cfg.ip_salt, ua),
    )
}

/// In-memory fixed-window limiter (min_machines_running = 1, so a single
/// counter is authoritative for this deployment). Fails CLOSED on lock issues.
async fn rate_limit(state: &AppState, scope: &str, key: &str, limit: u32, window: u64) -> bool {
    let bucket = now_epoch() as u64 / window;
    let k = format!("{scope}:{key}:{bucket}");
    let mut map = state.limiter.lock().await;
    // Opportunistic prune so the map can't grow unbounded across windows.
    if map.len() > 50_000 {
        map.retain(|_, (b, _)| *b == bucket);
    }
    let entry = map.entry(k).or_insert((bucket, 0));
    if entry.1 >= limit {
        return false;
    }
    entry.1 += 1;
    true
}

async fn audit(state: &AppState, event: &str, app_id: Option<AppId>, detail: Value, ip_hash: &str) {
    let _ = sqlx::query(
        "INSERT INTO auth_audit_events (event_type, app_id, auth_instance, detail, ip_hash)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(event)
    .bind(app_id.map(|a| a.as_str()))
    .bind(state.cfg.deployment.as_str())
    .bind(detail)
    .bind(ip_hash)
    .execute(&state.pool)
    .await;
}

// ── Health ────────────────────────────────────────────────────────────────────

async fn healthz() -> Response {
    (
        StatusCode::OK,
        [
            ("cache-control", "no-store"),
            ("content-type", "text/plain"),
        ],
        "ok",
    )
        .into_response()
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

// ── Step 2: create login transaction (server-to-server) ──────────────────────

async fn create_transaction(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateTransaction>,
) -> Response {
    let Some(app_id) = app_for_service_key(&state, &headers) else {
        return fail(StatusCode::UNAUTHORIZED, "service_auth_required");
    };
    let def = app(app_id);
    if def.auth_instance != state.cfg.deployment {
        return fail(StatusCode::FORBIDDEN, "wrong_auth_instance");
    }
    let (ip_hash, ua_hash) = ip_ua_hashes(&state, &headers);
    if !rate_limit(&state, "tx", app_id.as_str(), 600, 60).await {
        return fail(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    }
    if body.pkce_challenge.len() != 43
        || !body
            .pkce_challenge
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return fail(StatusCode::BAD_REQUEST, "invalid_pkce_challenge");
    }

    let handle = crypto::random_token();
    let state_val = crypto::random_token();
    let completion = crypto::random_token();
    let return_path = registry::sanitize_return_path(body.return_path.as_deref().unwrap_or("/"));

    let res = sqlx::query(
        "INSERT INTO auth_login_transactions
           (app_id, auth_instance, handle_digest, state_digest, state_value, nonce_digest,
            pkce_challenge, callback_uri, return_path, expires_at, created_ip_hash, created_ua_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW() + make_interval(secs => $10), $11, $12)",
    )
    .bind(app_id.as_str())
    .bind(def.auth_instance.as_str())
    .bind(crypto::digest(&handle))
    .bind(crypto::digest(&state_val))
    .bind(&state_val)
    .bind(crypto::digest(&completion))
    .bind(&body.pkce_challenge)
    .bind(def.callback_uri)
    .bind(&return_path)
    .bind(TX_TTL_SECONDS as f64)
    .bind(&ip_hash)
    .bind(&ua_hash)
    .execute(&state.pool)
    .await;
    if res.is_err() {
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error");
    }

    audit(
        &state,
        "auth.transaction.created",
        Some(app_id),
        json!({}),
        &ip_hash,
    )
    .await;
    (
        StatusCode::OK,
        no_store(),
        Json(json!({
            "transaction": handle,
            "state": state_val,
            "login_url": format!("{}/login?tx={handle}", state.cfg.auth_page_origin),
            "expires_in": TX_TTL_SECONDS,
        })),
    )
        .into_response()
}

// ── Step 4: app-specific auth context for the auth page (public) ─────────────

async fn transaction_context(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(tx): Path<String>,
) -> Response {
    let (ip_hash, _) = ip_ua_hashes(&state, &headers);
    if !rate_limit(&state, "ctx", &ip_hash, 120, 60).await {
        return fail(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    }
    // Rotate the completion token every render so only the most recent page
    // that displayed the ceremony can complete it.
    let completion = crypto::random_token();
    let row = sqlx::query(
        "UPDATE auth_login_transactions
         SET nonce_digest = $2
         WHERE handle_digest = $1 AND status = 'pending' AND expires_at > NOW()
         RETURNING app_id",
    )
    .bind(crypto::digest(&tx))
    .bind(crypto::digest(&completion))
    .fetch_optional(&state.pool)
    .await;

    let Ok(Some(row)) = row else {
        return fail(StatusCode::NOT_FOUND, "transaction_invalid_or_expired");
    };
    let app_id = match AppId::parse(row.get::<String, _>("app_id").as_str()) {
        Some(a) => a,
        None => return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error"),
    };
    let def = app(app_id);
    (
        StatusCode::OK,
        no_store(),
        Json(json!({
            "app_id": def.app_id,
            "display_name": def.display_name,
            "application_origin": def.application_origin,
            "cancel_url": def.application_origin,
            "autocomplete_section": format!("section-sweepr-{}", def.app_id.as_str()),
            "completion_token": completion,
            "heading": format!("Sign in to {}", def.display_name),
        })),
    )
        .into_response()
}

// ── Steps 5–8: verify Clerk, authorize, issue one-time code ──────────────────

async fn complete_transaction(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(tx): Path<String>,
    Json(body): Json<CompleteTransaction>,
) -> Response {
    let (ip_hash, _) = ip_ua_hashes(&state, &headers);
    if !rate_limit(&state, "complete", &ip_hash, 20, 60).await {
        return fail(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    }

    // Claim the transaction first (single completion), bound to the completion
    // token issued at context render.
    let row = sqlx::query(
        "UPDATE auth_login_transactions
         SET status = 'authenticated'
         WHERE handle_digest = $1 AND nonce_digest = $2
           AND status = 'pending' AND expires_at > NOW()
         RETURNING id, app_id",
    )
    .bind(crypto::digest(&tx))
    .bind(crypto::digest(&body.completion_token))
    .fetch_optional(&state.pool)
    .await;
    let Ok(Some(row)) = row else {
        audit(
            &state,
            "auth.authentication.failed",
            None,
            json!({"reason":"tx_invalid"}),
            &ip_hash,
        )
        .await;
        return fail(StatusCode::BAD_REQUEST, "transaction_invalid");
    };
    let tx_id: Uuid = row.get("id");
    let app_id = match AppId::parse(row.get::<String, _>("app_id").as_str()) {
        Some(a) => a,
        None => return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error"),
    };
    if app(app_id).auth_instance != state.cfg.deployment {
        return fail(StatusCode::FORBIDDEN, "wrong_auth_instance");
    }

    // Verify the Clerk token against THIS deployment's instance only.
    let jwks = match jwt::fetch_jwks(&state.http, &state.cfg.clerk_issuer).await {
        Ok(j) => j,
        Err(_) => return fail(StatusCode::BAD_GATEWAY, "identity_provider_unavailable"),
    };
    let now = now_epoch();
    let claims =
        match jwt::verify_rs256(&body.clerk_token, &jwks, &state.cfg.clerk_issuer, None, now) {
            Ok(c) => c,
            Err(e) => {
                audit(
                    &state,
                    "auth.authentication.failed",
                    Some(app_id),
                    json!({"reason": format!("{e:?}")}),
                    &ip_hash,
                )
                .await;
                return fail(StatusCode::UNAUTHORIZED, "authentication_failed");
            }
        };

    // Explicit-ceremony freshness: a lingering Clerk session must not complete
    // a login. The frontend re-authenticates, minting a token with iat≈now.
    if !token_is_fresh(&body.clerk_token, now) {
        audit(
            &state,
            "auth.reverification.required",
            Some(app_id),
            json!({}),
            &ip_hash,
        )
        .await;
        return fail(StatusCode::UNAUTHORIZED, "reverification_required");
    }

    // App admission (authentication ≠ authorization).
    let principal_id = match authorize(&state, app_id, &claims).await {
        Ok(p) => p,
        Err(reason) => {
            audit(
                &state,
                "auth.authorization.denied",
                Some(app_id),
                json!({"reason": reason}),
                &ip_hash,
            )
            .await;
            return fail(StatusCode::FORBIDDEN, "not_authorized_for_application");
        }
    };

    let code = crypto::random_token();
    let ins = sqlx::query(
        "INSERT INTO auth_authorization_codes
           (transaction_id, code_digest, app_id, auth_instance, principal_user_id,
            clerk_user_id, callback_uri, pkce_challenge, expires_at)
         SELECT id, $2, app_id, auth_instance, $3, $4, callback_uri, pkce_challenge,
                NOW() + make_interval(secs => $5)
         FROM auth_login_transactions WHERE id = $1",
    )
    .bind(tx_id)
    .bind(crypto::digest(&code))
    .bind(principal_id)
    .bind(&claims.sub)
    .bind(CODE_TTL_SECONDS as f64)
    .execute(&state.pool)
    .await;
    if ins.is_err() {
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error");
    }
    let _ = sqlx::query(
        "UPDATE auth_login_transactions SET clerk_user_id = $2, principal_user_id = $3 WHERE id = $1",
    )
    .bind(tx_id)
    .bind(&claims.sub)
    .bind(principal_id)
    .execute(&state.pool)
    .await;

    audit(
        &state,
        "auth.code.issued",
        Some(app_id),
        json!({}),
        &ip_hash,
    )
    .await;

    let def = app(app_id);
    let tx_row =
        sqlx::query("SELECT state_value, return_path FROM auth_login_transactions WHERE id = $1")
            .bind(tx_id)
            .fetch_one(&state.pool)
            .await;
    let (state_val, return_path) = match tx_row {
        Ok(r) => (
            r.get::<String, _>("state_value"),
            r.get::<String, _>("return_path"),
        ),
        Err(_) => return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error"),
    };
    (
        StatusCode::OK,
        no_store(),
        Json(json!({
            "redirect": format!("{}?code={code}&state={state_val}", def.callback_uri),
            "return_path": return_path,
        })),
    )
        .into_response()
}

/// A Clerk token's `iat` must be within CLERK_TOKEN_MAX_AGE — proof the user
/// performed an explicit action now, not merely that a session lingered.
fn token_is_fresh(token: &str, now: i64) -> bool {
    #[derive(Deserialize)]
    struct Iat {
        iat: Option<i64>,
    }
    use base64::Engine;
    token
        .split('.')
        .nth(1)
        .and_then(|p| {
            base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(p)
                .ok()
        })
        .and_then(|b| serde_json::from_slice::<Iat>(&b).ok())
        .and_then(|c| c.iat)
        .map(|iat| now - iat <= CLERK_TOKEN_MAX_AGE && iat - now <= CLERK_TOKEN_MAX_AGE)
        .unwrap_or(false)
}

/// App-specific admission. Returns the principal users.id (None for a
/// brand-new customer whose row is created on first API touch).
async fn authorize(
    state: &AppState,
    app_id: AppId,
    claims: &jwt::Claims,
) -> Result<Option<Uuid>, &'static str> {
    let user = sqlx::query("SELECT id, role FROM users WHERE clerk_id = $1 LIMIT 1")
        .bind(&claims.sub)
        .fetch_optional(&state.pool)
        .await
        .map_err(|_| "db_unavailable")?;

    match app_id {
        AppId::Customer | AppId::Business => Ok(user.map(|u| u.get::<Uuid, _>("id"))),
        AppId::Cleaner => {
            let Some(user) = user else {
                return Err("no_cleaner_profile");
            };
            let uid: Uuid = user.get("id");
            let cleaner = sqlx::query("SELECT status FROM cleaners WHERE user_id = $1 LIMIT 1")
                .bind(uid)
                .fetch_optional(&state.pool)
                .await
                .map_err(|_| "db_unavailable")?;
            let Some(cleaner) = cleaner else {
                return Err("no_cleaner_profile");
            };
            let status: String = cleaner.try_get("status").unwrap_or_default();
            if matches!(status.as_str(), "suspended" | "banned" | "deactivated") {
                return Err("cleaner_not_eligible");
            }
            Ok(Some(uid))
        }
        AppId::Admin => {
            if state.cfg.deployment != AuthInstance::Admin {
                return Err("admin_on_standard_deployment");
            }
            let Some(user) = user else {
                return Err("admin_not_provisioned");
            };
            let role: String = user.try_get("role").unwrap_or_default();
            if !role.ends_with("_admin") && role != "admin" && role != "super_admin" {
                return Err("admin_not_provisioned");
            }
            Ok(Some(user.get::<Uuid, _>("id")))
        }
    }
}

// ── Steps 9–10: code exchange → app session (server-to-server) ───────────────

async fn exchange(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<Exchange>,
) -> Response {
    let Some(app_id) = app_for_service_key(&state, &headers) else {
        return fail(StatusCode::UNAUTHORIZED, "service_auth_required");
    };
    let def = app(app_id);
    let (ip_hash, ua_hash) = ip_ua_hashes(&state, &headers);
    if !rate_limit(&state, "exchange", app_id.as_str(), 300, 60).await {
        return fail(StatusCode::TOO_MANY_REQUESTS, "rate_limited");
    }

    // Atomic single-use consumption with every binding in the WHERE clause.
    let row = sqlx::query(
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
         RETURNING c.transaction_id, c.principal_user_id, c.clerk_user_id,
                   c.pkce_challenge, c.auth_instance",
    )
    .bind(crypto::digest(&body.code))
    .bind(app_id.as_str())
    .bind(def.callback_uri)
    .bind(crypto::digest(&body.state))
    .fetch_optional(&state.pool)
    .await;
    let Ok(Some(code)) = row else {
        audit(
            &state,
            "auth.code.replay_blocked",
            Some(app_id),
            json!({}),
            &ip_hash,
        )
        .await;
        return fail(StatusCode::BAD_REQUEST, "exchange_failed");
    };
    let transaction_id: Uuid = code.get("transaction_id");

    if !crypto::pkce_challenge_matches(
        &body.pkce_verifier,
        &code.get::<String, _>("pkce_challenge"),
    ) {
        let _ = sqlx::query("UPDATE auth_login_transactions SET status = 'rejected' WHERE id = $1")
            .bind(transaction_id)
            .execute(&state.pool)
            .await;
        audit(
            &state,
            "auth.transaction.rejected",
            Some(app_id),
            json!({"reason":"pkce"}),
            &ip_hash,
        )
        .await;
        return fail(StatusCode::BAD_REQUEST, "exchange_failed");
    }

    let completed = sqlx::query(
        "UPDATE auth_login_transactions
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1 AND status = 'authenticated' RETURNING id",
    )
    .bind(transaction_id)
    .fetch_optional(&state.pool)
    .await;
    if !matches!(completed, Ok(Some(_))) {
        return fail(StatusCode::BAD_REQUEST, "exchange_failed");
    }

    // Mint the opaque app session (digest at rest, absolute server-side expiry).
    let token = crypto::random_token();
    let principal: Option<Uuid> = code.get("principal_user_id");
    let clerk_user_id: String = code.get("clerk_user_id");
    let auth_instance: String = code.get("auth_instance");
    let session = sqlx::query(
        "INSERT INTO app_sessions
           (token_digest, app_id, auth_instance, principal_user_id, clerk_user_id,
            expires_at, created_ip_hash, created_ua_hash, last_ip_hash, last_ua_hash)
         VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(secs => $6), $7,$8,$7,$8)
         RETURNING id, to_char(expires_at, 'YYYY-MM-DD\"T\"HH24:MI:SSOF') AS expires_at",
    )
    .bind(crypto::digest(&token))
    .bind(app_id.as_str())
    .bind(auth_instance)
    .bind(principal)
    .bind(clerk_user_id)
    .bind(def.session_ttl_seconds as f64)
    .bind(&ip_hash)
    .bind(&ua_hash)
    .fetch_one(&state.pool)
    .await;
    let session = match session {
        Ok(s) => s,
        Err(_) => return fail(StatusCode::INTERNAL_SERVER_ERROR, "server_error"),
    };
    let session_id: Uuid = session.get("id");
    audit(
        &state,
        "auth.session.created",
        Some(app_id),
        json!({ "session_id": session_id }),
        &ip_hash,
    )
    .await;

    (
        StatusCode::OK,
        no_store(),
        Json(json!({
            "session_token": token,
            "session_id": session_id,
            "expires_at": session.get::<String, _>("expires_at"),
            "cookie": {
                "name": def.cookie_name,
                "attributes": format!("Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age={}", def.session_ttl_seconds),
            },
        })),
    )
        .into_response()
}

// ── Introspection: the ONLY way an app validates signed-in state ──────────────

async fn introspect(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<SessionRef>,
) -> Response {
    let Some(app_id) = app_for_service_key(&state, &headers) else {
        return fail(StatusCode::UNAUTHORIZED, "service_auth_required");
    };
    let (ip_hash, ua_hash) = ip_ua_hashes(&state, &headers);
    // App binding lives in the WHERE clause: a Business token presented via the
    // Customer BFF simply does not match — cross-app reuse is impossible.
    let row = sqlx::query(
        "UPDATE app_sessions
         SET last_seen_at = NOW(), last_ip_hash = $3, last_ua_hash = $4
         WHERE token_digest = $1 AND app_id = $2
           AND revoked_at IS NULL AND expires_at > NOW()
         RETURNING principal_user_id, clerk_user_id,
                   to_char(expires_at, 'YYYY-MM-DD\"T\"HH24:MI:SSOF') AS expires_at",
    )
    .bind(crypto::digest(&body.session_token))
    .bind(app_id.as_str())
    .bind(&ip_hash)
    .bind(&ua_hash)
    .fetch_optional(&state.pool)
    .await;

    match row {
        Ok(Some(s)) => {
            let principal: Option<Uuid> = s.get("principal_user_id");
            (
                StatusCode::OK,
                no_store(),
                Json(json!({
                    "active": true,
                    "app_id": app_id.as_str(),
                    "principal_user_id": principal,
                    "clerk_user_id": s.get::<String, _>("clerk_user_id"),
                    "expires_at": s.get::<String, _>("expires_at"),
                })),
            )
                .into_response()
        }
        _ => (StatusCode::OK, no_store(), Json(json!({ "active": false }))).into_response(),
    }
}

// ── Logout ────────────────────────────────────────────────────────────────────

async fn logout_app(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<SessionRef>,
) -> Response {
    let Some(app_id) = app_for_service_key(&state, &headers) else {
        return fail(StatusCode::UNAUTHORIZED, "service_auth_required");
    };
    let (ip_hash, _) = ip_ua_hashes(&state, &headers);
    let _ = sqlx::query(
        "UPDATE app_sessions SET revoked_at = NOW(), revocation_reason = 'logout'
         WHERE token_digest = $1 AND app_id = $2 AND revoked_at IS NULL",
    )
    .bind(crypto::digest(&body.session_token))
    .bind(app_id.as_str())
    .execute(&state.pool)
    .await;
    audit(&state, "auth.logout.app", Some(app_id), json!({}), &ip_hash).await;
    (StatusCode::OK, no_store(), Json(json!({ "ok": true }))).into_response()
}

async fn logout_all(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<SessionRef>,
) -> Response {
    let Some(app_id) = app_for_service_key(&state, &headers) else {
        return fail(StatusCode::UNAUTHORIZED, "service_auth_required");
    };
    let (ip_hash, _) = ip_ua_hashes(&state, &headers);
    // Every STANDARD session of the same principal; never touches admin (which
    // is a separate deployment with its own tables scope anyway).
    let _ = sqlx::query(
        "UPDATE app_sessions SET revoked_at = NOW(), revocation_reason = 'global_logout'
         WHERE revoked_at IS NULL AND auth_instance = 'standard'
           AND principal_user_id IS NOT NULL
           AND principal_user_id = (
             SELECT principal_user_id FROM app_sessions
             WHERE token_digest = $1 AND app_id = $2 AND revoked_at IS NULL
           )",
    )
    .bind(crypto::digest(&body.session_token))
    .bind(app_id.as_str())
    .execute(&state.pool)
    .await;
    audit(
        &state,
        "auth.logout.global",
        Some(app_id),
        json!({}),
        &ip_hash,
    )
    .await;
    (StatusCode::OK, no_store(), Json(json!({ "ok": true }))).into_response()
}
