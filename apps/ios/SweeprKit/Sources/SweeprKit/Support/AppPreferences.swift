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

// Local, device-only app preferences (appearance, haptics). These are
// genuinely client-side settings — nothing here fabricates server state.
// Account-level preferences that DO have a server home (language, marketing
// consent, notification toggles) live on SweeprAPI/CleanerAPI instead and are
// round-tripped from there by each app's SettingsScreen.

public enum AppAppearance: String, CaseIterable, Equatable, Sendable, Identifiable {
    case system, light, dark

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    public var systemIcon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    /// `nil` lets SwiftUI follow the system setting.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Persisted to `UserDefaults.standard` — no Keychain needed, nothing here is
/// a credential. One instance lives for the app's lifetime, injected at the
/// `App` root alongside (but independent of) `AppEnvironment`, since
/// preferences apply even to the signed-out auth wall.
@MainActor
public final class AppPreferences: ObservableObject {
    private enum Keys {
        static let appearance = "sweepr.preferences.appearance"
        static let hapticsEnabled = "sweepr.preferences.hapticsEnabled"
    }

    private let defaults: UserDefaults

    @Published public var appearance: AppAppearance {
        didSet { defaults.set(appearance.rawValue, forKey: Keys.appearance) }
    }
    @Published public var hapticsEnabled: Bool {
        didSet {
            defaults.set(hapticsEnabled, forKey: Keys.hapticsEnabled)
            SweeprHaptics.isEnabled = hapticsEnabled
        }
    }

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let storedAppearance = defaults.string(forKey: Keys.appearance).flatMap(AppAppearance.init(rawValue:))
        self.appearance = storedAppearance ?? .system
        // Absent key defaults to haptics ON (bool(forKey:) already returns
        // false for a missing key, so read the raw object first).
        let hapticsStored = defaults.object(forKey: Keys.hapticsEnabled) as? Bool
        self.hapticsEnabled = hapticsStored ?? true
        SweeprHaptics.isEnabled = self.hapticsEnabled
    }
}
