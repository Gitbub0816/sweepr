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

// SessionStore — the app-wide source of truth for "who is signed in".
//
// The persistent credential is the broker app session in the TokenVault
// (BrokerTokenProvider); this store derives UI phase from it:
//  - launch with a persisted session → .signedIn immediately (optimistic: the
//    user sees their app, not a login wall), then the profile resolves in the
//    background;
//  - launch without one → .signedOut → auth wall;
//  - the broker revoking the session (sign-out elsewhere, expiry) flips the
//    store to .signedOut via the invalidation relay.
//
// There is deliberately NO mock fallback here: a network failure keeps the
// last known user and raises `isOffline` — production screens must never
// render fabricated data (App Review 2.1, and basic honesty).

/// Bridges the token provider's session-invalidated signal (an actor, any
/// thread) onto the MainActor store without a construction-order cycle.
public final class SessionInvalidationRelay: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: (@Sendable () -> Void)?
    public init() {}

    public func setHandler(_ h: @escaping @Sendable () -> Void) {
        lock.lock(); defer { lock.unlock() }
        handler = h
    }
    public func fire() {
        lock.lock()
        let h = handler
        lock.unlock()
        h?()
    }
}

@MainActor
@Observable
public final class SessionStore {
    public enum Phase: Equatable, Sendable {
        case unknown   // pre-bootstrap
        case signedOut
        case signedIn
    }

    public private(set) var phase: Phase = .unknown
    public private(set) var user: CurrentUser?
    /// True when the last refresh failed on transport (never on auth).
    public private(set) var isOffline = false
    public private(set) var lastError: String?

    private let api: SweeprAPI
    private let tokenProvider: BrokerTokenProvider

    public init(api: SweeprAPI, tokenProvider: BrokerTokenProvider, relay: SessionInvalidationRelay? = nil) {
        self.api = api
        self.tokenProvider = tokenProvider
        relay?.setHandler { [weak self] in
            Task { @MainActor in self?.handleSessionInvalidated() }
        }
    }

    public var isSignedIn: Bool { phase == .signedIn }

    public var greetingName: String { user?.greetingName ?? "there" }

    /// Decide the launch phase from local state only — instant, no network.
    public func bootstrap() {
        phase = tokenProvider.hasPersistedSession ? .signedIn : .signedOut
    }

    /// Resolve/refresh the profile. Auth loss signs out; transport loss keeps
    /// the session and flags offline.
    public func refresh() async {
        lastError = nil
        guard tokenProvider.hasPersistedSession else {
            user = nil
            phase = .signedOut
            return
        }
        phase = .signedIn
        do {
            user = try await api.currentUser()
            isOffline = false
        } catch SweeprAPIError.unauthorized {
            // The provider wipes the vault when the broker says the session is
            // dead; re-check to distinguish revocation from a transient 401.
            if !tokenProvider.hasPersistedSession {
                user = nil
                phase = .signedOut
            } else {
                lastError = "unauthorized"
            }
        } catch {
            isOffline = true
            lastError = String(describing: error)
        }
    }

    /// Call after the AuthEngine returns `.complete`.
    public func didSignIn() async {
        phase = .signedIn
        isOffline = false
        await refresh()
    }

    /// Sign out this device: broker revocation + vault wipe, then UI flip.
    public func signOut() async {
        await tokenProvider.signOut()
        user = nil
        phase = .signedOut
    }

    /// Broker/BFF reported the session inactive mid-use.
    public func handleSessionInvalidated() {
        user = nil
        phase = .signedOut
    }
}
