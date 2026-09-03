//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import SwiftUI
import SweeprKit

// App-wide dependency container for the cleaner app.
//
// Auth mirrors the customer app (Keychain vault → broker session →
// BrokerTokenProvider → short-lived API bearers), with app identity
// `.cleaner`: the broker's admission rules allow self-registration but refuse
// suspended/deactivated cleaners, and the session can never be replayed
// against another app.
@MainActor
public final class AppEnvironment: ObservableObject {
    public let api: SweeprAPI
    public let cleanerAPI: CleanerAPI
    public let tokenProvider: BrokerTokenProvider
    public let authEngine: AuthEngine
    public let session: SessionStore
    /// App-wide transient banner center (attach `.sweeprToast(env.toasts)` once
    /// at the root; call `env.toasts.show(...)` from anywhere).
    public let toasts = ToastCenter()
    /// A stable per-launch identifier used as the Smart Entry session id on
    /// proof-of-presence bodies (mirrors `locationSchema.sessionId`).
    public let smartEntrySessionId = UUID().uuidString
    /// True while the cleaner is actively mid-shift on a job — drives the
    /// pinned in-shift banner on the Jobs tab.
    @Published public var activeJob: CleanerJob?

    public init(vault: TokenVault = TokenVaults.platformDefault()) {
        let relay = SessionInvalidationRelay()
        let mobileAuth = MobileAuthAPI()
        let tokenProvider = BrokerTokenProvider(
            app: .cleaner,
            vault: vault,
            mobileAuth: mobileAuth,
            onSessionInvalid: { relay.fire() }
        )
        self.tokenProvider = tokenProvider
        let api = SweeprAPI(config: .production, tokenProvider: tokenProvider)
        self.api = api
        self.cleanerAPI = CleanerAPI(tokenProvider: tokenProvider)
        self.session = SessionStore(api: api, tokenProvider: tokenProvider, relay: relay)
        self.authEngine = AuthEngine(
            app: .cleaner,
            clerk: ClerkAPI(vault: vault),
            mobileAuth: mobileAuth,
            tokenProvider: tokenProvider
        )
    }

    /// Preview/dev environment — in-memory vault, signed-out, no keychain use.
    public static var preview: AppEnvironment {
        AppEnvironment(vault: MemoryTokenVault())
    }
}
