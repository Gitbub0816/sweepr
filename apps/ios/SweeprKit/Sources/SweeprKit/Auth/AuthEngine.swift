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

// AuthEngine — orchestrates the native sign-in/sign-up ceremony end to end:
//
//   Clerk FAPI (proves WHO, fully native UI)
//     → fresh Clerk session JWT
//     → mobile BFF /mobile-auth/session (worker holds the broker keys)
//     → broker native exchange mints the long-lived per-app session
//     → BrokerTokenProvider persists it; the Clerk session is discarded.
//
// The engine owns the in-flight ceremony state (sign-in / sign-up ids, which
// factor was prepared), so screens only ever call the step the user just
// performed and render the returned `Step`. All methods surface
// `AuthEngineError` with a user-presentable message and a stable code.

public enum AuthCodeChannel: Sendable, Equatable {
    case email
    case sms
    case emailReset
}

public enum AuthStep: Sendable, Equatable {
    /// Signed in; the broker session is persisted. UI proceeds into the app.
    case complete
    /// A one-time code was sent; collect it. `hint` is a safe identifier such
    /// as "j***@example.com" when Clerk provides one.
    case needsCode(channel: AuthCodeChannel, hint: String?)
    /// A second factor is required (SMS code already sent, or an authenticator
    /// app code).
    case needsSecondFactor(usesAuthenticatorApp: Bool, hint: String?)
    /// The reset code was accepted; collect a new password.
    case needsNewPassword
}

public struct AuthEngineError: Error, Sendable, Equatable {
    /// Stable machine code — Clerk's form_* codes pass through verbatim, plus
    /// engine codes: not_authorized_for_application, session_unavailable,
    /// unsupported_account, ceremony_out_of_order.
    public let code: String
    /// Safe to show to the user as-is.
    public let message: String
}

