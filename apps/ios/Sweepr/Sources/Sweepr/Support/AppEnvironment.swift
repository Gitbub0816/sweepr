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

// App-wide dependency container, injected into the SwiftUI environment.
//
// Auth wiring: the TokenVault (Keychain) persists the broker app session, the
// BrokerTokenProvider turns it into short-lived API bearers for SweeprAPI, and
// the AuthEngine runs the native sign-in/sign-up ceremony (Clerk proves WHO;
// the broker session is the credential that keeps you signed in). A broker
// revocation fires the relay → SessionStore flips to the auth wall.
@MainActor
public final class AppEnvironment: ObservableObject {
    public let api: SweeprAPI
    public let tokenProvider: BrokerTokenProvider
    public let authEngine: AuthEngine

    // Shared @Observable stores — one instance app-wide so every screen stays
    // consistent. Read their properties directly in view bodies; Observation
    // tracks the exact fields each view touches.
    public let session: SessionStore
    public let bookingStore: BookingStore
    public let toast: ToastCenter

    public init(vault: TokenVault = TokenVaults.platformDefault()) {
        let relay = SessionInvalidationRelay()
        let mobileAuth = MobileAuthAPI()
        let tokenProvider = BrokerTokenProvider(
            app: .customer,
            vault: vault,
            mobileAuth: mobileAuth,
            onSessionInvalid: { relay.fire() }
        )
        self.tokenProvider = tokenProvider
        let api = SweeprAPI(config: .production, tokenProvider: tokenProvider)
        self.api = api
        self.session = SessionStore(api: api, tokenProvider: tokenProvider, relay: relay)
        self.bookingStore = BookingStore(api: api)
        self.toast = ToastCenter()
        self.authEngine = AuthEngine(
            app: .customer,
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
