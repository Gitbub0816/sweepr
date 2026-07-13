/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Token generation, digests, and PKCE. Raw tokens exist only in transit;
//! at rest we store sha256 hex digests. Comparisons on digests are
//! constant-time.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// 32 cryptographically secure random bytes, base64url (43 chars, no padding).
pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("CSPRNG unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// sha256 hex digest — the only form persisted for tokens/codes/handles.
pub fn digest(raw: &str) -> String {
    hex::encode(Sha256::digest(raw.as_bytes()))
}

/// Constant-time equality for hex digests.
pub fn digest_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.as_bytes().ct_eq(b.as_bytes()).into()
}

/// PKCE S256: BASE64URL(SHA256(verifier)) must equal the stored challenge.
pub fn pkce_challenge_matches(verifier: &str, challenge: &str) -> bool {
    // RFC 7636: verifier is 43–128 chars of [A-Za-z0-9-._~].
    if verifier.len() < 43 || verifier.len() > 128 {
        return false;
    }
    if !verifier
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~'))
    {
        return false;
    }
    let computed = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    computed.as_bytes().ct_eq(challenge.as_bytes()).into()
}

/// Privacy-preserving correlation hash for IP / user-agent (never reversible,
/// keyed by a deployment salt so digests can't be brute-forced offline).
pub fn correlation_hash(salt: &str, value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(b"\x00");
    hasher.update(value.as_bytes());
    hex::encode(&hasher.finalize()[..16])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_url_safe() {
        let a = random_token();
        let b = random_token();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert!(a.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'));
    }

    #[test]
    fn pkce_round_trip() {
        let verifier = random_token(); // 43 chars, valid verifier alphabet
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        assert!(pkce_challenge_matches(&verifier, &challenge));
        assert!(!pkce_challenge_matches(&verifier, "wrong"));
        assert!(!pkce_challenge_matches("short", &challenge));
        assert!(!pkce_challenge_matches(&format!("{verifier}!"), &challenge));
    }

    #[test]
    fn digests_are_stable_and_ct_compared() {
        let d = digest("abc");
        assert_eq!(d, digest("abc"));
        assert!(digest_eq(&d, &digest("abc")));
        assert!(!digest_eq(&d, &digest("abd")));
    }
}
