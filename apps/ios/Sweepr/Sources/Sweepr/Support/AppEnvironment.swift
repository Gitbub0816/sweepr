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

// App-wide dependency container, injected into the SwiftUI environment. Holds the
// single SweeprAPI client and the auth token provider.
@MainActor
public final class AppEnvironment: ObservableObject {
    public let api: SweeprAPI
    public let tokenProvider: AuthTokenProvider

    // Shared @Observable stores — one instance app-wide so every screen stays
    // consistent. Read their properties directly in view bodies; Observation
    // tracks the exact fields each view touches.
    public let session: SessionStore
    public let bookingStore: BookingStore
    public let toast: ToastCenter

    public init(tokenProvider: AuthTokenProvider) {
        self.tokenProvider = tokenProvider
        let api = SweeprAPI(config: .production, tokenProvider: tokenProvider)
        self.api = api
        self.session = SessionStore(api: api, tokenProvider: tokenProvider)
        self.bookingStore = BookingStore(api: api)
        self.toast = ToastCenter()
    }

    /// Preview/dev environment — anonymous, mock-backed screens.
    public static var preview: AppEnvironment {
        AppEnvironment(tokenProvider: AnonymousTokenProvider())
    }
}