public actor AuthEngine {
    private let clerk: ClerkAPI
    private let mobileAuth: MobileAuthAPI
    private let tokenProvider: BrokerTokenProvider
    private let app: SweeprMobileApp

    // In-flight ceremony state.
    private var signInId: String?
    private var signUpId: String?
    private var firstFactorStrategy: String?
    private var secondFactorStrategy: String?

    public init(
        app: SweeprMobileApp,
        clerk: ClerkAPI,
        mobileAuth: MobileAuthAPI = MobileAuthAPI(),
        tokenProvider: BrokerTokenProvider
    ) {
        self.app = app
        self.clerk = clerk
        self.mobileAuth = mobileAuth
        self.tokenProvider = tokenProvider
    }

    // MARK: - Sign-in

    /// Identifier (email/phone/username) + password in one step.
    public func signIn(identifier: String, password: String) async throws -> AuthStep {
        resetCeremony()
        do {
            let signIn = try await createSignInClearingStale(identifier: identifier, password: password)
            signInId = signIn.id
            return try await advance(signIn)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    /// Passwordless: send a one-time code to the identifier's email or phone.
    public func signInWithCode(identifier: String) async throws -> AuthStep {
        resetCeremony()
        do {
            let created = try await createSignInClearingStale(identifier: identifier)
            signInId = created.id
            let factors = created.supportedFirstFactors ?? []
            let factor = factors.first { $0.strategy == "email_code" }
                ?? factors.first { $0.strategy == "phone_code" }
            guard let factor else {
                throw AuthEngineError(
                    code: "unsupported_account",
                    message: "This account can't receive a sign-in code. Try your password instead."
                )
            }
            firstFactorStrategy = factor.strategy
            _ = try await clerk.prepareFirstFactor(signInId: created.id, factor: factor)
            let channel: AuthCodeChannel = factor.strategy == "phone_code" ? .sms : .email
            return .needsCode(channel: channel, hint: factor.safeIdentifier)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    /// The one-time code from signInWithCode / forgotPassword.
    public func submitSignInCode(_ code: String) async throws -> AuthStep {
        guard let id = signInId, let strategy = firstFactorStrategy else {
            throw AuthEngineError(code: "ceremony_out_of_order", message: "Start sign-in again.")
        }
        do {
            let signIn = try await clerk.attemptFirstFactor(signInId: id, strategy: strategy, value: code)
            return try await advance(signIn)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    /// Second factor: SMS code or authenticator-app (TOTP) code.
    public func submitSecondFactorCode(_ code: String) async throws -> AuthStep {
        guard let id = signInId, let strategy = secondFactorStrategy else {
            throw AuthEngineError(code: "ceremony_out_of_order", message: "Start sign-in again.")
        }
        do {
            let signIn = try await clerk.attemptSecondFactor(signInId: id, strategy: strategy, code: code)
            return try await advance(signIn)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    // MARK: - Forgot password

    /// Emails a reset code; continue with submitSignInCode, then
    /// submitNewPassword when the step says so.
    public func forgotPassword(email: String) async throws -> AuthStep {
        resetCeremony()
        do {
            let created = try await createSignInClearingStale(identifier: email)
            signInId = created.id
            let factor = (created.supportedFirstFactors ?? [])
                .first { $0.strategy == "reset_password_email_code" }
            guard let factor else {
                throw AuthEngineError(
                    code: "unsupported_account",
                    message: "Password reset isn't available for this account. Contact support."
                )
            }
            firstFactorStrategy = factor.strategy
            _ = try await clerk.prepareFirstFactor(signInId: created.id, factor: factor)
            return .needsCode(channel: .emailReset, hint: factor.safeIdentifier)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    public func submitNewPassword(_ password: String) async throws -> AuthStep {
        guard let id = signInId else {
            throw AuthEngineError(code: "ceremony_out_of_order", message: "Start sign-in again.")
        }
        do {
            let signIn = try await clerk.resetPassword(signInId: id, newPassword: password)
            return try await advance(signIn)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    // MARK: - Sign-up

    /// The instance requires all four fields (verified against production
    /// config); an email verification code is sent immediately.
    public func signUp(
        email: String, password: String, firstName: String, lastName: String
    ) async throws -> AuthStep {
        resetCeremony()
        do {
            let created = try await createSignUpClearingStale(
                email: email, password: password, firstName: firstName, lastName: lastName
            )
            signUpId = created.id
            if created.status == "complete", let sessionId = created.createdSessionId {
                return try await establishBrokerSession(clerkSessionId: sessionId)
            }
            _ = try await clerk.prepareEmailVerification(signUpId: created.id)
            return .needsCode(channel: .email, hint: created.emailAddress)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    public func submitSignUpCode(_ code: String) async throws -> AuthStep {
        guard let id = signUpId else {
            throw AuthEngineError(code: "ceremony_out_of_order", message: "Start sign-up again.")
        }
        do {
            let signUp = try await clerk.attemptEmailVerification(signUpId: id, code: code)
            guard signUp.status == "complete", let sessionId = signUp.createdSessionId else {
                // Verified but still missing requirements — the web routes to
                // /sign-up/continue; natively the form already collected all
                // required fields, so this indicates config drift.
                throw AuthEngineError(
                    code: "signup_incomplete",
                    message: "Almost there — your account needs more details. Please try again."
                )
            }
            return try await establishBrokerSession(clerkSessionId: sessionId)
        } catch let error as ClerkAPIError {
            throw friendly(error)
        }
    }

    public func resendSignUpCode() async {
        guard let id = signUpId else { return }
        _ = try? await clerk.prepareEmailVerification(signUpId: id)
    }

    // MARK: - Stale-session recovery

    // Clerk runs single-session per device client: starting a ceremony while a
    // session is already active fails with `session_exists`. That session is
    // ceremony residue — most commonly a sign-in/sign-up that succeeded at
    // Clerk but whose broker hand-off failed (server outage, misconfig) —
    // never a credential this app honors, since only the broker session signs
    // a user in. So clear the client's sessions and retry the ceremony once
    // instead of dead-ending the auth wall with "you're already signed in".

    private func createSignInClearingStale(
        identifier: String, password: String? = nil
    ) async throws -> ClerkSignIn {
        do {
            return try await clerk.createSignIn(identifier: identifier, password: password)
        } catch let error as ClerkAPIError where error.code == "session_exists" {
            await clerk.signOutAllSessions()
            return try await clerk.createSignIn(identifier: identifier, password: password)
        }
    }

    private func createSignUpClearingStale(
        email: String, password: String, firstName: String, lastName: String
    ) async throws -> ClerkSignUp {
        do {
            return try await clerk.createSignUp(
                emailAddress: email, password: password, firstName: firstName, lastName: lastName
            )
        } catch let error as ClerkAPIError where error.code == "session_exists" {
            await clerk.signOutAllSessions()
            return try await clerk.createSignUp(
                emailAddress: email, password: password, firstName: firstName, lastName: lastName
            )
        }
    }

    // MARK: - Ceremony advancement

    private func advance(_ signIn: ClerkSignIn) async throws -> AuthStep {
        switch signIn.status {
        case "complete":
            guard let sessionId = signIn.createdSessionId else {
                throw AuthEngineError(code: "session_unavailable", message: "Sign-in didn't complete. Try again.")
            }
            return try await establishBrokerSession(clerkSessionId: sessionId)

        case "needs_first_factor":
            // Password rejected or not attempted; offer a code if available.
            let factors = signIn.supportedFirstFactors ?? []
            if let factor = factors.first(where: { $0.strategy == "email_code" })
                ?? factors.first(where: { $0.strategy == "phone_code" }) {
                firstFactorStrategy = factor.strategy
                _ = try? await clerk.prepareFirstFactor(signInId: signIn.id, factor: factor)
                let channel: AuthCodeChannel = factor.strategy == "phone_code" ? .sms : .email
                return .needsCode(channel: channel, hint: factor.safeIdentifier)
            }
            throw AuthEngineError(code: "unsupported_account", message: "Use your password to sign in.")

        case "needs_second_factor":
            let factors = signIn.supportedSecondFactors ?? []
            if let sms = factors.first(where: { $0.strategy == "phone_code" }) {
                secondFactorStrategy = "phone_code"
                _ = try? await clerk.prepareSecondFactor(signInId: signIn.id, factor: sms)
                return .needsSecondFactor(usesAuthenticatorApp: false, hint: sms.safeIdentifier)
            }
            secondFactorStrategy = "totp"
            return .needsSecondFactor(usesAuthenticatorApp: true, hint: nil)

        case "needs_new_password":
            return .needsNewPassword

        default:
            throw AuthEngineError(code: "unsupported_step", message: "Sign-in couldn't continue. Try again.")
        }
    }

    /// The hand-off: fresh Clerk session JWT → broker session via the BFF.
    /// On success the broker session is the ONLY credential kept; the Clerk
    /// session is removed so the ceremony credential doesn't linger.
    private func establishBrokerSession(clerkSessionId: String) async throws -> AuthStep {
        let jwt: String
        do {
            jwt = try await clerk.mintSessionToken(sessionId: clerkSessionId)
        } catch {
            throw AuthEngineError(code: "session_unavailable", message: "Sign-in didn't complete. Try again.")
        }
        do {
            let grant = try await mobileAuth.createSession(app: app, clerkToken: jwt)
            await tokenProvider.adopt(grant)
            await clerk.removeSession(sessionId: clerkSessionId)
            resetCeremony()
            return .complete
        } catch MobileAuthError.notAuthorized {
            await clerk.removeSession(sessionId: clerkSessionId)
            throw AuthEngineError(
                code: "not_authorized_for_application",
                message: "This account can't use this app. Contact support if that seems wrong."
            )
        } catch MobileAuthError.unavailable(let code) where code == "auth_unconfigured" {
            await clerk.removeSession(sessionId: clerkSessionId)
            throw AuthEngineError(
                code: "auth_unconfigured",
                message: "Sweepr sign-in isn't switched on for the app yet. Please try again soon."
            )
        } catch {
            // Whatever failed, don't leave the Clerk session dangling — a
            // leftover session makes the NEXT ceremony fail `session_exists`.
            // The retry redoes the full ceremony from the still-filled form.
            await clerk.removeSession(sessionId: clerkSessionId)
            throw AuthEngineError(
                code: "session_unavailable",
                message: "We couldn't finish signing you in. Check your connection and try again."
            )
        }
    }

    private func resetCeremony() {
        signInId = nil
        signUpId = nil
        firstFactorStrategy = nil
        secondFactorStrategy = nil
    }

    /// Map Clerk's stable error codes onto messages we're happy to show.
    private func friendly(_ error: ClerkAPIError) -> AuthEngineError {
        let message: String
        switch error.code {
        case "form_identifier_not_found":
            message = "We couldn't find an account with that email or phone."
        case "form_password_incorrect":
            message = "That password isn't right. Try again or use a sign-in code."
        case "form_code_incorrect":
            message = "That code isn't right. Check it and try again."
        case "verification_expired", "verification_failed":
            message = "That code expired. We can send a new one."
        case "form_identifier_exists":
            message = "An account with that email already exists. Sign in instead."
        case "form_password_pwned":
            message = "That password appeared in a data breach. Please pick a different one."
        case "form_password_length_too_short":
            message = "Your password needs to be longer."
        case "session_exists":
            // Only reachable when the automatic stale-session cleanup itself
            // failed — the ceremony residue could not be cleared this attempt.
            message = "A previous sign-in was still active on this device. Please try again."
        case "too_many_requests":
            message = "Too many attempts. Wait a moment and try again."
        case "transport_error":
            message = "Can't reach Sweepr. Check your connection and try again."
        default:
            message = error.message
        }
        return AuthEngineError(code: error.code, message: message)
    }
}
