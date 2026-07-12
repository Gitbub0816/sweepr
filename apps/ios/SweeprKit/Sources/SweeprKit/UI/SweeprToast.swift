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
import Observation

// SweeprToast — a lightweight, brand-styled transient banner. Mirrors the web
// `toast` in @sweepr/ui. Driven by a `@Observable` ToastCenter you put in the
// environment; call `.show(...)` from anywhere and render `.sweeprToast(center)`
// once at the app root.

public struct SweeprToastMessage: Identifiable, Equatable, Sendable {
    public enum Kind: Sendable { case info, success, warning, error }
    public let id = UUID()
    public let text: String
    public let kind: Kind
    public init(_ text: String, kind: Kind = .info) {
        self.text = text
        self.kind = kind
    }

    var systemIcon: String {
        switch kind {
        case .info: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.octagon.fill"
        }
    }

    var tint: Color {
        switch kind {
        case .info: return SweeprColor.brand
        case .success: return Color(hex: 0x16a34a)
        case .warning: return SweeprColor.amber
        case .error: return Color(hex: 0xdc2626)
        }
    }
}

@MainActor
@Observable
public final class ToastCenter {
    public private(set) var current: SweeprToastMessage?
    private var dismissTask: Task<Void, Never>?

    public init() {}

    public func show(_ message: SweeprToastMessage, duration: Double = 2.4) {
        SweeprHaptics.notify(message.kind == .error ? .error : .success)
        current = message
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.current = nil
        }
    }

    public func show(_ text: String, kind: SweeprToastMessage.Kind = .info) {
        show(SweeprToastMessage(text, kind: kind))
    }

    public func dismiss() {
        dismissTask?.cancel()
        current = nil
    }
}

// MARK: - Presentation

private struct ToastOverlay: ViewModifier {
    @Bindable var center: ToastCenter

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let msg = center.current {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: msg.systemIcon).foregroundColor(msg.tint)
                    Text(msg.text)
                        .font(SweeprFont.body().weight(.medium))
                        .foregroundColor(SweeprColor.textPrimary)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, SweeprSpacing.md)
                .padding(.vertical, SweeprSpacing.sm)
                .background(SweeprColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                        .stroke(SweeprColor.separator, lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.12), radius: 12, y: 4)
                .padding(.horizontal, SweeprSpacing.md)
                .padding(.top, SweeprSpacing.sm)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture { center.dismiss() }
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: center.current)
    }
}

public extension View {
    /// Render the toast overlay for a given center. Attach once, near the root.
    func sweeprToast(_ center: ToastCenter) -> some View {
        modifier(ToastOverlay(center: center))
    }
}
