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

// TapToUnlock — a deliberate press-and-hold control for Smart Entry. The GESTURE
// is the affordance; the actual unlock is the injected async closure (which the
// caller wires to `CleanerAPI.unlockDoor(bookingId:location:)`). The control
// animates a fill as the user holds, plays escalating haptics, and settles into
// a success or failure state.
//
// GATING: this control does NOT know whether the cleaner is checked in. Exactly
// like the web, the CALLER must only present/enable it once checked in (pass
// `isEnabled: false` otherwise); the backend re-validates every unlock via
// `authorizeHomeAccess`, so a disabled-bypass still fails server-side.

public struct TapToUnlock: View {
    public enum UnlockPhase: Equatable, Sendable {
        case ready      // idle, waiting for a hold
        case holding    // finger down, fill animating toward the threshold
        case unlocking  // threshold reached, backend call in flight
        case unlocked   // backend confirmed success
        case failed     // backend reported failure / threw
    }

    private let title: String
    private let holdingTitle: String
    private let unlockingTitle: String
    private let unlockedTitle: String
    private let failedTitle: String
    private let holdDuration: Double
    private let isEnabled: Bool
    private let onUnlock: () async -> Bool

    @State private var phase: UnlockPhase = .ready
    @State private var fill: Double = 0

    public init(
        title: String = "Hold to unlock",
        holdingTitle: String = "Keep holding…",
        unlockingTitle: String = "Unlocking…",
        unlockedTitle: String = "Unlocked",
        failedTitle: String = "Couldn't unlock — try again",
        holdDuration: Double = 1.1,
        isEnabled: Bool = true,
        onUnlock: @escaping () async -> Bool
    ) {
        self.title = title
        self.holdingTitle = holdingTitle
        self.unlockingTitle = unlockingTitle
        self.unlockedTitle = unlockedTitle
        self.failedTitle = failedTitle
        self.holdDuration = holdDuration
        self.isEnabled = isEnabled
        self.onUnlock = onUnlock
    }

    public var body: some View {
        VStack(spacing: SweeprSpacing.sm) {
            control
            Text(hint)
                .font(SweeprFont.footnote())
                .foregroundColor(SweeprColor.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private var control: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Track.
                RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                    .fill(trackColor)
                // Hold fill.
                RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                    .fill(SweeprColor.brand)
                    .frame(width: geo.size.width * fillFraction)
                // Label.
                HStack(spacing: SweeprSpacing.sm) {
                    icon
                    Text(label)
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(labelColor)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 60)
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                .stroke(SweeprColor.brand.opacity(0.35), lineWidth: 1)
        )
        .opacity(isEnabled ? 1 : 0.5)
        .scaleEffect(phase == .holding ? 0.99 : 1.0)
        .animation(SweeprMotion.press, value: phase)
        .allowsHitTesting(isEnabled && (phase == .ready || phase == .failed))
        .onLongPressGesture(
            minimumDuration: holdDuration,
            maximumDistance: 40,
            perform: { completeHold() },
            onPressingChanged: { pressing in pressingChanged(pressing) }
        )
    }

    @ViewBuilder private var icon: some View {
        switch phase {
        case .unlocking:
            ProgressView().tint(labelColor)
        case .unlocked:
            Image(systemName: "lock.open.fill").foregroundColor(labelColor)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill").foregroundColor(labelColor)
        default:
            Image(systemName: "lock.fill").foregroundColor(labelColor)
        }
    }

    // MARK: - Gesture handling

    private func pressingChanged(_ pressing: Bool) {
        guard isEnabled else { return }
        if pressing {
            guard phase == .ready || phase == .failed else { return }
            phase = .holding
            SweeprHaptics.impact(.soft)
            withAnimation(.linear(duration: holdDuration)) { fill = 1 }
        } else {
            // Released before the threshold fired → cancel and snap back.
            if phase == .holding {
                phase = .ready
                withAnimation(SweeprMotion.snappy) { fill = 0 }
            }
        }
    }

    private func completeHold() {
        guard isEnabled, phase == .holding else { return }
        phase = .unlocking
        fill = 1
        SweeprHaptics.impact(.heavy)
        Task {
            let ok = await onUnlock()
            if ok {
                phase = .unlocked
                SweeprHaptics.notify(.success)
            } else {
                phase = .failed
                SweeprHaptics.notify(.error)
                withAnimation(SweeprMotion.snappy) { fill = 0 }
            }
        }
    }

    // MARK: - Derived presentation

    /// While unlocking/unlocked the fill stays full; otherwise it tracks `fill`.
    private var fillFraction: Double {
        switch phase {
        case .unlocking, .unlocked: return 1
        default: return Swift.max(0, Swift.min(1, fill))
        }
    }

    private var trackColor: Color {
        phase == .failed ? Color(hex: 0xfee2e2) : SweeprColor.seafoam100
    }

    private var labelColor: Color {
        switch phase {
        case .holding, .unlocking, .unlocked: return .white
        case .failed: return Color(hex: 0x991b1b)
        case .ready: return SweeprColor.brand
        }
    }

    private var label: String {
        switch phase {
        case .ready: return title
        case .holding: return holdingTitle
        case .unlocking: return unlockingTitle
        case .unlocked: return unlockedTitle
        case .failed: return failedTitle
        }
    }

    private var hint: String {
        if !isEnabled { return "Check in at the property to enable Smart Entry." }
        switch phase {
        case .unlocked: return "Door unlocked. The customer has been notified."
        case .failed: return "Smart Entry didn't respond. Hold again to retry."
        default: return "Press and hold to send the unlock command."
        }
    }
}
