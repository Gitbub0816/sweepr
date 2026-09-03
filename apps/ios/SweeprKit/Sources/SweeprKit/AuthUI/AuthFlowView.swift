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

// AuthFlowView — the shared native auth wall. One ceremony, two brand voices
// (AuthBranding.customer / .cleaner). Fully native fields with iOS autofill
// hints (email, password, one-time code), inline error surfacing, haptic
// feedback, and warm-graphite dark support via the shared theme tokens.

public struct AuthFlowView: View {
    @State private var model: AuthFlowModel
    private let branding: AuthBranding

    public init(engine: AuthEngine, branding: AuthBranding, onSignedIn: @escaping @MainActor () async -> Void) {
        _model = State(initialValue: AuthFlowModel(engine: engine, onSignedIn: onSignedIn))
        self.branding = branding
    }

    public var body: some View {
        ZStack {
            SweeprColor.background.ignoresSafeArea()
            switch model.route {
            case .welcome:
                AuthWelcomeView(model: model, branding: branding)
                    .transition(.opacity)
            case .signIn:
                AuthSignInView(model: model, branding: branding)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            case .signUp:
                AuthSignUpView(model: model, branding: branding)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            case .code:
                AuthCodeView(model: model)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            case .newPassword:
                AuthNewPasswordView(model: model)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            case .secondFactor:
                AuthSecondFactorView(model: model)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(SweeprMotion.smooth, value: model.route)
    }
}

// MARK: - Shared pieces

struct AuthHeader: View {
    let icon: String
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(SweeprColor.seafoam100)
                    .frame(width: 56, height: 56)
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundColor(SweeprColor.seafoam700)
            }
            Text(title)
                .font(SweeprFont.largeTitle())
                .foregroundColor(SweeprColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .font(SweeprFont.body())
                    .foregroundColor(SweeprColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AuthErrorBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: SweeprSpacing.sm) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(Color(hex: 0xdc2626))
            Text(message)
                .font(SweeprFont.caption())
                .foregroundColor(Color(hex: 0x991b1b))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(SweeprSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                .fill(Color(hex: 0xfee2e2))
        )
    }
}

/// Branded single-line field with label; email/name/code variants.
struct AuthField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var isSecure = false
    var contentKind: ContentKind = .plain

    enum ContentKind { case plain, email, givenName, familyName, oneTimeCode, newPassword, password }

    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(SweeprFont.caption())
                .foregroundColor(SweeprColor.textSecondary)
            HStack(spacing: SweeprSpacing.sm) {
                Group {
                    if isSecure && !revealed {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text)
                    }
                }
                .font(SweeprFont.body())
                .foregroundColor(SweeprColor.textPrimary)
                .authFieldTraits(contentKind)
                if isSecure {
                    Button {
                        revealed.toggle()
                        SweeprHaptics.selection()
                    } label: {
                        Image(systemName: revealed ? "eye.slash" : "eye")
                            .foregroundColor(SweeprColor.graphite500)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(revealed ? "Hide password" : "Show password")
                }
            }
            .padding(.horizontal, SweeprSpacing.md)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                    .fill(SweeprColor.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                    .stroke(SweeprColor.separator, lineWidth: 1)
            )
        }
    }
}

extension View {
    /// Autofill + keyboard traits per field kind. Centralized so every screen
    /// gets identical, correct behavior (one-time-code autofill included).
    @ViewBuilder func authFieldTraits(_ kind: AuthField.ContentKind) -> some View {
        switch kind {
        case .plain:
            self
        case .email:
            self.keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        case .givenName:
            self.textContentType(.givenName)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        case .familyName:
            self.textContentType(.familyName)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        case .oneTimeCode:
            self.keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
        case .newPassword:
            self.textContentType(.newPassword)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        case .password:
            self.textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }
}

/// Back chevron used by every inner screen.
struct AuthBackButton: View {
    let action: () -> Void
    var body: some View {
        Button {
            SweeprHaptics.selection()
            action()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "chevron.left")
                Text("Back")
            }
            .font(SweeprFont.body().weight(.medium))
            .foregroundColor(SweeprColor.brand)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Welcome

struct AuthWelcomeView: View {
    let model: AuthFlowModel
    let branding: AuthBranding

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: SweeprSpacing.xxl)
            ZStack {
                Circle()
                    .fill(SweeprColor.seafoam100)
                    .frame(width: 72, height: 72)
                Image(systemName: branding.heroIcon)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundColor(SweeprColor.seafoam700)
            }
            .padding(.bottom, SweeprSpacing.lg)

