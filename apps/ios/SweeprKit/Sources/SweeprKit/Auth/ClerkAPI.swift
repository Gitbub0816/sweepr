//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// ClerkAPI — a minimal, SKIP-safe client for Clerk's Frontend API (FAPI) at
// clerk.getsweepr.com, speaking the *native* protocol (`_is_native=1`):
//
//  - requests are form-encoded POSTs; the device's rotating client JWT rides
//    the `Authorization` request header and every response may rotate it via
//    its own `Authorization` header (we persist it in the TokenVault);
//  - success envelope: `{ "response": <object>, "client": {...} }`;
//    error envelope: `{ "errors": [...], "meta": { "client": {...} } }`.
//
// Verified live against the production instance (native_settings.api_enabled,
// no CAPTCHA, password+names required, email_code verification, phone_code /
// totp second factors). Clerk here only proves WHO — the resulting session
// JWT's sole consumer is the broker's native exchange; afterwards the Clerk
// session is discarded and the broker session is the persistent credential.

public struct ClerkConfig: Sendable {
    public let baseURL: URL
    public init(baseURL: URL) { self.baseURL = baseURL }
    /// Primary Sweepr Clerk application (customers + cleaners).
    public static let production = ClerkConfig(
        baseURL: URL(string: "https://clerk.getsweepr.com") ?? URL(fileURLWithPath: "/")
    )
}

/// One Clerk API error, surfaced with its stable machine code (e.g.
/// form_identifier_not_found, form_password_incorrect, form_code_incorrect).
public struct ClerkAPIError: Error, Sendable, Equatable {
    public let code: String
    public let message: String
    public let paramName: String?

    /// Human-safe fallback for unshaped failures.
    public static func transport(_ message: String) -> ClerkAPIError {
        ClerkAPIError(code: "transport_error", message: message, paramName: nil)
    }
}

// MARK: - Wire models (decoded tolerant of extra fields)

public struct ClerkFactor: Decodable, Sendable {
    public let strategy: String
    public let emailAddressId: String?
    public let phoneNumberId: String?
    public let safeIdentifier: String?
}

public struct ClerkVerification: Decodable, Sendable {
    public let status: String?
    public let strategy: String?
}

public struct ClerkSignIn: Decodable, Sendable {
    public let id: String
    public let status: String // needs_identifier | needs_first_factor | needs_second_factor | needs_new_password | complete
    public let supportedFirstFactors: [ClerkFactor]?
    public let supportedSecondFactors: [ClerkFactor]?
    public let firstFactorVerification: ClerkVerification?
    public let identifier: String?
    public let createdSessionId: String?
}

public struct ClerkSignUp: Decodable, Sendable {
    public let id: String
    public let status: String // missing_requirements | complete | abandoned
    public let requiredFields: [String]?
    public let missingFields: [String]?
    public let unverifiedFields: [String]?
    public let createdSessionId: String?
    public let emailAddress: String?
}

public struct ClerkSession: Decodable, Sendable {
    public let id: String
    public let status: String?
}

public struct ClerkClientState: Decodable, Sendable {
    public let sessions: [ClerkSession]?
    public let lastActiveSessionId: String?
    public let signIn: ClerkSignIn?
    public let signUp: ClerkSignUp?
}

// MARK: - Client

