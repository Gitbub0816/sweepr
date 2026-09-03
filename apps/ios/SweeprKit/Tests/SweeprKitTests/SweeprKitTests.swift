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

// Model + decoding tests pinned to the AUDITED wire shapes (raw snake_case
// booking rows, the /jobs live envelope, the earnings summary). The fixtures
// deliberately use fractional-second ISO dates — the exact serialization the
// API emits and the one Foundation's plain .iso8601 strategy rejects, which
// once broke every screen.

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
        let json = Data("\"some_future_status\"".utf8)
        let status = try JSONDecoder().decode(BookingStatus.self, from: json)
        XCTAssertEqual(status, .draft)
    }

    func testCustomerCancellableWindowMatchesStatusMachine() {
        // statusMachine.ts: cancellable only before a cleaner accepts.
        for status in [BookingStatus.draft, .quoted, .payment_pending, .booked, .matching, .offered_to_cleaner] {
            XCTAssertTrue(status.isCustomerCancellable, "\(status)")
        }
        for status in [BookingStatus.cleaner_accepted, .confirmed, .in_progress, .completed] {
            XCTAssertFalse(status.isCustomerCancellable, "\(status)")
        }
    }

    // MARK: - Raw booking row decode (GET /bookings)

    func testBookingDecodesFromRawSnakeCaseRowWithFractionalDates() throws {
        let row = """
        {
          "id": "b1", "customer_id": "c1", "cleaner_id": null, "address_id": "a1",
          "status": "booked", "day_status": null,
          "service_type": "deep", "bedrooms": 3, "bathrooms": 2,
          "sqft": 1800, "home_type": "house",
          "scheduled_at": "2026-09-04T17:30:00.000Z",
          "created_at": "2026-09-03T04:00:00.123Z",
          "base_price": 21900, "addons_total": 2500, "service_fee": 1500,
          "tax": 1100, "total_price": 27000,
          "cleaning_level": "extra_attention",
          "cleaning_level_surcharge_cents": 2190,
          "arrival_window_start": "10:00:00", "arrival_window_end": "12:00:00",
          "cleaner_lat": 39.7392, "cleaner_lng": -104.9903,
          "smart_entry_fee_cents": 500, "sweepr_plus_discount_cents": 0
        }
        """
        let booking = try SweeprJSON.decoder.decode(Booking.self, from: Data(row.utf8))
        XCTAssertEqual(booking.status, .booked)
        XCTAssertEqual(booking.serviceType, "deep")
        XCTAssertEqual(booking.packageDisplayName, "Deep")
        XCTAssertEqual(booking.totalMoney?.dollarsString, "$270.00")
        XCTAssertEqual(booking.cleaningLevel, .extra_attention)
        XCTAssertEqual(booking.homeSummary, "3 bd · 2 ba")
        XCTAssertEqual(booking.cleanerLat ?? 0, 39.7392, accuracy: 0.0001)
        XCTAssertNotNil(booking.scheduledAt) // fractional-seconds ISO parsed
        XCTAssertEqual(booking.arrivalWindowStart, "10:00:00")
        XCTAssertNil(booking.addressLine1) // list rows carry no address join
    }

    func testBookingDetailRowCarriesAddressJoinAndAddonKeys() throws {
        let row = """
        {
          "id": "b1", "status": "confirmed", "service_type": "standard",
          "cleaner_id": "cl_9",
          "address_line1": "1200 Market St", "address_city": "Denver",
          "address_state": "CO", "address_zip": "80202",
          "addon_keys": ["inside_fridge", "laundry"],
          "deep_clean_applied": true
        }
        """
        let booking = try SweeprJSON.decoder.decode(Booking.self, from: Data(row.utf8))
        XCTAssertEqual(booking.addressOneLine, "1200 Market St, Denver 80202")
        XCTAssertEqual(booking.addonKeys, ["inside_fridge", "laundry"])
        XCTAssertEqual(booking.deepCleanApplied, true)
        XCTAssertEqual(booking.cleanerId, "cl_9")
    }

    // MARK: - Calendar availability (GET /calendar/availability) + arrival
    // windows (GET /cleaners/availability-slots) — both native camelCase
    // JSON built by the routes, unlike the raw snake_case booking rows above.

    func testCalendarAvailabilityDecodesBlockedAndLabeledDays() throws {
        let payload = """
        { "days": [
          { "date": "2026-09-10", "blocked": true, "adjustmentLabel": null, "promoLabel": null },
          { "date": "2026-09-11", "blocked": false, "adjustmentLabel": "Surge pricing", "promoLabel": null },
          { "date": "2026-09-12" }
        ] }
        """
        let days = try SweeprJSON.decoder.decode(CalendarAvailabilityResponse.self, from: Data(payload.utf8)).days
        XCTAssertEqual(days.count, 3)
        XCTAssertEqual(days[0].date, "2026-09-10")
        XCTAssertEqual(days[0].blocked, true)
        XCTAssertEqual(days[1].adjustmentLabel, "Surge pricing")
        XCTAssertNil(days[2].blocked) // omitted key, not a decode failure
    }

    func testArrivalWindowsResponseDecodesRealSlots() throws {
        let payload = """
        { "date": "2026-09-10", "slots": [
          { "start": "08:00", "end": "10:00", "label": "8:00 – 10:00 AM", "available": true },
          { "start": "10:00", "end": "12:00", "label": "10:00 AM – 12:00 PM", "available": false }
        ] }
        """
        let resp = try SweeprJSON.decoder.decode(ArrivalWindowsResponse.self, from: Data(payload.utf8))
        XCTAssertEqual(resp.date, "2026-09-10")
        XCTAssertEqual(resp.slots.count, 2)
        XCTAssertEqual(resp.slots[0].id, "08:00") // id mirrors start
        XCTAssertTrue(resp.slots[0].available)
        XCTAssertFalse(resp.slots[1].available)
    }

    func testTolerantDateParsing() {
        XCTAssertNotNil(SweeprJSON.parseDate("2026-09-03T04:00:00.000Z"))
        XCTAssertNotNil(SweeprJSON.parseDate("2026-09-03T04:00:00Z"))
        XCTAssertNotNil(SweeprJSON.parseDate("2026-09-03"))
        XCTAssertNil(SweeprJSON.parseDate("not a date"))
    }

    // MARK: - Cleaner job rows (GET /cleaner-dashboard/my-jobs)

    func testCleanerJobDecodesFromFlatRow() throws {
        let payload = """
        { "jobs": [ {
          "id": "b7", "status": "confirmed", "day_status": "en_route",
          "service_type": "move_in_out",
          "scheduled_at": "2026-09-03T16:00:00.000Z",
          "total_price": 30000, "cleaner_payout": 21000,
          "bedrooms": 2, "bathrooms": 1,
          "arrival_window_start": "09:00:00", "arrival_window_end": "11:00:00",
          "address_city": "Denver", "address_state": "CO"
        } ] }
        """
        struct Envelope: Decodable { let jobs: [CleanerJob] }
        let jobs = try SweeprJSON.decoder.decode(Envelope.self, from: Data(payload.utf8)).jobs
        XCTAssertEqual(jobs.count, 1)
        let job = jobs[0]
        XCTAssertEqual(job.dayStatus, .en_route)
        XCTAssertTrue(job.isActiveShift)
        XCTAssertFalse(job.isOffer) // stamped only by the offers endpoint
        XCTAssertEqual(job.payoutMoney?.dollarsString, "$210.00")
        XCTAssertEqual(job.areaLabel, "Denver, CO")
    }

    func testOfferRowsHaveNoStatusAndDecode() throws {
        let payload = """
        { "jobs": [ {
          "id": "b8", "service_type": "standard",
          "scheduled_at": "2026-09-05T16:00:00.000Z",
          "total_price": 18500, "cleaner_payout": 12950,
          "bedrooms": 1, "bathrooms": 1,
          "arrival_window_start": null, "arrival_window_end": null,
          "address_city": "Aurora", "address_state": "CO"
        } ] }
        """
        struct Envelope: Decodable { let jobs: [CleanerJob] }
        let jobs = try SweeprJSON.decoder.decode(Envelope.self, from: Data(payload.utf8)).jobs
        XCTAssertNil(jobs[0].status)
        XCTAssertFalse(jobs[0].isActiveShift)
    }

    // MARK: - Live day-of-service envelope (GET /jobs/bookings/:id/live)

    func testLiveStatusDecodesWithOmittedAddress() throws {
        let payload = """
        {
          "booking": {
            "id": "b7", "status": "confirmed", "day_status": "en_route",
            "scheduled_at": "2026-09-03T16:00:00.000Z",
            "arrival_verified_at": null, "started_at": null, "completed_at": null,
            "total_price": 30000, "service_type": "deep", "deep_clean_applied": true,
            "cleaner_name": "Sam R.",
            "access_codes": [ { "code_type": "keypad", "code_value": null, "notes": "Side door" } ],
            "photos": [ { "id": "p1", "photo_type": "before", "room_label": null,
                          "created_at": "2026-09-03T16:05:00.000Z" } ]
          },
          "last_location": { "lat": 39.7, "lng": -104.9, "created_at": "2026-09-03T15:59:00.000Z" },
          "photos": [ { "id": "p1", "photo_type": "before", "room_label": null,
                        "created_at": "2026-09-03T16:05:00.000Z" } ]
        }
        """
        let live = try SweeprJSON.decoder.decode(LiveJobStatus.self, from: Data(payload.utf8))
        XCTAssertNil(live.booking.address) // key omitted until revealed
        XCTAssertEqual(live.booking.dayStatus, .en_route)
        XCTAssertEqual(live.beforeCount, 1)
        XCTAssertEqual(live.afterCount, 0)
        XCTAssertEqual(live.booking.accessCodes?.first?.notes, "Side door")
        XCTAssertEqual(live.lastLocation?.lat ?? 0, 39.7, accuracy: 0.001)
    }

    func testUnknownDayStatusDecodesSafely() throws {
        let status = try JSONDecoder().decode(DayStatus.self, from: Data("\"weird_new_state\"".utf8))
        XCTAssertEqual(status, .unknown)
    }

    // MARK: - Earnings (GET /cleaner-dashboard/earnings)

    func testEarningsSummaryDecodesAuditedShape() throws {
        let payload = """
        {
          "thisWeek": 42300, "thisMonth": 168400, "lastMonth": 154200, "allTime": 1240000,
          "pendingPayout": 25900, "nextPayoutDate": "2026-09-05",
          "stripeConnected": false, "onboardingUrl": "https://connect.stripe.com/x",
          "recent": [ { "date": null, "amount": 25900, "status": "pending", "booking_id": "b1" } ],
          "tipsThisMonth": 4500, "tipsAllTime": 61200,
          "recentTips": [ { "booking_id": "b1", "amount_cents": 1500, "date": "2026-09-01T00:00:00.000Z" } ]
        }
        """
        let s = try SweeprJSON.decoder.decode(EarningsSummary.self, from: Data(payload.utf8))
        XCTAssertEqual(s.thisWeekMoney.dollarsString, "$423.00")
        XCTAssertFalse(s.stripeConnected)
        XCTAssertNotNil(s.nextPayoutDate) // bare DATE column parsed
        XCTAssertNil(s.recent[0].date)    // unpaid payouts have null dates
        XCTAssertEqual(s.recentTips?.first?.amountCents, 1500)
    }

    // MARK: - Misc contracts

    func testMembershipIntervalWireTokens() {
        XCTAssertEqual(MembershipPlanInterval.monthly.rawValue, "month")
        XCTAssertEqual(MembershipPlanInterval.annual.rawValue, "year")
    }

    func testCouponKindLabelsMatchWireVocabulary() {
        func coupon(kind: String, value: Double?) throws -> Coupon {
            let json = """
            { "id": "c1", "code": "X", "title": null, "description": null, "theme": null,
              "kind": "\(kind)", "value": \(value.map { String($0) } ?? "null"),
              "addonKey": null, "usesLeft": 1, "minBookingTotalCents": null,
              "expiresAt": "2026-12-01T00:00:00.000Z" }
            """
            return try SweeprJSON.decoder.decode(Coupon.self, from: Data(json.utf8))
        }
        XCTAssertEqual(try coupon(kind: "percent_off", value: 15).displayValue, "15% off")
        XCTAssertEqual(try coupon(kind: "amount_off", value: 2000).displayValue, "$20.00 off")
        XCTAssertEqual(try coupon(kind: "free_addon", value: nil).displayValue, "Free add-on")
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

    func testCleaningGuideScalesWithScope() {
        let rooms = CleaningGuide.build(bedrooms: 3, bathrooms: 2, deepClean: true)
        XCTAssertEqual(rooms.filter { $0.room.hasPrefix("Bedroom") }.count, 3)
        XCTAssertEqual(rooms.filter { $0.room.hasPrefix("Bathroom") }.count, 2)
        XCTAssertTrue(rooms.first { $0.room == "Kitchen" }!.items.contains { $0.label.contains("Cabinet") })
    }
}
