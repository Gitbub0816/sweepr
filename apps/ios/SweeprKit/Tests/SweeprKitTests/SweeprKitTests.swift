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

    // MARK: - Snake_case decoding (the API sends snake_case responses)

    /// Mirrors the shared decoder config in `SweeprAPI` so fixtures exercise the
    /// real convertFromSnakeCase + iso8601 path.
    private func apiDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }

    func testBookingDecodesFromSnakeCaseWire() throws {
        // Shape mirrors GET /bookings/:id → { booking: {...} } (snake_case columns).
        let json = """
        {
          "id": "bk_1",
          "status": "cleaner_on_the_way",
          "service_type": "standard_clean",
          "cleaning_level": "extra_attention",
          "bedrooms": 2,
          "bathrooms": 1.5,
          "scheduled_at": "2026-07-20T17:00:00Z",
          "address": { "id": "addr_1", "street": "1200 Market St", "zip": "80202" },
          "add_ons": ["inside_fridge"]
        }
        """.data(using: .utf8) ?? Data()
        let booking = try apiDecoder().decode(Booking.self, from: json)
        XCTAssertEqual(booking.id, "bk_1")
        XCTAssertEqual(booking.status, .cleaner_on_the_way)
        XCTAssertEqual(booking.cleaningLevel, .extra_attention)
        XCTAssertEqual(booking.bathrooms, 1.5)
        XCTAssertEqual(booking.packageDisplayName, "Standard Clean")
        XCTAssertEqual(booking.address?.zip, "80202")
        XCTAssertTrue(booking.status.isTrackable)
    }

    func testBookingAccessAuthorizationDecodesSnakeCase() throws {
        // GET /smart-entry/booking/:id → { authorization } (snake_case columns).
        let json = """
        {
          "authorization": {
            "access_method": "smart_entry",
            "lock_device_id": "dev_1",
            "customer_authorized_at": "2026-07-19T00:00:00Z",
            "revoked_at": null
          }
        }
        """.data(using: .utf8) ?? Data()
        let resp = try apiDecoder().decode(BookingAccessResponse.self, from: json)
        XCTAssertEqual(resp.authorization?.method, .smart_entry)
        XCTAssertTrue(resp.authorization?.isSmartEntryProvisioned == true)
    }

    func testDayOfServiceStatusDecodesSnakeCase() throws {
        let json = """
        {
          "booking_id": "bk_9",
          "status": "arrived",
          "requires_before_photos": true,
          "requires_after_photos": false
        }
        """.data(using: .utf8) ?? Data()
        let dos = try apiDecoder().decode(DayOfServiceStatus.self, from: json)
        XCTAssertEqual(dos.bookingId, "bk_9")
        XCTAssertEqual(dos.status, .arrived)
        XCTAssertTrue(dos.requiresBeforePhotos)
        XCTAssertFalse(dos.requiresAfterPhotos)
        XCTAssertNil(dos.smartEntry)
    }

    // MARK: - Hoisted cleaner models

    func testDayOfServiceStepFromStatus() {
        XCTAssertEqual(DayOfServiceStep.from(status: .confirmed), .confirmed)
        XCTAssertEqual(DayOfServiceStep.from(status: .cleaner_on_the_way), .enRoute)
        XCTAssertEqual(DayOfServiceStep.from(status: .in_progress), .inProgress)
        XCTAssertEqual(DayOfServiceStep.from(status: .completed), .done)
        // Unknown/earlier statuses resume at the start of the flow.
        XCTAssertEqual(DayOfServiceStep.from(status: .matching), .confirmed)
        XCTAssertTrue(DayOfServiceStep.confirmed < DayOfServiceStep.checkout)
    }

    func testRoomChecklistCompletion() {
        var room = RoomChecklist(room: "Kitchen", items: [
            ChecklistItem(label: "Counters"),
            ChecklistItem(label: "Floors"),
        ])
        XCTAssertFalse(room.isComplete)
        room.items = room.items.map { var i = $0; i.done = true; return i }
        XCTAssertTrue(room.isComplete)
    }

    func testJobOfferAndMaskedAddress() {
        // An offered job hides the exact address behind an area label.
        let offer = SweeprMock.jobs.first { $0.booking.status == .offered_to_cleaner }
        XCTAssertNotNil(offer)
        XCTAssertTrue(offer?.isOffer == true)
        XCTAssertEqual(offer?.maskedAreaLabel, "Denver area · 80202")

        // A trackable job reveals the full one-line address.
        let active = Job(id: "j", booking: SweeprMock.booking(status: .cleaner_on_the_way),
                         payoutEstimate: nil, distanceMeters: nil)
        XCTAssertTrue(active.isActiveShift)
        XCTAssertEqual(active.maskedAreaLabel, SweeprMock.address.oneLine)
    }

    func testVerificationStatusLabels() {
        let v = VerificationStatus(didit: .cleared, yardstik: .pending)
        XCTAssertEqual(v.diditLabel, "Cleared")
        XCTAssertEqual(v.yardstikLabel, "Pending")
    }

    func testPayoutRoundTripThroughMoney() {
        let payout = PayoutRecord(id: "po", paidAt: Date(), amount: Money(cents: 18400),
                                  jobsCount: 2, includesTips: true)
        XCTAssertEqual(payout.amount.dollarsString, "$184.00")
    }

    func testDirectionsURLBuildsAppleMapsHandoff() {
        let url = SweeprMaps.directionsURL(latitude: 39.7392, longitude: -104.9903, label: "Home Clean")
        let s = url?.absoluteString ?? ""
        XCTAssertTrue(s.hasPrefix("https://maps.apple.com/?daddr=39.7392,-104.9903"))
        XCTAssertTrue(s.contains("dirflg=d"))          // directions mode
        XCTAssertTrue(s.contains("q=Home%20Clean"))    // label is percent-encoded
    }

    func testSmartEntryLocationSerializesCamelCaseBody() {
        // The backend locationSchema validates camelCase keys; guard the body.
        let loc = CleanerAPI.SmartEntryLocation(
            latitude: 39.7, longitude: -104.9, accuracyMeters: 12,
            capturedAt: "2026-08-29T17:00:00Z", sessionId: "sess-1"
        )
        let obj = loc.jsonObject
        XCTAssertEqual(obj["latitude"] as? Double, 39.7)
        XCTAssertEqual(obj["accuracyMeters"] as? Double, 12)
        XCTAssertEqual(obj["sessionId"] as? String, "sess-1")
        // Optional fields are omitted when nil (zod treats absent as nullish).
        XCTAssertNil(obj["deviceReference"])
        XCTAssertNil(obj["reauthenticatedAt"])
    }

    func testAccessActionResultSucceededFlag() {
        XCTAssertTrue(CleanerAPI.AccessActionResult(status: .success, message: nil, eventId: "e1").succeeded)
        XCTAssertFalse(CleanerAPI.AccessActionResult(status: .failed, message: "down", eventId: nil).succeeded)
    }
}
