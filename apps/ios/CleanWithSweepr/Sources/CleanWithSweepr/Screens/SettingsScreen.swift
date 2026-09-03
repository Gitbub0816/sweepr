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

// Settings — Appearance and Haptics are device-local (AppPreferences).
// Everything else is real, server-backed state from GET/PUT
// /cleaner-dashboard/settings: job-matching criteria, notification toggles,
// and preferred language. Saves are per-field and optimistic with a revert
// on failure — no fabricated switches, every toggle here is a real column.
public struct SettingsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var preferences: AppPreferences

    @State private var settings = CleanerSettings()
    @State private var isLoading = true
    @State private var savingField: String?

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                appearanceSection
                if isLoading {
                    SweeprCard(elevation: .low) { SkeletonBlock(height: 80) }
                } else {
                    jobMatchingSection
                    notificationsSection
                    languageSection
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
                        Text("Haptic feedback").font(SweeprFont.body())
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    .tint(SweeprColor.brand)
                }
            }
        }
    }

    // MARK: - Job matching (PUT /cleaner-dashboard/settings)

    private var jobMatchingSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Job matching")
            SweeprCard(elevation: .low) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    stepperRow(
                        "Max jobs per day", value: settings.maxJobsPerDay, range: 1...10,
                        saveKey: "maxJobsPerDay"
                    ) { newValue in
                        settings.maxJobsPerDay = newValue
                        try await env.cleanerAPI.updateSettings(maxJobsPerDay: newValue)
                    }
                    SweeprDivider()
                    stepperRow(
                        "Max distance (mi)", value: Int(settings.maxDistanceMiles), range: 1...100, step: 5,
                        saveKey: "maxDistanceMiles"
                    ) { newValue in
                        settings.maxDistanceMiles = Double(newValue)
                        try await env.cleanerAPI.updateSettings(maxDistanceMiles: Double(newValue))
                    }
                    SweeprDivider()
                    Toggle(isOn: Binding(
                        get: { settings.acceptsLastMinute },
                        set: { newValue in
                            settings.acceptsLastMinute = newValue
                            save("acceptsLastMinute") { try await env.cleanerAPI.updateSettings(acceptsLastMinute: newValue) }
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Accept last-minute jobs").font(SweeprFont.body())
                                .foregroundColor(SweeprColor.textPrimary)
                            Text("Offers starting within a few hours.")
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        }
                    }
                    .tint(SweeprColor.brand)
                }
            }
            Text("Job types").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                .padding(.top, SweeprSpacing.xs)
            ForEach(CleanerJobType.allCases) { type in
                let isOn = settings.acceptedJobTypes.contains(type.rawValue)
                SweeprChoiceRow(title: type.displayName, isSelected: isOn) {
                    toggleJobType(type)
                }
            }
        }
    }

    private func toggleJobType(_ type: CleanerJobType) {
        var next = settings.acceptedJobTypes
        if let idx = next.firstIndex(of: type.rawValue) {
            // At least one job type must stay selected — the server also
            // enforces this (`min(1)`), so mirror it client-side.
            guard next.count > 1 else {
                env.toasts.show("Keep at least one job type on.", kind: .warning)
                return
            }
            next.remove(at: idx)
        } else {
            next.append(type.rawValue)
        }
        settings.acceptedJobTypes = next
        save("acceptedJobTypes") { try await env.cleanerAPI.updateSettings(acceptedJobTypes: next) }
    }

    // MARK: - Notifications (PUT /cleaner-dashboard/settings)

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Notifications")
            SweeprCard(elevation: .low) {
                VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                    notificationToggle("New job offers", binding: \.notificationJobOffer) { newValue in
                        try await env.cleanerAPI.updateSettings(notificationJobOffer: newValue)
                    }
                    SweeprDivider()
                    notificationToggle("Upcoming job reminders", binding: \.notificationReminder) { newValue in
                        try await env.cleanerAPI.updateSettings(notificationReminder: newValue)
                    }
                    SweeprDivider()
                    notificationToggle("Payout released", binding: \.notificationPayout) { newValue in
                        try await env.cleanerAPI.updateSettings(notificationPayout: newValue)
                    }
                    SweeprDivider()
                    notificationToggle("News & offers", binding: \.notificationMarketing) { newValue in
                        try await env.cleanerAPI.updateSettings(notificationMarketing: newValue)
                    }
                }
            }
        }
    }

    private func notificationToggle(
        _ title: String, binding: WritableKeyPath<CleanerSettings, Bool>,
        onChange: @escaping (Bool) async throws -> Void
    ) -> some View {
        Toggle(isOn: Binding(
            get: { settings[keyPath: binding] },
            set: { newValue in
                settings[keyPath: binding] = newValue
                save(title) { try await onChange(newValue) }
            }
        )) {
            Text(title).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
        }
        .tint(SweeprColor.brand)
    }

    // MARK: - Language (shared field with cleaner-dashboard settings)

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Language")
            SweeprCard(elevation: .low) {
                NavigationLink(destination: languagePicker) {
                    HStack {
                        Text("Language for emails & receipts").font(SweeprFont.body())
                            .foregroundColor(SweeprColor.textPrimary)
                        Spacer(minLength: SweeprSpacing.md)
                        Text((settings.language ?? .en).displayName)
                            .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(SweeprColor.separator)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var languagePicker: some View {
        ScrollView {
            VStack(spacing: SweeprSpacing.sm) {
                ForEach(SweeprLanguage.allCases) { lang in
                    SweeprChoiceRow(title: lang.displayName, isSelected: lang == (settings.language ?? .en)) {
                        settings.preferredLanguage = lang.rawValue
                        save("preferredLanguage") { try await env.cleanerAPI.updateSettings(preferredLanguage: lang) }
                    }
                }
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Language")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Stepper row builder

    private func stepperRow(
        _ label: String, value: Int, range: ClosedRange<Int>, step: Int = 1, saveKey: String,
        onChange: @escaping (Int) async throws -> Void
    ) -> some View {
        HStack {
            Text(label).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
            Spacer()
            if savingField == saveKey { ProgressView() }
            Stepper("\(value)", value: Binding(
                get: { value },
                set: { newValue in save(saveKey) { try await onChange(newValue) } }
            ), in: range, step: step)
            .fixedSize()
        }
    }

    // MARK: - Save helper (optimistic; revert-by-reload on failure)

    private func save(_ key: String, _ action: @escaping () async throws -> Void) {
        savingField = key
        Task {
            do {
                try await action()
            } catch {
                env.toasts.show("Couldn't save — try again.", kind: .error)
                await load()
            }
            savingField = nil
        }
    }

    private func load() async {
        if let loaded = try? await env.cleanerAPI.settings() {
            settings = loaded
        }
        isLoading = false
    }
}

#if DEBUG
struct CleanerSettingsScreen_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack { SettingsScreen() }
            .environmentObject(AppEnvironment.preview)
            .environmentObject(AppPreferences())
    }
}
#endif
