/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

//! Clerk session-token verification: RS256 via the instance's JWKS.
//! Pure-Rust `rsa` crate for the signature check.
//! The broker accepts EXACTLY ONE issuer per deployment path — standard
//! ceremonies verify against the standard instance's JWKS, admin ceremonies
//! against the admin instance's. There is no shared verification path.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::sha2::Sha256;
use rsa::signature::Verifier;
use rsa::{BigUint, RsaPublicKey};
use serde::Deserialize;

#[derive(Debug)]
pub enum JwtError {
    Malformed,
    UnsupportedAlg,
    UnknownKey,
    BadSignature,
    Expired,
    NotYetValid,
    WrongIssuer,
    WrongNonce,
    KeyParse,
}

#[derive(Deserialize)]
pub struct Jwks {
    pub keys: Vec<Jwk>,
}

#[derive(Deserialize, Clone)]
pub struct Jwk {
    pub kid: Option<String>,
    pub kty: String,
    pub n: Option<String>,
    pub e: Option<String>,
}

#[derive(Deserialize)]
struct Header {
    alg: String,
    kid: Option<String>,
}

// azp/sid/email are part of Clerk's token contract; retained for callers even
// though the broker core doesn't read them yet.
#[allow(dead_code)]
#[derive(Deserialize, Debug)]
pub struct Claims {
    pub sub: String,
    pub iss: String,
    pub exp: i64,
    #[serde(default)]
    pub nbf: Option<i64>,
    #[serde(default)]
    pub azp: Option<String>,
    #[serde(default)]
    pub nonce: Option<String>,
    #[serde(default)]
    pub sid: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

/// Fetch a Clerk instance's JWKS over HTTPS (rustls). Kept here so the JWT
/// concern owns its key material end-to-end.
pub async fn fetch_jwks(client: &reqwest::Client, issuer: &str) -> Result<Jwks, JwtError> {
    let url = format!("{}/.well-known/jwks.json", issuer.trim_end_matches('/'));
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|_| JwtError::UnknownKey)?;
    if !resp.status().is_success() {
        return Err(JwtError::UnknownKey);
    }
    resp.json::<Jwks>().await.map_err(|_| JwtError::KeyParse)
}

/// Clock skew tolerance (seconds) for exp/nbf.
const LEEWAY: i64 = 30;

fn b64(part: &str) -> Result<Vec<u8>, JwtError> {
    URL_SAFE_NO_PAD
        .decode(part)
        .map_err(|_| JwtError::Malformed)
}

