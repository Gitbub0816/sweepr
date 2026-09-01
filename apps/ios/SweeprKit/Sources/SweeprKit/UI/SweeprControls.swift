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

// A richer set of reusable design-system controls, kept to the SwiftUI subset
// SkipUI transpiles cleanly. Names + tone stay consistent with the existing
// SweeprButton / SweeprCard / SweeprBadge family.

// MARK: - SweeprDivider

/// A hairline separator using the theme separator colour, with an optional
/// horizontal inset. Thinner and warmer than the system `Divider`.
public struct SweeprDivider: View {
    private let inset: CGFloat
    public init(inset: CGFloat = 0) { self.inset = inset }

    public var body: some View {
        Rectangle()
            .fill(SweeprColor.separator)
            .frame(height: 1)
            .padding(.horizontal, inset)
    }
}

// MARK: - SweeprListRow

/// A tappable settings/detail row: leading icon in a tinted tile, a title with
/// an optional subtitle, and an optional trailing value + chevron.
public struct SweeprListRow: View {
    private let title: String
    private let subtitle: String?
    private let systemIcon: String?
    private let tint: Color
    private let trailingText: String?
    private let showsChevron: Bool
    private let action: (() -> Void)?

    public init(
        title: String,
        subtitle: String? = nil,
        systemIcon: String? = nil,
        tint: Color = SweeprColor.brand,
        trailingText: String? = nil,
        showsChevron: Bool = true,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemIcon = systemIcon
        self.tint = tint
        self.trailingText = trailingText
        self.showsChevron = showsChevron
        self.action = action
    }

    public var body: some View {
        if let action {
            Button(action: {
                SweeprHaptics.selection()
                action()
            }) {
                rowContent
            }
            .buttonStyle(SweeprPressableButtonStyle())
        } else {
            rowContent
        }
    }

    private var rowContent: some View {
        HStack(spacing: SweeprSpacing.md) {
            if let systemIcon {
                Image(systemName: systemIcon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 36, height: 36)
                    .background(tint.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(SweeprFont.body().weight(.semibold))
                    .foregroundColor(SweeprColor.textPrimary)
                if let subtitle {
                    Text(subtitle).font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: SweeprSpacing.sm)
            if let trailingText {
                Text(trailingText).font(SweeprFont.body())
                    .foregroundColor(SweeprColor.textSecondary)
            }
            if showsChevron && action != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(SweeprColor.separator)
            }
        }
        .padding(.vertical, SweeprSpacing.sm)
        .contentShape(Rectangle())
    }
}

// MARK: - SweeprStat

/// A hero metric: a big number with a caption and optional icon / delta. Use
/// for earnings, ratings, counts. (`SweeprStatTile` in SweeprPatterns is the
/// boxed/surface variant; this is the bare, large-numeral form.)
public struct SweeprStat: View {
    public enum DeltaDirection: Sendable { case up, down, flat }

    private let value: String
    private let caption: String
    private let systemIcon: String?
    private let delta: String?
    private let deltaDirection: DeltaDirection

    public init(
        value: String,
        caption: String,
        systemIcon: String? = nil,
        delta: String? = nil,
        deltaDirection: DeltaDirection = .flat
    ) {
        self.value = value
        self.caption = caption
        self.systemIcon = systemIcon
        self.delta = delta
        self.deltaDirection = deltaDirection
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            HStack(spacing: SweeprSpacing.sm) {
                if let systemIcon {
                    Image(systemName: systemIcon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                Text(caption.uppercased())
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
            }
            Text(value)
                .font(SweeprFont.largeTitle())
                .foregroundColor(SweeprColor.textPrimary)
            if let delta {
                HStack(spacing: SweeprSpacing.xs) {
                    Image(systemName: deltaIcon)
                        .font(.system(size: 11, weight: .bold))
                    Text(delta).font(SweeprFont.footnote())
                }
                .foregroundColor(deltaColor)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var deltaIcon: String {
        switch deltaDirection {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .flat: return "minus"
        }
    }
    private var deltaColor: Color {
        switch deltaDirection {
        case .up: return Color(hex: 0x16a34a)
        case .down: return Color(hex: 0xdc2626)
        case .flat: return SweeprColor.textSecondary
        }
    }
}

// MARK: - SweeprProgressBar

/// A rounded, animatable determinate progress track (0...1).
public struct SweeprProgressBar: View {
    private let value: Double
    private let height: CGFloat
    private let tint: Color

    public init(value: Double, height: CGFloat = 8, tint: Color = SweeprColor.brand) {
        self.value = value
        self.height = height
        self.tint = tint
    }

    private var clamped: Double { Swift.max(0, Swift.min(1, value)) }

    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(SweeprColor.separator.opacity(0.5))
                Capsule()
                    .fill(tint)
                    .frame(width: geo.size.width * clamped)
            }
        }
        .frame(height: height)
        .animation(SweeprMotion.smooth, value: clamped)
    }
}

// MARK: - SweeprSegmentedControl

/// A brand-styled segmented control over any `Hashable` value. The selected
/// segment slides on the shared spring; each change fires a selection haptic.
public struct SweeprSegmentedControl<Value: Hashable>: View {
    public struct Segment: Identifiable {
        public let id: Int
        public let value: Value
        public let label: String
        public init(_ value: Value, label: String, id: Int) {
            self.id = id
            self.value = value
            self.label = label
        }
    }

