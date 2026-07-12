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
    private let action: () -> Void

    public init(
        _ title: String,
        style: Style = .primary,
        systemIcon: String? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.style = style
        self.systemIcon = systemIcon
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: SweeprSpacing.sm) {
                if let systemIcon { Image(systemName: systemIcon) }
                Text(title).font(SweeprFont.body().weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundColor(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
        }
        .buttonStyle(.plain)
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

// MARK: - SweeprCard

public struct SweeprCard<Content: View>: View {
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }

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
    }
}

// MARK: - SweeprBadge

public struct SweeprBadge: View {
    public enum Tone { case neutral, brand, success, warning, danger }

    private let text: String
    private let tone: Tone
    public init(_ text: String, tone: Tone = .neutral) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        Text(text)
            .font(SweeprFont.caption())
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundColor(fg)
            .background(bg)
            .clipShape(Capsule())
    }

    private var bg: Color {
        switch tone {
        case .neutral: return SweeprColor.graphite100
        case .brand: return SweeprColor.seafoam100
        case .success: return Color(hex: 0xdcfce7)
        case .warning: return Color(hex: 0xfef3c7)
        case .danger: return Color(hex: 0xfee2e2)
        }
    }
    private var fg: Color {
        switch tone {
        case .neutral: return SweeprColor.graphite700
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
