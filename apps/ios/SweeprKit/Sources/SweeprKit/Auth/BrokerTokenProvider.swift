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

// BrokerTokenProvider — the app's AuthTokenProvider in production. Holds the
// long-lived broker session (TokenVault; this is what persists sign-in across
// launches) and transparently exchanges it for the short-lived HS256 API
// tokens every SweeprAPI call sends as its Bearer. Re-minting also slides the
// broker session's idle expiry, so an app that gets used stays signed in.
//
// Failure philosophy:
//  - session_inactive from the BFF (revoked/expired at the broker) wipes the
//    vault and notifies the app to fall back to the auth wall;
//  - a transient BFF/broker outage returns the last un-expired token (or nil)
//    WITHOUT wiping — a network blip must never sign anyone out.

public actor BrokerTokenProvider: AuthTokenProvider {
    private let app: SweeprMobileApp
    private let vault: TokenVault
    private let mobileAuth: MobileAuthAPI
    private let onSessionInvalid: (@Sendable () -> Void)?

    private var cachedToken: String?
    /// Milliseconds since epoch, per the BFF's clock.
    private var cachedExpiresAt: Double = 0
    /// Refresh this many ms before nominal expiry so an in-flight request
    /// never carries a token that dies at the API boundary.
    private let expirySlackMs: Double = 60_000

    public init(
        app: SweeprMobileApp,
        vault: TokenVault,
        mobileAuth: MobileAuthAPI = MobileAuthAPI(),
        onSessionInvalid: (@Sendable () -> Void)? = nil
    ) {
        self.app = app
        self.vault = vault
        self.mobileAuth = mobileAuth
        self.onSessionInvalid = onSessionInvalid
    }

    /// Whether a broker session survives on this device (drives the launch
    /// gate: app shell vs. auth wall — before any network round-trip).
    public nonisolated var hasPersistedSession: Bool {
        vault.get(.brokerSessionToken) != nil
    }

    /// Called by the AuthEngine the moment a sign-in ceremony completes.
    public func adopt(_ grant: MobileSessionGrant) {
        vault.set(.brokerSessionToken, grant.sessionToken)
        cachedToken = grant.apiToken
        cachedExpiresAt = grant.apiTokenExpiresAt
    }

    public func currentToken() async -> String? {
        let nowMs = Date().timeIntervalSince1970 * 1000
        if let token = cachedToken, cachedExpiresAt - expirySlackMs > nowMs {
            return token
        }
        guard let sessionToken = vault.get(.brokerSessionToken) else { return nil }
        do {
            let grant = try await mobileAuth.mintApiToken(app: app, sessionToken: sessionToken)
            cachedToken = grant.apiToken
            cachedExpiresAt = grant.apiTokenExpiresAt
            return grant.apiToken
        } catch MobileAuthError.sessionInactive {
            wipeLocal()
            onSessionInvalid?()
            return nil
        } catch {
            // Outage: fall back to the cached token if it hasn't actually
            // expired yet (only the slack window failed); otherwise surface
            // unauthenticated for this call and try again on the next one.
            if let token = cachedToken, cachedExpiresAt > nowMs { return token }
            return nil
        }
    }

    /// Sign out this device: best-effort broker revocation, then local wipe.
    public func signOut() async {
        if let sessionToken = vault.get(.brokerSessionToken) {
            await mobileAuth.logout(app: app, sessionToken: sessionToken)
        }
        wipeLocal()
    }

    private func wipeLocal() {
        vault.remove(.brokerSessionToken)
        vault.remove(.clerkClientToken)
        cachedToken = nil
        cachedExpiresAt = 0
    }
}
