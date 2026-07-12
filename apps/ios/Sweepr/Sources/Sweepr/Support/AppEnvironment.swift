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

    public init(tokenProvider: AuthTokenProvider) {
        self.tokenProvider = tokenProvider
        self.api = SweeprAPI(config: .production, tokenProvider: tokenProvider)
    }

    /// Preview/dev environment — anonymous, mock-backed screens.
    public static var preview: AppEnvironment {
        AppEnvironment(tokenProvider: AnonymousTokenProvider())
    }
}
