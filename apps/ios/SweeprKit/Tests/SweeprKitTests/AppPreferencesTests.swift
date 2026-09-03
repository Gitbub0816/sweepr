//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import XCTest
@testable import SweeprKit

// AppPreferences is the local, device-only settings store (appearance +
// haptics) behind both apps' Settings screens — genuinely persisted, not a
// fabricated toggle. These tests exercise the real UserDefaults round-trip;
// an isolated suite per test gives deterministic isolation from other runs.
final class AppPreferencesTests: XCTestCase {
    private func makeIsolatedDefaults() -> (UserDefaults, String) {
        let suiteName = "sweepr.tests.preferences.\(UUID().uuidString)"
        return (UserDefaults(suiteName: suiteName)!, suiteName)
    }

    @MainActor
    func testDefaultsAreSystemAppearanceAndHapticsOn() async {
        let (defaults, suiteName) = makeIsolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let preferences = AppPreferences(defaults: defaults)
        XCTAssertEqual(preferences.appearance, .system)
        XCTAssertTrue(preferences.hapticsEnabled)
        XCTAssertNil(preferences.appearance.colorScheme)
    }

    @MainActor
    func testChangesPersistAcrossInstancesViaUserDefaults() async {
        let (defaults, suiteName) = makeIsolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let first = AppPreferences(defaults: defaults)
        first.appearance = .dark
        first.hapticsEnabled = false

        let second = AppPreferences(defaults: defaults)
        XCTAssertEqual(second.appearance, .dark)
        XCTAssertFalse(second.hapticsEnabled)
    }

    @MainActor
    func testHapticsTogglePropagatesToSweeprHaptics() async {
        let (defaults, suiteName) = makeIsolatedDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let preferences = AppPreferences(defaults: defaults)
        preferences.hapticsEnabled = false
        XCTAssertFalse(SweeprHaptics.isEnabled)

        preferences.hapticsEnabled = true
        XCTAssertTrue(SweeprHaptics.isEnabled)
    }
}
