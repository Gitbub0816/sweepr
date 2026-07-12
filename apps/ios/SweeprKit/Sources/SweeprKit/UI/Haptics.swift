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

// Haptics helper. On iOS this taps UIKit's feedback generators; SKIP maps the
// calls to Android's Vibrator/HapticFeedbackConstants on transpile. Keep the
// surface tiny (impact / selection / notification) so it stays portable.

public enum SweeprHaptics {
    public enum Impact { case light, medium, heavy, soft, rigid }
    public enum Notify { case success, warning, error }

    public static func impact(_ style: Impact = .light) {
        #if os(iOS)
        let mapped: UIImpactFeedbackGenerator.FeedbackStyle
        switch style {
        case .light: mapped = .light
        case .medium: mapped = .medium
        case .heavy: mapped = .heavy
        case .soft: mapped = .soft
        case .rigid: mapped = .rigid
        }
        let generator = UIImpactFeedbackGenerator(style: mapped)
        generator.prepare()
        generator.impactOccurred()
        #endif
    }

    public static func selection() {
        #if os(iOS)
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
        #endif
    }

    public static func notify(_ type: Notify) {
        #if os(iOS)
        let mapped: UINotificationFeedbackGenerator.FeedbackType
        switch type {
        case .success: mapped = .success
        case .warning: mapped = .warning
        case .error: mapped = .error
        }
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(mapped)
        #endif
    }
}

// Convenience: fire a haptic as a side effect from a view builder chain.
public extension View {
    /// Runs `action` and plays a selection haptic — handy on taps.
    func hapticTap(_ style: SweeprHaptics.Impact = .light, perform action: @escaping () -> Void) -> some View {
        self.onTapGesture {
            SweeprHaptics.impact(style)
            action()
        }
    }
}
