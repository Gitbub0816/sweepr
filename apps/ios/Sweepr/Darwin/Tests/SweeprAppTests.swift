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
import Sweepr

// App-level smoke tests for the customer app target. Deeper model/API coverage
// lives in the SweeprKit package's own SweeprKitTests; these only prove the app
// shell wires together: the entry type exists, the dependency container builds
// without touching the network, and the shared kit is linked.
final class SweeprAppTests: XCTestCase {

    /// The app struct constructs. `@StateObject(wrappedValue:)` is an
    /// autoclosure, so this does not build AppEnvironment or hit the network.
    @MainActor
    func testAppEntryPointConstructs() async {
        _ = SweeprApp()
    }

    /// The dependency container wires the API client and shared stores.
    /// All inits are inert (no tasks, no requests).
    @MainActor
    func testAppEnvironmentWiresDependencies() async {
        let env = AppEnvironment(tokenProvider: AnonymousTokenProvider())
        XCTAssertEqual(env.session.phase, .unknown)
        XCTAssertFalse(env.session.isSignedIn)
        XCTAssertEqual(env.session.greetingName, "there")
    }

    /// SweeprKit is linked and its money invariant holds (integer cents on the
    /// wire, formatted only for display).
    func testSharedKitMoneyFormatting() {
        XCTAssertEqual(Money(cents: 15900).dollarsString, "$159.00")
    }

    /// Unknown future statuses from the API must never crash the app.
    func testUnknownBookingStatusDecodesSafely() throws {
        let status = try JSONDecoder().decode(
            BookingStatus.self,
            from: Data("\"some_future_status\"".utf8)
        )
        XCTAssertEqual(status, .draft)
    }
}
