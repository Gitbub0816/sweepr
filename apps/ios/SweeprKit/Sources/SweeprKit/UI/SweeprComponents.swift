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

// Shared design-system components used by both apps. Kept to the SwiftUI subset
// that SkipUI transpiles cleanly.

// MARK: - SweeprButton

public struct SweeprButton: View {
    public enum Style { case primary, secondary, destructive }

    private let title: String
    private let style: Style
    private let systemIcon: String?
    private let isLoading: Bool
    private let action: () -> Void

    /// `@Environment(\.isEnabled)` reflects any `.disabled(_:)` a caller applies
    /// to this button, so the button can dim itself without a separate flag.
    @Environment(\.isEnabled) private var isEnabled

    public init(
        _ title: String,
        style: Style = .primary,
        systemIcon: String? = nil,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.style = style
        self.systemIcon = systemIcon
        self.isLoading = isLoading
        self.action = action
    }

    public var body: some View {
        Button(action: {
            guard !isLoading else { return }
            SweeprHaptics.impact(.medium)
            action()
        }) {
            HStack(spacing: SweeprSpacing.sm) {
                if isLoading {
                    ProgressView().tint(foreground)
                } else {
                    if let systemIcon { Image(systemName: systemIcon) }
                    Text(title).font(SweeprFont.body().weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundColor(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
            .opacity(isEnabled && !isLoading ? 1 : 0.55)
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .allowsHitTesting(!isLoading)
    }

    private var foreground: Color {
        switch style {
        case .primary, .destructive: return .white
        case .secondary: return SweeprColor.brand
        }
    }
    private var background: Color {
        switch style {
        case .primary: return SweeprColor.brand
        case .destructive: return Color(hex: 0xdc2626)
        case .secondary: return SweeprColor.seafoam100
        }
    }
}

// MARK: - Pressable button style (scale + opacity on press)

/// A shared `ButtonStyle` giving every SweeprButton a tactile press response —
/// a subtle scale-down and dim on `isPressed`, on the shared `SweeprMotion`
/// spring. SKIP transpiles `ButtonStyle` + `configuration.isPressed`.
public struct SweeprPressableButtonStyle: ButtonStyle {
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.90 : 1.0)
            .animation(SweeprMotion.press, value: configuration.isPressed)
    }
}

// MARK: - SweeprCard

public struct SweeprCard<Content: View>: View {
    private let content: Content
    private let elevation: SweeprElevation
    /// `elevation` defaults to a subtle `.low` lift; existing `SweeprCard { … }`
    /// call sites keep working and simply gain the softer resting shadow.
    public init(elevation: SweeprElevation = .low, @ViewBuilder content: () -> Content) {
        self.elevation = elevation
        self.content = content()
    }

    public var body: some View {
        content
            .padding(SweeprSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SweeprColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous)
                    .stroke(SweeprColor.separator, lineWidth: 1)
            )
            .sweeprElevation(elevation)
    }
}

// MARK: - SweeprBadge

/// A status label — a small color dot plus text, the way Apple's own apps
/// (Settings, Mail, App Store Connect) convey state. Deliberately NOT a
/// filled pill/chip: that background-capsule pattern reads as a web
/// dashboard, not a native iOS surface. Every existing call site (booking
/// status, "Active"/"Default", verification steps, coupon values, role
/// tags) keeps working unchanged — only the rendering changed.
public struct SweeprBadge: View {
    public enum Tone { case neutral, brand, success, warning, danger }

    private let text: String
    private let tone: Tone
    public init(_ text: String, tone: Tone = .neutral) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        HStack(spacing: 5) {
            Circle().fill(dot).frame(width: 6, height: 6)
            Text(text)
                .font(SweeprFont.caption().weight(.semibold))
        }
        .foregroundColor(fg)
    }

    private var dot: Color {
        switch tone {
        case .neutral: return SweeprColor.graphite500
        case .brand: return SweeprColor.seafoam600
        case .success: return Color(hex: 0x16a34a)
        case .warning: return SweeprColor.amber
        case .danger: return Color(hex: 0xdc2626)
        }
    }
    private var fg: Color {
        switch tone {
        case .neutral: return SweeprColor.textSecondary
        case .brand: return SweeprColor.seafoam700
        case .success: return Color(hex: 0x166534)
        case .warning: return Color(hex: 0x92400e)
        case .danger: return Color(hex: 0x991b1b)
        }
    }
}

/// Maps a booking status to a badge with an appropriate tone.
public extension SweeprBadge {
    init(status: BookingStatus) {
        let tone: Tone
        switch status {
        case .completed: tone = .success
        case .cancelled_by_customer, .cancelled_by_cleaner, .refunded, .disputed: tone = .danger
        case .cleaner_on_the_way, .arrived, .in_progress: tone = .brand
        default: tone = .neutral
        }
        self.init(status.displayLabel, tone: tone)
    }
}

// MARK: - Skeleton loader

public struct SkeletonBlock: View {
    private let height: CGFloat
    @State private var shimmer = false
    public init(height: CGFloat = 16) { self.height = height }

    public var body: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(SweeprColor.separator)
            .frame(height: height)
            .opacity(shimmer ? 0.4 : 0.9)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: shimmer)
            .onAppear { shimmer = true }
    }
}
