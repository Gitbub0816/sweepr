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

// Settings — Appearance and Haptics are genuine device-local preferences
// (AppPreferences, UserDefaults-backed). Language and SMS consent are real
// server-backed fields on GET/PATCH /customer-profile — no fabricated
// toggles: every switch here round-trips against an endpoint the server
// actually reads.
public struct SettingsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var preferences: AppPreferences

    @State private var smsConsent = false
    @State private var language: SweeprLanguage = .en
    @State private var isLoading = true
    @State private var isSavingConsent = false
    @State private var isSavingLanguage = false

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                appearanceSection
                preferencesSection
                if !isLoading {
                    notificationsSection
                }
            }
            .padding(SweeprSpacing.md)
        }
        .scrollIndicators(.hidden)
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    // MARK: - Appearance (client-only)

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Appearance")
            SweeprCard(elevation: .low) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    SweeprSegmentedControl(
                        selection: Binding(
                            get: { preferences.appearance },
                            set: { preferences.appearance = $0 }
                        ),
                        options: AppAppearance.allCases.map { ($0, $0.displayName) }
                    )
                    SweeprDivider()
                    Toggle(isOn: Binding(
                        get: { preferences.hapticsEnabled },
                        set: { preferences.hapticsEnabled = $0 }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Haptic feedback").font(SweeprFont.body())
                                .foregroundColor(SweeprColor.textPrimary)
                            Text("Taps and confirmations vibrate lightly.")
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        }
                    }
                    .tint(SweeprColor.brand)
                }
            }
        }
    }

    // MARK: - Preferences (server-backed: GET/PATCH /customer-profile)

    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Preferences")
            SweeprCard(elevation: .low) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    if isLoading {
                        SkeletonBlock(height: 20)
                        SkeletonBlock(height: 20)
                    } else {
                        languageRow
                        SweeprDivider()
                        Toggle(isOn: Binding(
                            get: { smsConsent },
                            set: { newValue in
                                smsConsent = newValue
                                Task { await saveSmsConsent(newValue) }
                            }
                        )) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: SweeprSpacing.xs) {
                                    Text("Text message updates").font(SweeprFont.body())
                                        .foregroundColor(SweeprColor.textPrimary)
                                    if isSavingConsent { ProgressView() }
                                }
                                Text("Booking reminders and offers by SMS. Message & data rates may apply.")
                                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                            }
                        }
                        .tint(SweeprColor.brand)
                        .disabled(isSavingConsent)
                    }
                }
            }
        }
    }

    private var languageRow: some View {
        NavigationLink(destination: languagePicker) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Language for emails & receipts").font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("The app itself is in English.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                Spacer(minLength: SweeprSpacing.md)
                if isSavingLanguage { ProgressView() }
                Text(language.displayName).font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(SweeprColor.separator)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSavingLanguage)
    }

    private var languagePicker: some View {
        ScrollView {
            VStack(spacing: SweeprSpacing.sm) {
                ForEach(SweeprLanguage.allCases) { lang in
                    SweeprChoiceRow(title: lang.displayName, isSelected: lang == language) {
                        let previous = language
                        language = lang
                        Task { await saveLanguage(lang, revertingTo: previous) }
                    }
                }
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Language")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Notifications (informational — push is a fast-follow)

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Notifications")
            SweeprCard(elevation: .low) {
                HStack(alignment: .top, spacing: SweeprSpacing.md) {
                    Image(systemName: "bell.badge")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.seafoam100)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Email is always on for booking updates")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        Text("Push notifications are coming soon.")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    // MARK: - Load / save

    private func load() async {
        if let profile = try? await env.api.customerProfilePreferences() {
            smsConsent = profile.smsConsent
            language = profile.language ?? .en
        }
        isLoading = false
    }

    private func saveSmsConsent(_ value: Bool) async {
        isSavingConsent = true
        defer { isSavingConsent = false }
        do {
            try await env.api.updateCustomerProfilePreferences(smsConsent: value)
        } catch {
            smsConsent = !value
            env.toast.show("Couldn't save — try again.", kind: .error)
        }
    }

    private func saveLanguage(_ value: SweeprLanguage, revertingTo previous: SweeprLanguage) async {
        isSavingLanguage = true
        defer { isSavingLanguage = false }
        do {
            try await env.api.updateCustomerProfilePreferences(preferredLanguage: value)
        } catch {
            language = previous
            env.toast.show("Couldn't save — try again.", kind: .error)
        }
    }
}

#if DEBUG
struct SettingsScreen_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack { SettingsScreen() }
            .environmentObject(AppEnvironment.preview)
            .environmentObject(AppPreferences())
    }
}
#endif
