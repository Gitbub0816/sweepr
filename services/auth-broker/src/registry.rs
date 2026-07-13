/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Server-side application registry — the single source of truth for app
//! identities, origins, exact callback URIs, cookie names, and TTLs.
//! Browser-supplied values NEVER override these; the browser may only name an
//! `app_id`, and everything else is resolved here.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AppId {
    Customer,
    Cleaner,
    Business,
    Admin,
}

impl AppId {
    pub fn parse(v: &str) -> Option<Self> {
        match v {
            "customer" => Some(Self::Customer),
            "cleaner" => Some(Self::Cleaner),
            "business" => Some(Self::Business),
            "admin" => Some(Self::Admin),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Customer => "customer",
            Self::Cleaner => "cleaner",
            Self::Business => "business",
            Self::Admin => "admin",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthInstance {
    Standard,
    Admin,
}

impl AuthInstance {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Admin => "admin",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppDefinition {
    pub app_id: AppId,
    pub display_name: &'static str,
    pub application_origin: &'static str,
    pub callback_uri: &'static str,
    pub cookie_name: &'static str,
    pub session_ttl_seconds: u64,
    pub auth_instance: AuthInstance,
}

const STANDARD_TTL: u64 = 259_200; // 72 hours, absolute
const ADMIN_TTL: u64 = 43_200; // 12 hours, absolute

pub const REGISTRY: &[AppDefinition] = &[
    AppDefinition {
        app_id: AppId::Customer,
        display_name: "Sweepr",
        application_origin: "https://app.getsweepr.com",
        callback_uri: "https://app.getsweepr.com/auth/callback",
        cookie_name: "__Host-sweepr_customer_session",
        session_ttl_seconds: STANDARD_TTL,
        auth_instance: AuthInstance::Standard,
    },
    AppDefinition {
        app_id: AppId::Cleaner,
        display_name: "Sweepr Cleaner",
        application_origin: "https://clean.getsweepr.com",
        callback_uri: "https://clean.getsweepr.com/auth/callback",
        cookie_name: "__Host-sweepr_cleaner_session",
        session_ttl_seconds: STANDARD_TTL,
        auth_instance: AuthInstance::Standard,
    },
    AppDefinition {
        app_id: AppId::Business,
        display_name: "Sweepr Business",
        application_origin: "https://business.getsweepr.com",
        callback_uri: "https://business.getsweepr.com/auth/callback",
        cookie_name: "__Host-sweepr_business_session",
        session_ttl_seconds: STANDARD_TTL,
        auth_instance: AuthInstance::Standard,
    },
    AppDefinition {
        app_id: AppId::Admin,
        display_name: "Sweepr Admin",
        application_origin: "https://admin.getsweepr.com",
        callback_uri: "https://admin.getsweepr.com/auth/callback",
        cookie_name: "__Host-sweepr_admin_session",
        session_ttl_seconds: ADMIN_TTL,
        auth_instance: AuthInstance::Admin,
    },
];

pub fn app(app_id: AppId) -> &'static AppDefinition {
    REGISTRY
        .iter()
        .find(|a| a.app_id == app_id)
        .expect("registry covers every AppId")
}

/// Sanitize a browser-supplied return path to a safe RELATIVE application
/// path. Anything that could escape the application origin is rejected in
/// favor of "/". Fail closed: when in doubt, return "/".
pub fn sanitize_return_path(raw: &str) -> String {
    let fallback = "/".to_string();
    if raw.is_empty() || raw.len() > 512 {
        return fallback;
    }
    // Must be valid UTF-8 (guaranteed by &str) with no control characters.
    if raw.chars().any(|c| c.is_control()) {
        return fallback;
    }
    // Must start with exactly one '/': rejects schemes ("https:"),
    // protocol-relative ("//host"), and backslash tricks ("/\host").
    let bytes = raw.as_bytes();
    if bytes[0] != b'/' || (bytes.len() > 1 && (bytes[1] == b'/' || bytes[1] == b'\\')) {
        return fallback;
    }
    if raw.contains('\\') {
        return fallback;
    }
    // Reject embedded schemes and double-encoding tricks anywhere in the path.
    let lower = raw.to_ascii_lowercase();
    for needle in [
        "http:",
        "https:",
        "javascript:",
        "data:",
        "%2f%2f",
        "%5c",
        "@",
    ] {
        if lower.contains(needle) {
            return fallback;
        }
    }
    raw.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_covers_all_apps_with_host_only_cookies() {
        for def in REGISTRY {
            assert!(def.cookie_name.starts_with("__Host-"));
            assert!(def.callback_uri.starts_with(def.application_origin));
            assert!(def.callback_uri.ends_with("/auth/callback"));
        }
        assert_eq!(app(AppId::Admin).auth_instance, AuthInstance::Admin);
        assert_eq!(app(AppId::Business).session_ttl_seconds, 259_200);
        assert_eq!(app(AppId::Admin).session_ttl_seconds, 43_200);
    }

    #[test]
    fn return_path_sanitizer_rejects_escapes() {
        assert_eq!(sanitize_return_path("/properties/123"), "/properties/123");
        assert_eq!(
            sanitize_return_path("/settings/security"),
            "/settings/security"
        );
        for bad in [
            "",
            "https://attacker.example/",
            "//attacker.example/x",
            "/\\attacker.example",
            "/a\\b",
            "javascript:alert(1)",
            "/ok/../https://x",
            "/%2f%2fattacker.example",
            "/path?next=https://evil.example",
            "/user@evil.example",
            "/line\nbreak",
        ] {
            assert_eq!(sanitize_return_path(bad), "/", "should reject {bad:?}");
        }
    }
}
