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
import SweeprKit
import CleanWithSweepr

// App-level smoke tests for the cleaner app target. Deeper model/API coverage
// lives in the SweeprKit package's own SweeprKitTests; these only prove the app
// shell wires together: the entry type exists, the dependency container builds
// without touching the network, and the shared kit is linked.
final class CleanWithSweeprAppTests: XCTestCase {

    /// The app struct constructs. `@StateObject(wrappedValue:)` is an
    /// autoclosure, so this does not build AppEnvironment or hit the network.
    @MainActor
    func testAppEntryPointConstructs() async {
        _ = CleanWithSweeprApp()
    }

    /// The dependency container wires both API clients and Smart Entry session
    /// state. All inits are inert (no tasks, no requests).
    @MainActor
    func testAppEnvironmentWiresDependencies() async {
        let env = AppEnvironment(vault: MemoryTokenVault())
        XCTAssertNil(env.activeJob)
        XCTAssertFalse(env.smartEntrySessionId.isEmpty)
    }

    /// An offered job only ever exposes an area label — exact addresses stay
    /// server-side until start-route reveals them (privacy rule).
    func testOfferedJobExposesOnlyAreaLabel() {
        let offer = CleanerMock.jobs.first { $0.isOffer }
        XCTAssertNotNil(offer)
        XCTAssertEqual(offer?.areaLabel, "Denver, CO")
        XCTAssertNil(offer?.status)
    }
}