            Text(branding.headline)
                .font(SweeprFont.largeTitle())
                .foregroundColor(SweeprColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(branding.subheadline)
                .font(SweeprFont.body())
                .foregroundColor(SweeprColor.textSecondary)
                .padding(.top, SweeprSpacing.sm)

            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                ForEach(branding.benefits) { benefit in
                    HStack(alignment: .top, spacing: SweeprSpacing.md) {
                        Image(systemName: benefit.icon)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(SweeprColor.seafoam600)
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(benefit.title)
                                .font(SweeprFont.subheading())
                                .foregroundColor(SweeprColor.textPrimary)
                            Text(benefit.subtitle)
                                .font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.textSecondary)
                        }
                    }
                }
            }
            .padding(.top, SweeprSpacing.xl)

            Spacer(minLength: SweeprSpacing.lg)

            VStack(spacing: SweeprSpacing.sm) {
                SweeprButton(branding.createAccountTitle, style: .primary) {
                    SweeprHaptics.impact(.light)
                    model.showSignUp()
                }
                SweeprButton("Sign in", style: .secondary) {
                    SweeprHaptics.impact(.light)
                    model.showSignIn()
                }
            }
        }
        .padding(SweeprSpacing.lg)
    }
}

// MARK: - Sign in

struct AuthSignInView: View {
    @Bindable var model: AuthFlowModel
    let branding: AuthBranding

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                AuthBackButton { model.showWelcome() }
                AuthHeader(
                    icon: "person.crop.circle.fill",
                    title: "Welcome back",
                    subtitle: "Sign in to \(branding.appName)."
                )
                if let error = model.errorMessage {
                    AuthErrorBanner(message: error)
                }
                VStack(spacing: SweeprSpacing.md) {
                    AuthField(
                        label: "Email or phone", text: $model.identifier,
                        placeholder: "you@example.com", contentKind: .email
                    )
                    AuthField(
                        label: "Password", text: $model.password,
                        placeholder: "Your password", isSecure: true, contentKind: .password
                    )
                }
                SweeprButton("Sign in", style: .primary, isLoading: model.isBusy) {
                    Task { await model.submitPasswordSignIn() }
                }
                VStack(spacing: SweeprSpacing.md) {
                    Button {
                        Task { await model.requestSignInCode() }
                    } label: {
                        Text("Email me a sign-in code instead")
                            .font(SweeprFont.body().weight(.medium))
                            .foregroundColor(SweeprColor.brand)
                    }
                    .buttonStyle(.plain)
                    Button {
                        Task { await model.requestPasswordReset() }
                    } label: {
                        Text("Forgot password?")
                            .font(SweeprFont.body().weight(.medium))
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)

                HStack(spacing: 4) {
                    Text("New to \(branding.appName)?")
                        .font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textSecondary)
                    Button {
                        model.showSignUp()
                    } label: {
                        Text("Create an account")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.brand)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, SweeprSpacing.sm)
            }
            .padding(SweeprSpacing.lg)
        }
        .scrollIndicators(.hidden)
    }
}

// MARK: - Sign up

struct AuthSignUpView: View {
    @Bindable var model: AuthFlowModel
    let branding: AuthBranding

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                AuthBackButton { model.showWelcome() }
                AuthHeader(
                    icon: branding.heroIcon,
                    title: branding.createAccountTitle,
                    subtitle: "Takes about a minute."
                )
                if let error = model.errorMessage {
                    AuthErrorBanner(message: error)
                }
                VStack(spacing: SweeprSpacing.md) {
                    HStack(spacing: SweeprSpacing.md) {
                        AuthField(
                            label: "First name", text: $model.firstName,
                            placeholder: "Jordan", contentKind: .givenName
                        )
                        AuthField(
                            label: "Last name", text: $model.lastName,
                            placeholder: "Rivera", contentKind: .familyName
                        )
                    }
                    AuthField(
                        label: "Email", text: $model.signUpEmail,
                        placeholder: "you@example.com", contentKind: .email
                    )
                    AuthField(
                        label: "Password", text: $model.signUpPassword,
                        placeholder: "At least 8 characters", isSecure: true, contentKind: .newPassword
                    )
                }
                SweeprButton("Continue", style: .primary, isLoading: model.isBusy) {
                    Task { await model.submitSignUp() }
                }
                Text(branding.signUpFootnote)
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 4) {
                    Text("Already have an account?")
                        .font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textSecondary)
                    Button {
                        model.showSignIn()
                    } label: {
                        Text("Sign in")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.brand)
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(SweeprSpacing.lg)
        }
        .scrollIndicators(.hidden)
    }
}

