//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import Foundation

// Deterministic mock data for SwiftUI previews and offline development, where the
// network isn't reachable (e.g. this repo's CI, or a device without a Clerk
// session). Screens fall back to these when a live fetch fails.

public enum SweeprMock {
    public static let address = Address(
        id: "addr_1", street: "1200 Market St", unit: "Apt 4B",
        city: "Denver", state: "CO", zip: "80202",
        latitude: 39.7466, longitude: -104.9899
    )

    public static let cleaner = Cleaner(
        id: "cl_1", firstName: "Maya", lastName: "Rodriguez",
        avatarUrl: nil, rating: 4.9, completedJobs: 312,
        latitude: 39.7510, longitude: -104.9850
    )

    public static let quote = Quote(
        subtotal: Money(cents: 15900),
        levelSurcharge: Money(cents: 2400),
        addOnsTotal: Money(cents: 3500),
        discount: Money(cents: -1500),
        tax: Money(cents: 0),
        total: Money(cents: 20300)
    )

    public static func booking(
        id: String = "bk_1",
        status: BookingStatus = .cleaner_on_the_way
    ) -> Booking {
        Booking(
            id: id, status: status, serviceType: "standard_clean",
            cleaningLevel: .extra_attention, bedrooms: 2, bathrooms: 1.5,
            scheduledAt: Date().addingTimeInterval(3600),
            address: address, cleaner: status.isTrackable ? cleaner : nil,
            quote: quote, addOns: ["inside_fridge", "inside_oven"]
        )
    }

    public static let bookings: [Booking] = [
        booking(id: "bk_1", status: .cleaner_on_the_way),
        booking(id: "bk_2", status: .confirmed),
        booking(id: "bk_3", status: .completed),
    ]

    public static let membership = Membership(
        active: true, planName: "Sweepr+",
        renewsAt: Date().addingTimeInterval(60 * 60 * 24 * 21),
        creditsCents: 2500, discountPct: 10
    )

    public static let jobs: [Job] = [
        Job(id: "job_1", booking: booking(id: "bk_10", status: .confirmed),
            payoutEstimate: Money(cents: 12000), distanceMeters: 2400),
        Job(id: "job_2", booking: booking(id: "bk_11", status: .offered_to_cleaner),
            payoutEstimate: Money(cents: 9800), distanceMeters: 5100),
    ]

    public static let earnings = EarningsSummary(
        weekToDate: Money(cents: 48000),
        pendingPayout: Money(cents: 12000),
        lifetime: Money(cents: 1_250_000),
        jobsThisWeek: 6
    )

    public static let smartEntry = SmartEntryAccess(
        method: .lockbox,
        instructions: "Lockbox on the gas meter, left of the front door.",
        code: "4827", revealedAt: nil
    )

    // MARK: - Customer-flow mocks

    public static let currentUser = CurrentUser(
        clerkId: "user_mock", email: "alex@example.com",
        firstName: "Alex", lastName: "Nguyen", role: "customer"
    )

    public static let coupons: [Coupon] = [
        Coupon(id: "cp_1", code: "WELCOME20", title: "Welcome offer",
               description: "20% off your first cleaning", theme: "seafoam",
               kind: "percent", value: 20, addonKey: nil, usesLeft: 1,
               minBookingTotalCents: 10000),
        Coupon(id: "cp_2", code: "FRIDGE", title: "Free fridge clean",
               description: "Inside-fridge add-on on us", theme: "amber",
               kind: "free_addon", value: nil, addonKey: "inside_fridge",
               usesLeft: 1, minBookingTotalCents: nil),
    ]

    public static let membershipInfo = MembershipInfo(
        enabled: true, member: true, status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: Date().addingTimeInterval(60 * 60 * 24 * 21),
        pricing: MembershipPricing(
            monthlyCents: 1900, annualCents: 19000,
            discountPercent: 10, monthlyDiscountCapCents: 3000
        )
    )

    public static let smartEntryStatus = SmartEntryStatus(
        enabled: true, remoteUnlockEnabled: true, manualCodeEnabled: true,
        feeCents: 500, includedWithMembership: false
    )

    public static let quoteResponse = QuoteResponse(
        total: 203.00,
        price: QuotePrice(
            totalPrice: 20300,
            levelSurchargeCents: 2400,
            emergencySurchargeCents: 0,
            isEmergency: false,
            lineItems: [
                QuoteLineItem(label: "Base fee", cents: 12000),
                QuoteLineItem(label: "Bedrooms", cents: 2000),
                QuoteLineItem(label: "Bathrooms", cents: 1500),
                QuoteLineItem(label: "Cleaning intensity", cents: 2400),
                QuoteLineItem(label: "Inside fridge", cents: 2000),
                QuoteLineItem(label: "Inside oven", cents: 1500),
                QuoteLineItem(label: "Member discount", cents: -1500),
            ],
            requiresCustomQuote: false
        ),
        engine: "rule_engine"
    )

    public static let bookingAccess = BookingAccessAuthorization(
        accessMethod: "smart_entry", lockDeviceId: "dev_1",
        customerAuthorizedAt: Date().addingTimeInterval(-3600),
        accessStartsAt: Date(), accessEndsAt: Date().addingTimeInterval(7200),
        revokedAt: nil
    )
}
