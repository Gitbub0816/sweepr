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
import SweeprKit

// Local, cleaner-app-only models. These are NOT part of SweeprKit yet because the
// corresponding backend endpoints/shapes haven't been confirmed. Once the API
// contracts below stabilize, hoist them into `SweeprKit/Models/Models.swift` so
// the customer app can share them too (see CleanerAPI.swift for the endpoints
// these back).

// MARK: - Jobs list segmentation

/// Segments shown on the Jobs screen. "Available" is the offers inbox
/// (`offered_to_cleaner`), not yet accepted.
public enum JobSegment: String, CaseIterable, Identifiable, Sendable {
    case today = "Today"
    case upcoming = "Upcoming"
    case available = "Available"
    public var id: String { rawValue }
}

public extension Job {
    /// True while the job is in the offer inbox, pending accept/decline.
    var isOffer: Bool { booking.status == .offered_to_cleaner }

    /// True once the cleaner is actively working the job (drives the in-shift
    /// pinned banner on the Jobs screen).
    var isActiveShift: Bool {
        switch booking.status {
        case .cleaner_on_the_way, .arrived, .in_progress: return true
        default: return false
        }
    }

    /// Address is masked until the cleaner is en route — mirrors the day-of
    /// masking rule on the web dashboard.
    var maskedAreaLabel: String {
        guard let addr = booking.address else { return "Address pending" }
        if booking.status.isTrackable || booking.status == .completed || booking.status == .completed_pending_review {
            return addr.oneLine
        }
        let city = addr.city ?? "Nearby"
        return "\(city) area · \(addr.zip)"
    }
}

// MARK: - Day-of-service step machine (drives JobDetailScreen)

/// Ordered steps for the day-of-service flow. Mirrors the web flow's stages;
/// the *server* status transition remains authoritative — this only drives
/// which card is active/expanded on-device.
public enum DayOfServiceStep: Int, CaseIterable, Sendable, Comparable {
    case confirmed = 0
    case enRoute
    case arrived
    case smartEntry
    case beforePhotos
    case inProgress
    case afterPhotos
    case secureDoor
    case checkout
    case done

    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }

    public var title: String {
        switch self {
        case .confirmed: return "Confirmed"
        case .enRoute: return "Start route"
        case .arrived: return "Arrive"
        case .smartEntry: return "Smart Entry"
        case .beforePhotos: return "Before photos"
        case .inProgress: return "In progress"
        case .afterPhotos: return "After photos"
        case .secureDoor: return "Secure the door"
        case .checkout: return "Checkout"
        case .done: return "Complete"
        }
    }

    /// Maps a server-reported booking status onto the closest step, so the UI
    /// resumes at the right place after a relaunch.
    public static func from(status: BookingStatus) -> DayOfServiceStep {
        switch status {
        case .confirmed, .cleaner_accepted: return .confirmed
        case .cleaner_on_the_way: return .enRoute
        case .arrived: return .arrived
        case .in_progress: return .inProgress
        case .completed_pending_review, .completed: return .done
        default: return .confirmed
        }
    }
}

// MARK: - Checklist (room/scope)

public struct ChecklistItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let label: String
    public var done: Bool

    public init(id: String = UUID().uuidString, label: String, done: Bool = false) {
        self.id = id
        self.label = label
        self.done = done
    }
}

public struct RoomChecklist: Identifiable, Hashable, Sendable {
    public let id: String
    public let room: String
    public var items: [ChecklistItem]

    public init(id: String = UUID().uuidString, room: String, items: [ChecklistItem]) {
        self.id = id
        self.room = room
        self.items = items
    }

    public var isComplete: Bool { items.allSatisfy(\.done) }
}

// MARK: - Photo capture (before/after)

public struct CapturedPhoto: Identifiable, Hashable, Sendable {
    public let id: String
    public let capturedAt: Date
    public init(id: String = UUID().uuidString, capturedAt: Date = Date()) {
        self.id = id
        self.capturedAt = capturedAt
    }
}

// MARK: - Route / ETA

public struct RouteStop: Identifiable, Sendable {
    public let id: String
    public let job: Job
    public let etaMinutes: Int
    public let sequence: Int
}

// MARK: - Earnings / payouts

public struct PayoutRecord: Identifiable, Hashable, Sendable {
    public let id: String
    public let paidAt: Date
    public let amount: Money
    public let jobsCount: Int
    public let includesTips: Bool
}

// MARK: - Verification (Didit identity, Yardstik background check)

public struct VerificationStatus: Sendable {
    public enum State: String, Sendable { case notStarted, pending, cleared, actionNeeded }
    public let didit: State
    public let yardstik: State

    public var diditLabel: String { Self.label(for: didit) }
    public var yardstikLabel: String { Self.label(for: yardstik) }

    private static func label(for state: State) -> String {
        switch state {
        case .notStarted: return "Not started"
        case .pending: return "Pending"
        case .cleared: return "Cleared"
        case .actionNeeded: return "Action needed"
        }
    }
}

// MARK: - Mock fallbacks for the models above (no backend contract yet)

public enum CleanerMock {
    public static let checklist: [RoomChecklist] = [
        RoomChecklist(room: "Kitchen", items: [
            ChecklistItem(label: "Counters & backsplash"),
            ChecklistItem(label: "Sink & fixtures"),
            ChecklistItem(label: "Stovetop & exterior appliances"),
            ChecklistItem(label: "Floors"),
        ]),
        RoomChecklist(room: "Bathrooms", items: [
            ChecklistItem(label: "Toilet"),
            ChecklistItem(label: "Shower / tub"),
            ChecklistItem(label: "Mirror & vanity"),
            ChecklistItem(label: "Floors"),
        ]),
        RoomChecklist(room: "Bedrooms", items: [
            ChecklistItem(label: "Dusting"),
            ChecklistItem(label: "Floors"),
            ChecklistItem(label: "Make beds (if requested)"),
        ]),
        RoomChecklist(room: "Living areas", items: [
            ChecklistItem(label: "Dusting & surfaces"),
            ChecklistItem(label: "Floors / vacuum"),
        ]),
        RoomChecklist(room: "Add-ons", items: [
            ChecklistItem(label: "Inside fridge"),
            ChecklistItem(label: "Inside oven"),
        ]),
    ]

    public static let payouts: [PayoutRecord] = [
        PayoutRecord(id: "po_1", paidAt: Date().addingTimeInterval(-86400 * 2),
                     amount: Money(cents: 18400), jobsCount: 2, includesTips: true),
        PayoutRecord(id: "po_2", paidAt: Date().addingTimeInterval(-86400 * 9),
                     amount: Money(cents: 24200), jobsCount: 3, includesTips: false),
        PayoutRecord(id: "po_3", paidAt: Date().addingTimeInterval(-86400 * 16),
                     amount: Money(cents: 12000), jobsCount: 1, includesTips: true),
    ]

    public static let verification = VerificationStatus(didit: .cleared, yardstik: .cleared)

    public static let smartEntryRevealSeconds: TimeInterval = 45
}
