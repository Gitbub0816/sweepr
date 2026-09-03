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

// Sample data for SwiftUI PREVIEWS and unit tests ONLY. Production code paths
// must never render these — screens show real loading/empty/error states
// instead (App Review 2.1: no placeholder data in shipping flows).

public enum SweeprMock {
    public static func booking(
        id: String = "bk_preview_1",
        status: BookingStatus = .confirmed,
        dayStatus: DayStatus? = nil
    ) -> Booking {
        Booking(
            id: id,
            status: status,
            dayStatus: dayStatus,
            cleanerId: nil,
            addressId: nil,
            serviceType: "standard",
            cleaningLevel: .refresh,
            bedrooms: 2,
            bathrooms: 1,
            sqft: 1200,
            homeType: "apartment",
            scheduledAt: Date().addingTimeInterval(60 * 60 * 26),
            durationMinutes: 150,
            arrivalWindowStart: "10:00:00",
            arrivalWindowEnd: "12:00:00",
            basePrice: 13900,
            addonsTotal: 2500,
            serviceFee: 1200,
            tax: 900,
            totalPrice: 18500,
            cleaningLevelSurchargeCents: 0,
            smartEntryFeeCents: 500,
            sweeprPlusDiscountCents: 0,
            cleanerLat: 39.7392,
            cleanerLng: -104.9903,
            addressLine1: "1200 Market St",
            addressCity: "Denver",
            addressState: "CO",
            addressZip: "80202",
            addonKeys: ["inside_fridge"],
            deepCleanApplied: false,
            notes: nil,
            entryNotes: nil,
            parkingNotes: nil,
            accessMethod: "smart_entry",
            createdAt: Date()
        )
    }

    public static var bookings: [Booking] {
        [
            booking(),
            booking(id: "bk_preview_2", status: .completed),
        ]
    }

    public static let currentUser = CurrentUser(
        clerkId: "user_preview",
        email: "preview@getsweepr.com",
        userId: "00000000-0000-0000-0000-000000000001",
        firstName: "Jordan",
        lastName: "Rivera",
        role: "customer"
    )

    public static let membershipInfo = MembershipInfo(
        enabled: true,
        member: false,
        status: nil,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: nil,
        pricing: MembershipPricing(
            monthlyCents: 1299, annualCents: 12900,
            discountPercent: 3, monthlyDiscountCapCents: 1500
        )
    )

    public static let smartEntryStatus = SmartEntryStatus(
        enabled: true, remoteUnlockEnabled: true, manualCodeEnabled: true,
        feeCents: 500, includedWithMembership: false
    )
}

public enum CleanerMock {
    public static func job(
        id: String = "bk_preview_1",
        status: BookingStatus? = .confirmed,
        dayStatus: DayStatus? = nil,
        isOffer: Bool = false
    ) -> CleanerJob {
        CleanerJob(
            id: id,
            status: isOffer ? nil : status,
            dayStatus: dayStatus,
            serviceType: "standard",
            scheduledAt: Date().addingTimeInterval(60 * 60 * 3),
            totalPrice: 18500,
            cleanerPayout: 12950,
            bedrooms: 2,
            bathrooms: 1,
            arrivalWindowStart: "10:00:00",
            arrivalWindowEnd: "12:00:00",
            addressCity: "Denver",
            addressState: "CO",
            isOffer: isOffer
        )
    }

    public static var jobs: [CleanerJob] {
        [
            job(),
            job(id: "bk_preview_offer", isOffer: true),
        ]
    }

    public static let earnings = EarningsSummary(
        thisWeek: 42300, thisMonth: 168400, lastMonth: 154200, allTime: 1_240_000,
        pendingPayout: 25900, nextPayoutDate: Date().addingTimeInterval(86_400 * 2),
        stripeConnected: true, onboardingUrl: nil,
        recent: [
            EarningsRecentPayout(date: Date().addingTimeInterval(-86_400 * 3),
                                 amount: 25900, status: "paid", bookingId: "bk_preview_2"),
        ],
        tipsThisMonth: 4500, tipsAllTime: 61200,
        recentTips: []
    )

    public static let onboarding = OnboardingProgress(
        status: "approved",
        steps: OnboardingSteps(
            profile: true, training: true, background: true,
            identity: true, insurance: true, submitted: true, approved: true
        )
    )
}
