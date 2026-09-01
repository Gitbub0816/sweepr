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

// Auth abstraction. Sweepr uses Clerk (clerk.getsweepr.com for the primary
// customer+cleaner application). The API expects a Bearer token that
// `middleware/auth.ts` verifies cryptographically against whichever Clerk
// instance issued it.
//
// We do NOT hard-depend on the Clerk iOS SDK from SweeprKit so the package stays
// SKIP-transpilable and testable. Instead, each app injects a concrete
// `AuthTokenProvider`. Wire the real Clerk session token in the app layer.
//
// Only publishable keys (pk_…) ever live in source; secret keys never do.

public protocol AuthTokenProvider: Sendable {
    /// Returns a fresh, short-lived Clerk session JWT for the `Authorization:
    /// Bearer` header, or nil when signed out. Implementations should refresh
    /// transparently.
    func currentToken() async -> String?
}

/// Unauthenticated provider — public endpoints only. Handy for previews/tests.
public struct AnonymousTokenProvider: AuthTokenProvider {
    public init() {}
    public func currentToken() async -> String? { nil }
}

/// Static-token provider for local development / integration tests.
public struct StaticTokenProvider: AuthTokenProvider {
    private let token: String
    public init(token: String) { self.token = token }
    public func currentToken() async -> String? { token }
}

// TODO(Clerk): add a `ClerkTokenProvider` in each app target that wraps the
// Clerk iOS SDK's `Clerk.shared.session?.getToken()`. On Android (transpiled),
// bridge to the Clerk Android/Expo session. Keep publishable key in build config:
//   Sweepr (customer/cleaner primary):  pk_live_… for clerk.getsweepr.com