// MARK: - One-time code

struct AuthCodeView: View {
    @Bindable var model: AuthFlowModel

    private var title: String {
        switch model.codeContext {
        case .signInSms: return "Check your texts"
        case .passwordReset: return "Reset your password"
        default: return "Check your email"
        }
    }

    private var subtitle: String {
        let target = model.codeHint ?? (model.codeContext == .signInSms ? "your phone" : "your email")
        switch model.codeContext {
        case .passwordReset:
            return "We sent a reset code to \(target)."
        default:
            return "We sent a sign-in code to \(target)."
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                AuthBackButton { model.backFromCode() }
                AuthHeader(icon: "envelope.badge.fill", title: title, subtitle: subtitle)
                if let error = model.errorMessage {
                    AuthErrorBanner(message: error)
                }
                AuthField(
                    label: "6-digit code", text: $model.code,
                    placeholder: "123456", contentKind: .oneTimeCode
                )
                SweeprButton("Verify", style: .primary, isLoading: model.isBusy) {
                    Task { await model.submitCode() }
                }
                Button {
                    Task { await model.resendCode() }
                } label: {
                    Text(model.resendCooldown > 0
                         ? "Resend code in \(model.resendCooldown)s"
                         : "Resend code")
                        .font(SweeprFont.body().weight(.medium))
                        .foregroundColor(model.resendCooldown > 0 ? SweeprColor.textSecondary : SweeprColor.brand)
                }
                .buttonStyle(.plain)
                .disabled(model.resendCooldown > 0)
                .frame(maxWidth: .infinity)
            }
            .padding(SweeprSpacing.lg)
        }
        .scrollIndicators(.hidden)
    }
}

// MARK: - New password (after reset)

struct AuthNewPasswordView: View {
    @Bindable var model: AuthFlowModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                AuthHeader(
                    icon: "lock.rotation",
                    title: "Pick a new password",
                    subtitle: "You'll be signed in right after."
                )
                if let error = model.errorMessage {
                    AuthErrorBanner(message: error)
                }
                VStack(spacing: SweeprSpacing.md) {
                    AuthField(
                        label: "New password", text: $model.newPassword,
                        placeholder: "At least 8 characters", isSecure: true, contentKind: .newPassword
                    )
                    AuthField(
                        label: "Confirm password", text: $model.newPasswordConfirm,
                        placeholder: "Same password again", isSecure: true, contentKind: .newPassword
                    )
                }
                SweeprButton("Set password & sign in", style: .primary, isLoading: model.isBusy) {
                    Task { await model.submitNewPassword() }
                }
            }
            .padding(SweeprSpacing.lg)
        }
        .scrollIndicators(.hidden)
    }
}

// MARK: - Second factor

struct AuthSecondFactorView: View {
    @Bindable var model: AuthFlowModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                AuthBackButton { model.showSignIn() }
                AuthHeader(
                    icon: "shield.lefthalf.filled",
                    title: "Two-step verification",
                    subtitle: model.secondFactorUsesAuthenticator
                        ? "Enter the code from your authenticator app."
                        : "We texted a code to \(model.codeHint ?? "your phone")."
                )
                if let error = model.errorMessage {
                    AuthErrorBanner(message: error)
                }
                AuthField(
                    label: "Verification code", text: $model.code,
                    placeholder: "123456", contentKind: .oneTimeCode
                )
                SweeprButton("Verify", style: .primary, isLoading: model.isBusy) {
                    Task { await model.submitSecondFactor() }
                }
            }
            .padding(SweeprSpacing.lg)
        }
        .scrollIndicators(.hidden)
    }
}
