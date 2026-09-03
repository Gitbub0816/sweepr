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

// AuthFlowModel — the auth wall's view state. Screens stay dumb: every button
// calls one intent method here, the model drives the AuthEngine, and the
// published route/error/busy fields tell SwiftUI what to render. On success
// the injected onSignedIn closure fires (the app flips the session store).

@MainActor
@Observable
public final class AuthFlowModel {
    public enum Route: Equatable, Sendable {
        case welcome
        case signIn
        case signUp
        case code          // one-time code entry (context in codeContext)
        case newPassword   // after a verified reset code
        case secondFactor
    }

    public enum CodeContext: Equatable, Sendable {
        case signInEmail
        case signInSms
        case passwordReset
        case signUpEmail
    }

    // Route + transient UI state
    public private(set) var route: Route = .welcome
    public private(set) var isBusy = false
    public var errorMessage: String?
    public private(set) var codeContext: CodeContext = .signInEmail
    public private(set) var codeHint: String?
    public private(set) var secondFactorUsesAuthenticator = false
    public private(set) var resendCooldown = 0

    // Form fields (bound by the screens)
    public var identifier = ""
    public var password = ""
    public var firstName = ""
    public var lastName = ""
    public var signUpEmail = ""
    public var signUpPassword = ""
    public var code = ""
    public var newPassword = ""
    public var newPasswordConfirm = ""

    private let engine: AuthEngine
    private let onSignedIn: @MainActor () async -> Void
    private var cooldownTask: Task<Void, Never>?

    public init(engine: AuthEngine, onSignedIn: @escaping @MainActor () async -> Void) {
        self.engine = engine
        self.onSignedIn = onSignedIn
    }

    // MARK: Navigation intents

    public func showWelcome() { transition(to: .welcome) }
    public func showSignIn() { transition(to: .signIn) }
    public func showSignUp() { transition(to: .signUp) }

    public func backFromCode() {
        code = ""
        transition(to: codeContext == .signUpEmail ? .signUp : .signIn)
    }

    // MARK: Ceremony intents

    public func submitPasswordSignIn() async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return flash("Enter your email or phone.") }
        guard !password.isEmpty else { return flash("Enter your password.") }
        await run {
            let step = try await self.engine.signIn(identifier: id, password: self.password)
            self.apply(step, fallbackCodeContext: .signInEmail)
        }
    }

    public func requestSignInCode() async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return flash("Enter your email or phone first.") }
        await run {
            let step = try await self.engine.signInWithCode(identifier: id)
            self.apply(step, fallbackCodeContext: .signInEmail)
        }
    }

    public func requestPasswordReset() async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard id.contains("@") else { return flash("Enter your account email first, then tap Forgot password.") }
        await run {
            let step = try await self.engine.forgotPassword(email: id)
            self.apply(step, fallbackCodeContext: .passwordReset)
        }
    }

    public func submitSignUp() async {
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = signUpEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !first.isEmpty, !last.isEmpty else { return flash("Enter your first and last name.") }
        guard email.contains("@") else { return flash("Enter a valid email address.") }
        guard signUpPassword.count >= 8 else { return flash("Pick a password of at least 8 characters.") }
        await run {
            let step = try await self.engine.signUp(
                email: email, password: self.signUpPassword, firstName: first, lastName: last
            )
            self.apply(step, fallbackCodeContext: .signUpEmail)
        }
    }

    public func submitCode() async {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 4 else { return flash("Enter the code we sent you.") }
        await run {
            let step: AuthStep
            switch self.codeContext {
            case .signUpEmail:
                step = try await self.engine.submitSignUpCode(trimmed)
            default:
                step = try await self.engine.submitSignInCode(trimmed)
            }
            self.apply(step, fallbackCodeContext: self.codeContext)
        }
    }

    public func submitSecondFactor() async {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 4 else { return flash("Enter your verification code.") }
        await run {
            let step = try await self.engine.submitSecondFactorCode(trimmed)
            self.apply(step, fallbackCodeContext: self.codeContext)
        }
    }

    public func submitNewPassword() async {
        guard newPassword.count >= 8 else { return flash("Pick a password of at least 8 characters.") }
        guard newPassword == newPasswordConfirm else { return flash("Those passwords don't match.") }
        await run {
            let step = try await self.engine.submitNewPassword(self.newPassword)
            self.apply(step, fallbackCodeContext: self.codeContext)
        }
    }

    public func resendCode() async {
        guard resendCooldown == 0 else { return }
        startCooldown()
        switch codeContext {
        case .signUpEmail:
            await engine.resendSignUpCode()
        case .passwordReset:
            _ = try? await engine.forgotPassword(email: identifier.trimmingCharacters(in: .whitespacesAndNewlines))
        default:
            _ = try? await engine.signInWithCode(identifier: identifier.trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }

    // MARK: Internals

    private func apply(_ step: AuthStep, fallbackCodeContext: CodeContext) {
        switch step {
        case .complete:
            SweeprHaptics.notify(.success)
            Task { await onSignedIn() }
        case let .needsCode(channel, hint):
            codeHint = hint
            switch channel {
            case .email: codeContext = fallbackCodeContext == .signUpEmail ? .signUpEmail : .signInEmail
            case .sms: codeContext = .signInSms
            case .emailReset: codeContext = .passwordReset
            }
            code = ""
            startCooldown()
            transition(to: .code)
        case let .needsSecondFactor(usesAuthenticatorApp, hint):
            secondFactorUsesAuthenticator = usesAuthenticatorApp
            codeHint = hint
            code = ""
            transition(to: .secondFactor)
        case .needsNewPassword:
            newPassword = ""
            newPasswordConfirm = ""
            transition(to: .newPassword)
        }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await work()
        } catch let error as AuthEngineError {
            SweeprHaptics.notify(.error)
            errorMessage = error.message
        } catch {
            SweeprHaptics.notify(.error)
            errorMessage = "Something went wrong. Please try again."
        }
    }

    private func flash(_ message: String) {
        SweeprHaptics.notify(.warning)
        errorMessage = message
    }

    private func transition(to newRoute: Route) {
        errorMessage = nil
        route = newRoute
    }

    private func startCooldown() {
        cooldownTask?.cancel()
        resendCooldown = 30
        cooldownTask = Task { [weak self] in
            while let self, self.resendCooldown > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                self.resendCooldown = Swift.max(0, self.resendCooldown - 1)
            }
        }
    }
}