/// Verify an RS256 JWT against a JWKS and an exact expected issuer.
/// `now_epoch` is injected for testability; callers pass Date::now().
pub fn verify_rs256(
    token: &str,
    jwks: &Jwks,
    expected_issuer: &str,
    expected_nonce: Option<&str>,
    now_epoch: i64,
) -> Result<Claims, JwtError> {
    let mut parts = token.split('.');
    let (h, p, s) = match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(h), Some(p), Some(s), None) if !h.is_empty() && !p.is_empty() && !s.is_empty() => {
            (h, p, s)
        }
        _ => return Err(JwtError::Malformed),
    };

    let header: Header = serde_json::from_slice(&b64(h)?).map_err(|_| JwtError::Malformed)?;
    if header.alg != "RS256" {
        return Err(JwtError::UnsupportedAlg);
    }

    let jwk = jwks
        .keys
        .iter()
        .find(|k| k.kty == "RSA" && (header.kid.is_none() || k.kid == header.kid))
        .ok_or(JwtError::UnknownKey)?;

    let n = BigUint::from_bytes_be(&b64(jwk.n.as_deref().ok_or(JwtError::KeyParse)?)?);
    let e = BigUint::from_bytes_be(&b64(jwk.e.as_deref().ok_or(JwtError::KeyParse)?)?);
    let key = RsaPublicKey::new(n, e).map_err(|_| JwtError::KeyParse)?;
    let verifying_key = VerifyingKey::<Sha256>::new(key);

    let signature = Signature::try_from(b64(s)?.as_slice()).map_err(|_| JwtError::BadSignature)?;
    let signed = format!("{h}.{p}");
    verifying_key
        .verify(signed.as_bytes(), &signature)
        .map_err(|_| JwtError::BadSignature)?;

    let claims: Claims = serde_json::from_slice(&b64(p)?).map_err(|_| JwtError::Malformed)?;

    // Temporal checks (only AFTER the signature is proven).
    if claims.exp + LEEWAY < now_epoch {
        return Err(JwtError::Expired);
    }
    if let Some(nbf) = claims.nbf {
        if nbf - LEEWAY > now_epoch {
            return Err(JwtError::NotYetValid);
        }
    }
    // Exact issuer — a valid token from the WRONG Clerk instance must fail.
    if claims.iss.trim_end_matches('/') != expected_issuer.trim_end_matches('/') {
        return Err(JwtError::WrongIssuer);
    }
    if let Some(expected) = expected_nonce {
        if claims.nonce.as_deref() != Some(expected) {
            return Err(JwtError::WrongNonce);
        }
    }
    Ok(claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rsa::pkcs1v15::SigningKey;
    use rsa::signature::{SignatureEncoding, Signer};
    use rsa::traits::PublicKeyParts;
    use rsa::RsaPrivateKey;

    fn make_token(claims: &str, key: &RsaPrivateKey) -> (String, Jwks) {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"RS256","kid":"k1"}"#);
        let payload = URL_SAFE_NO_PAD.encode(claims.as_bytes());
        let signing = SigningKey::<Sha256>::new(key.clone());
        let sig = signing.sign(format!("{header}.{payload}").as_bytes());
        let token = format!(
            "{header}.{payload}.{}",
            URL_SAFE_NO_PAD.encode(sig.to_bytes())
        );
        let public = key.to_public_key();
        let jwks = Jwks {
            keys: vec![Jwk {
                kid: Some("k1".into()),
                kty: "RSA".into(),
                n: Some(URL_SAFE_NO_PAD.encode(public.n().to_bytes_be())),
                e: Some(URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())),
            }],
        };
        (token, jwks)
    }

    #[test]
    fn verifies_and_enforces_issuer_nonce_expiry() {
        let key = RsaPrivateKey::new(&mut rand::rngs::OsRng, 2048).unwrap();
        let now = 1_800_000_000i64;
        let claims = format!(
            r#"{{"sub":"user_1","iss":"https://clerk.getsweepr.com","exp":{},"nonce":"n1"}}"#,
            now + 600
        );
        let (token, jwks) = make_token(&claims, &key);

        let ok = verify_rs256(
            &token,
            &jwks,
            "https://clerk.getsweepr.com",
            Some("n1"),
            now,
        );
        assert!(ok.is_ok());
        assert_eq!(ok.unwrap().sub, "user_1");

        // Wrong issuer (e.g. admin token hitting the standard path) must fail.
        assert!(matches!(
            verify_rs256(
                &token,
                &jwks,
                "https://clerk.admin.getsweepr.com",
                Some("n1"),
                now
            ),
            Err(JwtError::WrongIssuer)
        ));
        // Wrong nonce fails.
        assert!(matches!(
            verify_rs256(
                &token,
                &jwks,
                "https://clerk.getsweepr.com",
                Some("other"),
                now
            ),
            Err(JwtError::WrongNonce)
        ));
        // Expired fails.
        assert!(matches!(
            verify_rs256(
                &token,
                &jwks,
                "https://clerk.getsweepr.com",
                Some("n1"),
                now + 7200
            ),
            Err(JwtError::Expired)
        ));
        // Tampered payload fails signature.
        let mut parts: Vec<&str> = token.split('.').collect();
        let forged = URL_SAFE_NO_PAD.encode(
            format!(
                r#"{{"sub":"user_2","iss":"https://clerk.getsweepr.com","exp":{},"nonce":"n1"}}"#,
                now + 600
            )
            .as_bytes(),
        );
        parts[1] = &forged;
        let tampered = parts.join(".");
        assert!(matches!(
            verify_rs256(
                &tampered,
                &jwks,
                "https://clerk.getsweepr.com",
                Some("n1"),
                now
            ),
            Err(JwtError::BadSignature)
        ));
        // Wrong key (different signer) fails.
        let other = RsaPrivateKey::new(&mut rand::rngs::OsRng, 2048).unwrap();
        let (_, other_jwks) = make_token(&claims, &other);
        assert!(matches!(
            verify_rs256(
                &token,
                &other_jwks,
                "https://clerk.getsweepr.com",
                Some("n1"),
                now
            ),
            Err(JwtError::BadSignature)
        ));
    }

    #[test]
    fn rejects_alg_confusion() {
        // alg=none / HS256 style headers must be rejected outright.
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"none"}"#);
        let payload = URL_SAFE_NO_PAD.encode(br#"{"sub":"x","iss":"i","exp":9999999999}"#);
        let token = format!("{header}.{payload}.sig");
        let jwks = Jwks { keys: vec![] };
        assert!(matches!(
            verify_rs256(&token, &jwks, "i", None, 0),
            Err(JwtError::UnsupportedAlg) | Err(JwtError::Malformed)
        ));
    }
}
