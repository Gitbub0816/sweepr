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

    func testMembershipIntervalWireTokens() {
        XCTAssertEqual(MembershipPlanInterval.monthly.rawValue, "month")
        XCTAssertEqual(MembershipPlanInterval.annual.rawValue, "year")
    }

    func testSmartEntryFeeLabel() {
        let free = SmartEntryStatus(enabled: true, remoteUnlockEnabled: true,
                                    manualCodeEnabled: true, feeCents: 500,
                                    includedWithMembership: true)
        XCTAssertEqual(free.feeLabel, "Included with Sweepr+")
        let paid = SmartEntryStatus(enabled: true, remoteUnlockEnabled: true,
                                    manualCodeEnabled: true, feeCents: 500,
                                    includedWithMembership: false)
        XCTAssertEqual(paid.feeLabel, "$5.00")
    }

    func testQuoteRequestEncodesCamelCase() throws {
        // The API validates camelCase bodies — guard against a snake_case regress.
        let req = QuoteRequest(serviceType: .deep, bedrooms: 2, bathrooms: 1,
                               sqft: 1200, homeType: .house,
                               scheduledAt: "2026-07-20T17:00:00Z",
                               cleaningLevel: .extra_attention)
        let data = try JSONEncoder().encode(req)
        let json = String(data: data, encoding: .utf8) ?? ""
        XCTAssertTrue(json.contains("\"serviceType\""))
        XCTAssertTrue(json.contains("\"addOnKeys\""))
        XCTAssertTrue(json.contains("\"cleaningLevel\""))
        XCTAssertFalse(json.contains("service_type"))
    }

    func testQuoteLineItemMoney() {
        XCTAssertEqual(QuoteLineItem(label: "Base fee", cents: 12000).money.dollarsString, "$120.00")
    }
}
