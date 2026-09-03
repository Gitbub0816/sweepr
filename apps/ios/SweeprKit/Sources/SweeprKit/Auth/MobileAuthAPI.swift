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

// MobileAuthAPI — the worker's /mobile-auth/* surface (routes/mobileAuth.ts).
// api.getsweepr.com is the mobile BFF: the only holder of broker service keys
// on this path. We hand it a fresh Clerk session JWT once, receive the
// long-lived broker session (persisted in the TokenVault — that is what keeps
// the user signed in) plus a short-lived HS256 API token, and re-mint API
// tokens from the session as they expire. Each re-mint also slides the broker
// session's idle expiry.

/// Which app this binary is. Stamped into every broker session; the broker's
/// admission rules and session isolation both key on it.
public enum SweeprMobileApp: String, Sendable {
    case customer
    case cleaner
}

public struct MobileSessionGrant: Sendable {
    public let sessionToken: String
    public let sessionExpiresAt: String?
    public let apiToken: String
    /// Milliseconds since epoch (server clock).
    public let apiTokenExpiresAt: Double
}

public struct MobileTokenGrant: Sendable {
    public let apiToken: String
    public let apiTokenExpiresAt: Double
    public let sessionExpiresAt: String?
}

public enum MobileAuthError: Error, Sendable, Equatable {
    /// Broker session revoked/expired — clear local state, show sign-in.
    case sessionInactive
    /// Clerk proof rejected (stale/invalid) — restart the sign-in ceremony.
    case authenticationFailed(code: String)
    /// The account may not enter this app (e.g. deactivated cleaner).
    case notAuthorized
    /// Backend not configured / unreachable — try again later, stay signed in.
    case unavailable(String)
}

public actor MobileAuthAPI {
    private let baseURL: URL
    private let transport: HTTPTransport

    public init(
        baseURL: URL = SweeprAPIConfig.production.baseURL,
        transport: HTTPTransport = URLSessionTransport()
    ) {
        self.baseURL = baseURL
        self.transport = transport
    }

    public func createSession(app: SweeprMobileApp, clerkToken: String) async throws -> MobileSessionGrant {
        struct Body: Encodable { let app: String; let clerkToken: String }
        struct Reply: Decodable {
            let sessionToken: String
            let sessionExpiresAt: String?
            let apiToken: String
            let apiTokenExpiresAt: Double
        }
        let r: Reply = try await post("mobile-auth/session", Body(app: app.rawValue, clerkToken: clerkToken))
        return MobileSessionGrant(
            sessionToken: r.sessionToken,
            sessionExpiresAt: r.sessionExpiresAt,
            apiToken: r.apiToken,
            apiTokenExpiresAt: r.apiTokenExpiresAt
        )
    }

    public func mintApiToken(app: SweeprMobileApp, sessionToken: String) async throws -> MobileTokenGrant {
        struct Body: Encodable { let app: String; let sessionToken: String }
        struct Reply: Decodable {
            let apiToken: String
            let apiTokenExpiresAt: Double
            let sessionExpiresAt: String?
        }
        let r: Reply = try await post("mobile-auth/token", Body(app: app.rawValue, sessionToken: sessionToken))
        return MobileTokenGrant(
            apiToken: r.apiToken,
            apiTokenExpiresAt: r.apiTokenExpiresAt,
            sessionExpiresAt: r.sessionExpiresAt
        )
    }

    /// Best-effort revocation; local wipe happens regardless.
    public func logout(app: SweeprMobileApp, sessionToken: String) async {
        struct Body: Encodable { let app: String; let sessionToken: String }
        struct Reply: Decodable { let ok: Bool? }
        _ = try? await post("mobile-auth/logout", Body(app: app.rawValue, sessionToken: sessionToken)) as Reply
    }

    // MARK: Core

    private func post<B: Encodable, T: Decodable>(_ path: String, _ body: B) async throws -> T {
        guard let url = URL(string: "\(baseURL.absoluteString)/\(path)") else {
            throw MobileAuthError.unavailable("bad URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.httpBody = try? JSONEncoder().encode(body)

        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send(req)
        } catch {
            throw MobileAuthError.unavailable(error.localizedDescription)
        }

        if (200..<300).contains(http.statusCode) {
            do {
                return try JSONDecoder().decode(T.self, from: data)
            } catch {
                throw MobileAuthError.unavailable("decode: \(error)")
            }
        }

        let code = (try? JSONDecoder().decode(MobileAuthErrorBody.self, from: data))?.error
            ?? "http_\(http.statusCode)"
        switch (http.statusCode, code) {
        case (401, "session_inactive"):
            throw MobileAuthError.sessionInactive
        case (401, _):
            throw MobileAuthError.authenticationFailed(code: code)
        case (403, _):
            throw MobileAuthError.notAuthorized
        default:
            throw MobileAuthError.unavailable(code)
        }
    }
}

/// File scope: Swift 6.0 forbids local types in generic functions.
private struct MobileAuthErrorBody: Decodable {
    let error: String?
}
