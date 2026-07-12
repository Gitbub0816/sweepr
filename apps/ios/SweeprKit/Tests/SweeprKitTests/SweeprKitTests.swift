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

final class SweeprKitTests: XCTestCase {
    func testMoneyFormatting() {
        XCTAssertEqual(Money(cents: 15900).dollarsString, "$159.00")
        XCTAssertEqual(Money(cents: 5).dollarsString, "$0.05")
        XCTAssertEqual(Money(cents: -1500).dollarsString, "-$15.00")
    }

    func testBookingStatusTrackable() {
        XCTAssertTrue(BookingStatus.cleaner_on_the_way.isTrackable)
        XCTAssertFalse(BookingStatus.confirmed.isTrackable)
        XCTAssertFalse(BookingStatus.completed.isActive)
    }

    func testUnknownStatusDecodesToDraft() throws {
        let json = "\"some_future_status\"".data(using: .utf8)!
        let status = try JSONDecoder().decode(BookingStatus.self, from: json)
        XCTAssertEqual(status, .draft)
    }

    func testMockBookingPackageName() {
        XCTAssertEqual(SweeprMock.booking().packageDisplayName, "Standard Clean")
    }
}