    private let segments: [Segment]
    @Binding private var selection: Value

    public init(selection: Binding<Value>, options: [(value: Value, label: String)]) {
        self._selection = selection
        self.segments = options.enumerated().map { Segment($0.element.value, label: $0.element.label, id: $0.offset) }
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(segments) { segment in
                let isSelected = segment.value == selection
                Button(action: {
                    SweeprHaptics.selection()
                    selection = segment.value
                }) {
                    Text(segment.label)
                        .font(SweeprFont.caption().weight(.semibold))
                        .foregroundColor(isSelected ? .white : SweeprColor.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SweeprSpacing.sm)
                        .background(isSelected ? SweeprColor.brand : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button - 4, style: .continuous))
                }
                .buttonStyle(SweeprPressableButtonStyle())
            }
        }
        .padding(4)
        .background(SweeprColor.graphite100)
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
        .animation(SweeprMotion.snappy, value: selection)
    }
}

// MARK: - SweeprSheetHeader

/// A leading-aligned sheet/section header with an optional subtitle and a
/// trailing close affordance.
public struct SweeprSheetHeader: View {
    private let title: String
    private let subtitle: String?
    private let onClose: (() -> Void)?

    public init(title: String, subtitle: String? = nil, onClose: (() -> Void)? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.onClose = onClose
    }

    public var body: some View {
        HStack(alignment: .top, spacing: SweeprSpacing.md) {
            VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                Text(title).font(SweeprFont.title())
                    .foregroundColor(SweeprColor.textPrimary)
                if let subtitle {
                    Text(subtitle).font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
            if let onClose {
                Button(action: {
                    SweeprHaptics.impact(.light)
                    onClose()
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 26, weight: .regular))
                        .foregroundColor(SweeprColor.separator)
                }
                .buttonStyle(SweeprPressableButtonStyle())
            }
        }
    }
}

// MARK: - SweeprEmptyState

/// A centred placeholder for empty collections: icon, title, message, and an
/// optional call-to-action button.
public struct SweeprEmptyState: View {
    private let systemIcon: String
    private let title: String
    private let message: String
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(
        systemIcon: String = "tray",
        title: String,
        message: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.systemIcon = systemIcon
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: SweeprSpacing.md) {
            Image(systemName: systemIcon)
                .font(.system(size: 40, weight: .regular))
                .foregroundColor(SweeprColor.brand)
                .frame(width: 84, height: 84)
                .background(SweeprColor.seafoam100)
                .clipShape(Circle())
            Text(title).font(SweeprFont.heading())
                .foregroundColor(SweeprColor.textPrimary)
                .multilineTextAlignment(.center)
            Text(message).font(SweeprFont.body())
                .foregroundColor(SweeprColor.textSecondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(action: {
                    SweeprHaptics.impact(.medium)
                    action()
                }) {
                    Text(actionTitle).font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                .buttonStyle(SweeprPressableButtonStyle())
            }
        }
        .padding(SweeprSpacing.xl)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - SweeprErrorState

/// A centred error placeholder with a retry affordance. Distinct in tone from
/// `SweeprEmptyState` (amber/danger, not brand).
public struct SweeprErrorState: View {
    private let title: String
    private let message: String
    private let retryTitle: String
    private let onRetry: (() -> Void)?

    public init(
        title: String = "Something went wrong",
        message: String,
        retryTitle: String = "Try again",
        onRetry: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.retryTitle = retryTitle
        self.onRetry = onRetry
    }

    public var body: some View {
        VStack(spacing: SweeprSpacing.md) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 34, weight: .regular))
                .foregroundColor(SweeprColor.amber)
                .frame(width: 84, height: 84)
                .background(SweeprColor.amber.opacity(0.12))
                .clipShape(Circle())
            Text(title).font(SweeprFont.heading())
                .foregroundColor(SweeprColor.textPrimary)
                .multilineTextAlignment(.center)
            Text(message).font(SweeprFont.body())
                .foregroundColor(SweeprColor.textSecondary)
                .multilineTextAlignment(.center)
            if let onRetry {
                Button(action: {
                    SweeprHaptics.impact(.medium)
                    onRetry()
                }) {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "arrow.clockwise")
                        Text(retryTitle).font(SweeprFont.body().weight(.semibold))
                    }
                    .foregroundColor(SweeprColor.brand)
                }
                .buttonStyle(SweeprPressableButtonStyle())
            }
        }
        .padding(SweeprSpacing.xl)
        .frame(maxWidth: .infinity)
    }
}
