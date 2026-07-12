//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import SwiftUI

// Higher-level, reusable building blocks shared by both apps. Kept to the SwiftUI
// subset SkipUI transpiles. These give the customer app its DoorDash-grade feel
// without re-deriving layout in every screen.

// MARK: - Section title

public struct SweeprSectionTitle: View {
    private let title: String
    private let action: (() -> Void)?
    private let actionLabel: String?

    public init(_ title: String, actionLabel: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.actionLabel = actionLabel
        self.action = action
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
            Spacer()
            if let action, let actionLabel {
                Button(action: {
                    SweeprHaptics.selection()
                    action()
                }) {
                    Text(actionLabel).font(SweeprFont.caption()).foregroundColor(SweeprColor.brand)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Icon quick-action tile

public struct SweeprQuickAction: View {
    private let title: String
    private let systemIcon: String
    private let tint: Color
    private let action: () -> Void

    public init(_ title: String, systemIcon: String, tint: Color = SweeprColor.brand, action: @escaping () -> Void) {
        self.title = title
        self.systemIcon = systemIcon
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: {
            SweeprHaptics.impact(.light)
            action()
        }) {
            VStack(spacing: SweeprSpacing.sm) {
                Image(systemName: systemIcon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 52, height: 52)
                    .background(tint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                Text(title)
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Stat tile

public struct SweeprStatTile: View {
    private let label: String
    private let value: String
    private let systemIcon: String?

    public init(label: String, value: String, systemIcon: String? = nil) {
        self.label = label
        self.value = value
        self.systemIcon = systemIcon
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            if let systemIcon {
                Image(systemName: systemIcon).foregroundColor(SweeprColor.brand)
            }
            Text(value).font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
            Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SweeprSpacing.md)
        .background(SweeprColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous)
                .stroke(SweeprColor.separator, lineWidth: 1)
        )
    }
}

// MARK: - Selectable choice row (used across the booking wizard)

public struct SweeprChoiceRow: View {
    private let title: String
    private let subtitle: String?
    private let systemIcon: String?
    private let trailing: String?
    private let isSelected: Bool
    private let action: () -> Void

    public init(
        title: String,
        subtitle: String? = nil,
        systemIcon: String? = nil,
        trailing: String? = nil,
        isSelected: Bool,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemIcon = systemIcon
        self.trailing = trailing
        self.isSelected = isSelected
        self.action = action
    }

    public var body: some View {
        Button(action: {
            SweeprHaptics.selection()
            action()
        }) {
            HStack(spacing: SweeprSpacing.md) {
                if let systemIcon {
                    Image(systemName: systemIcon)
                        .foregroundColor(isSelected ? SweeprColor.brand : SweeprColor.textSecondary)
                        .frame(width: 26)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    if let subtitle {
                        Text(subtitle).font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                }
                Spacer()
                if let trailing {
                    Text(trailing).font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                }
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? SweeprColor.brand : SweeprColor.separator)
            }
            .padding(SweeprSpacing.md)
            .background(SweeprColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                    .stroke(isSelected ? SweeprColor.brand : SweeprColor.separator,
                            lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Status timeline (booking detail)

/// A vertical progress timeline over the customer-visible booking milestones.
public struct SweeprStatusTimeline: View {
    private let current: BookingStatus

    public init(current: BookingStatus) { self.current = current }

    // Customer-facing happy-path milestones (mirrors statusMachine ordering).
    private static let milestones: [BookingStatus] = [
        .booked, .confirmed, .cleaner_on_the_way, .arrived, .in_progress, .completed
    ]

    private func rank(_ status: BookingStatus) -> Int {
        // Map any concrete status to the nearest milestone index.
        switch status {
        case .draft, .quoted, .payment_pending, .booked, .matching, .offered_to_cleaner:
            return 0
        case .cleaner_accepted, .confirmed: return 1
        case .cleaner_on_the_way: return 2
        case .arrived: return 3
        case .in_progress: return 4
        case .completed_pending_review, .completed: return 5
        default: return -1 // cancelled / refunded / disputed
        }
    }

    public var body: some View {
        let currentRank = rank(current)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(Self.milestones.enumerated()), id: \.offset) { idx, milestone in
                let reached = currentRank >= idx && currentRank >= 0
                let isCurrent = currentRank == idx
                HStack(alignment: .top, spacing: SweeprSpacing.md) {
                    VStack(spacing: 0) {
                        Circle()
                            .fill(reached ? SweeprColor.brand : SweeprColor.separator)
                            .frame(width: 14, height: 14)
                            .overlay(
                                Circle().stroke(SweeprColor.background, lineWidth: 2)
                            )
                        if idx < Self.milestones.count - 1 {
                            Rectangle()
                                .fill(reached ? SweeprColor.brand : SweeprColor.separator)
                                .frame(width: 2, height: 28)
                        }
                    }
                    Text(milestone.displayLabel)
                        .font(isCurrent ? SweeprFont.body().weight(.semibold) : SweeprFont.body())
                        .foregroundColor(reached ? SweeprColor.textPrimary : SweeprColor.textSecondary)
                        .padding(.bottom, idx < Self.milestones.count - 1 ? SweeprSpacing.md : 0)
                }
            }
        }
    }
}