public actor ClerkAPI {
    private let config: ClerkConfig
    private let transport: HTTPTransport
    private let vault: TokenVault

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    public init(
        config: ClerkConfig = .production,
        transport: HTTPTransport = URLSessionTransport(),
        vault: TokenVault
    ) {
        self.config = config
        self.transport = transport
        self.vault = vault
    }

    // MARK: Sign-in

    /// Start a sign-in with an identifier (email / phone / username), plus the
    /// password in the same step when the user typed one.
    public func createSignIn(identifier: String, password: String? = nil) async throws -> ClerkSignIn {
        var fields = [("identifier", identifier)]
        if let password, !password.isEmpty {
            fields.append(("strategy", "password"))
            fields.append(("password", password))
        }
        return try await post("v1/client/sign_ins", fields, as: ClerkSignIn.self)
    }

    /// Ask Clerk to send a one-time code (email_code / phone_code /
    /// reset_password_email_code). The factor's id comes from
    /// supportedFirstFactors on the created sign-in.
    public func prepareFirstFactor(signInId: String, factor: ClerkFactor) async throws -> ClerkSignIn {
        var fields = [("strategy", factor.strategy)]
        if let id = factor.emailAddressId { fields.append(("email_address_id", id)) }
        if let id = factor.phoneNumberId { fields.append(("phone_number_id", id)) }
        return try await post("v1/client/sign_ins/\(signInId)/prepare_first_factor", fields, as: ClerkSignIn.self)
    }

    /// Attempt the first factor with a password or a received code.
    public func attemptFirstFactor(signInId: String, strategy: String, value: String) async throws -> ClerkSignIn {
        let valueField = strategy == "password" ? "password" : "code"
        return try await post(
            "v1/client/sign_ins/\(signInId)/attempt_first_factor",
            [("strategy", strategy), (valueField, value)],
            as: ClerkSignIn.self
        )
    }

    /// Second factor (phone_code needs a prepare; totp does not).
    public func prepareSecondFactor(signInId: String, factor: ClerkFactor) async throws -> ClerkSignIn {
        var fields = [("strategy", factor.strategy)]
        if let id = factor.phoneNumberId { fields.append(("phone_number_id", id)) }
        return try await post("v1/client/sign_ins/\(signInId)/prepare_second_factor", fields, as: ClerkSignIn.self)
    }

    public func attemptSecondFactor(signInId: String, strategy: String, code: String) async throws -> ClerkSignIn {
        try await post(
            "v1/client/sign_ins/\(signInId)/attempt_second_factor",
            [("strategy", strategy), ("code", code)],
            as: ClerkSignIn.self
        )
    }

    /// Set a new password after a reset_password_email_code was verified.
    public func resetPassword(signInId: String, newPassword: String) async throws -> ClerkSignIn {
        try await post(
            "v1/client/sign_ins/\(signInId)/reset_password",
            [("password", newPassword), ("sign_out_of_other_sessions", "true")],
            as: ClerkSignIn.self
        )
    }

    // MARK: Sign-up

    /// The instance requires first/last name + password (verified live); email
    /// is the identifier the apps collect.
    public func createSignUp(
        emailAddress: String, password: String, firstName: String, lastName: String
    ) async throws -> ClerkSignUp {
        try await post("v1/client/sign_ups", [
            ("email_address", emailAddress),
            ("password", password),
            ("first_name", firstName),
            ("last_name", lastName),
        ], as: ClerkSignUp.self)
    }

    /// Complete fields Clerk still reports missing (e.g. a name for a
    /// verified-but-incomplete sign-up — mirrors the web /sign-up/continue).
    public func updateSignUp(signUpId: String, fields: [(String, String)]) async throws -> ClerkSignUp {
        try await post("v1/client/sign_ups/\(signUpId)", fields + [("_method", "PATCH")], as: ClerkSignUp.self)
    }

    public func prepareEmailVerification(signUpId: String) async throws -> ClerkSignUp {
        try await post(
            "v1/client/sign_ups/\(signUpId)/prepare_verification",
            [("strategy", "email_code")],
            as: ClerkSignUp.self
        )
    }

    public func attemptEmailVerification(signUpId: String, code: String) async throws -> ClerkSignUp {
        try await post(
            "v1/client/sign_ups/\(signUpId)/attempt_verification",
            [("strategy", "email_code"), ("code", code)],
            as: ClerkSignUp.self
        )
    }

    // MARK: Sessions

    /// Mint a short-lived (≈60s) session JWT — consumed immediately by the
    /// broker's native exchange, never stored.
    public func mintSessionToken(sessionId: String) async throws -> String {
        struct TokenResponse: Decodable { let jwt: String }
        let resp = try await post("v1/client/sessions/\(sessionId)/tokens", [], as: TokenResponse.self)
        return resp.jwt
    }

    /// Remove the Clerk session once the broker session exists — the ceremony
    /// credential must not linger on-device.
    public func removeSession(sessionId: String) async {
        _ = try? await post("v1/client/sessions/\(sessionId)/remove", [], as: ClerkSession.self)
    }

    /// This device's Clerk client (sessions + any in-flight sign-in/up).
    public func fetchClient() async throws -> ClerkClientState {
        try await request(method: "GET", path: "v1/client", fields: [], as: ClerkClientState.self)
    }

    /// End every session on this device's Clerk client. Best-effort by design:
    /// used to clear ceremony residue — a session left behind when the broker
    /// hand-off failed midway — so a fresh sign-in/sign-up can start instead of
    /// dead-ending on Clerk's single-session `session_exists` refusal.
    public func signOutAllSessions() async {
        guard let client = try? await fetchClient() else { return }
        for session in client.sessions ?? [] {
            await removeSession(sessionId: session.id)
        }
    }

    // MARK: Core request

    private func post<T: Decodable>(_ path: String, _ fields: [(String, String)], as type: T.Type) async throws -> T {
        try await request(method: "POST", path: path, fields: fields, as: type)
    }

    private func request<T: Decodable>(
        method: String, path: String, fields: [(String, String)], as type: T.Type
    ) async throws -> T {
        guard let url = URL(string: "\(config.baseURL.absoluteString)/\(path)?_is_native=1") else {
            throw ClerkAPIError.transport("bad URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let clientToken = vault.get(.clerkClientToken) {
            req.setValue(clientToken, forHTTPHeaderField: "Authorization")
        }
        if method != "GET" {
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = Data(Self.formEncode(fields).utf8)
        }

        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send(req)
        } catch {
            throw ClerkAPIError.transport(error.localizedDescription)
        }

        // The client JWT rotates: every response may carry a fresh one.
        if let rotated = http.value(forHTTPHeaderField: "Authorization"), !rotated.isEmpty {
            vault.set(.clerkClientToken, rotated)
        }

        if (200..<300).contains(http.statusCode) {
            // Success envelope: {"response": {...}, "client": {...}} — with a
            // top-level fallback for endpoints that return the object bare.
            if let env = try? decoder.decode(ClerkResponseEnvelope<T>.self, from: data) {
                return env.response
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw ClerkAPIError(code: "decode_error", message: String(describing: error), paramName: nil)
            }
        }

        // Error envelope: {"errors":[{code,message,long_message,meta}],...}
        if let env = try? decoder.decode(ClerkErrorEnvelope.self, from: data), let first = env.errors?.first {
            throw ClerkAPIError(
                code: first.code ?? "unknown_error",
                message: first.longMessage ?? first.message ?? "Something went wrong.",
                paramName: first.meta?.paramName
            )
        }
        throw ClerkAPIError(code: "http_\(http.statusCode)", message: "Sign-in service error.", paramName: nil)
    }

    /// Swift 6.0 forbids local types inside generic functions, so the wire
    /// envelopes live at file scope below.

    /// RFC 3986-strict form encoding: spaces become %20 (not '+'), and every
    /// reserved character in passwords/codes is escaped.
    static func formEncode(_ fields: [(String, String)]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return fields
            .map { key, value in
                let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
                let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(k)=\(v)"
            }
            .joined(separator: "&")
    }
}

// MARK: - Wire envelopes (file scope: Swift 6.0 forbids local types in
// generic functions)

private struct ClerkResponseEnvelope<U: Decodable>: Decodable {
    let response: U
}

private struct ClerkWireError: Decodable {
    let code: String?
    let message: String?
    let longMessage: String?
    struct Meta: Decodable { let paramName: String? }
    let meta: Meta?
}

private struct ClerkErrorEnvelope: Decodable {
    let errors: [ClerkWireError]?
}
