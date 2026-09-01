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
import Observation

// SessionStore — owns the auth token provider and the current user. Uses the
// Observation framework's `@Observable` (iOS 26 / SKIP 1.5.x SkipModel supports
// the macro), so SwiftUI views observe only the properties they read.
//
// The store never holds secrets: the Bearer token stays inside the injected
// `AuthTokenProvider` (a Clerk bridge in the app layer). SessionStore only tracks
// the resolved `CurrentUser` and a coarse auth phase for gating UI.

@MainActor
@Observable
public final class SessionStore {
    public enum Phase: Equatable, Sendable {
        case unknown          // haven't checked yet
        case signedOut
        case signedIn
    }

    public private(set) var phase: Phase = .unknown
    public private(set) var user: CurrentUser?
    public private(set) var lastError: String?

    private let api: SweeprAPI
    private let tokenProvider: AuthTokenProvider

    public init(api: SweeprAPI, tokenProvider: AuthTokenProvider) {
        self.api = api
        self.tokenProvider = tokenProvider
    }

    public var isSignedIn: Bool { phase == .signedIn }

    public var greetingName: String { user?.greetingName ?? "there" }

    /// Resolve the current user from the session token. Falls back to a mock
    /// identity when offline / no Clerk session so previews stay coherent.
    public func refresh() async {
        lastError = nil
        // No token → treat as signed out but keep the UI coherent with a guest.
        guard await tokenProvider.currentToken() != nil else {
            user = SweeprMock.currentUser
            phase = .signedOut
            return
        }
        do {
            user = try await api.currentUser()
            phase = .signedIn
        } catch {
            // Session present but the call failed (offline): keep last user, or
            // show the mock so the greeting isn't empty.
            if user == nil { user = SweeprMock.currentUser }
            lastError = String(describing: error)
            phase = user == nil ? .signedOut : .signedIn
        }
    }

    /// Clears the local session view. The concrete Clerk sign-out lives in the
    /// app layer's `AuthTokenProvider`; the app calls that, then this.
    public func clearLocalSession() {
        user = nil
        phase = .signedOut
    }
}
