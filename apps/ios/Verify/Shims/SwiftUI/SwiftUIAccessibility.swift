//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// SwiftUI compile-verification shim — accessibility modifiers + trait tokens.
// Faithful to the real SwiftUI signatures (VoiceOver labels/hints/values,
// element grouping, traits), collapsing to `AnyShimView`. Additive: nothing
// here changes existing shim behaviour. See SwiftUICore.swift.

import Foundation

// MARK: - Accessibility trait / child-behavior tokens

public struct AccessibilityTraits: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let isButton = AccessibilityTraits(rawValue: 1 << 0)
    public static let isHeader = AccessibilityTraits(rawValue: 1 << 1)
    public static let isSelected = AccessibilityTraits(rawValue: 1 << 2)
    public static let isImage = AccessibilityTraits(rawValue: 1 << 3)
    public static let isLink = AccessibilityTraits(rawValue: 1 << 4)
    public static let isStaticText = AccessibilityTraits(rawValue: 1 << 5)
    public static let isSummaryElement = AccessibilityTraits(rawValue: 1 << 6)
    public static let updatesFrequently = AccessibilityTraits(rawValue: 1 << 7)
    public static let playsSound = AccessibilityTraits(rawValue: 1 << 8)
    public static let startsMediaSession = AccessibilityTraits(rawValue: 1 << 9)
}

public struct AccessibilityChildBehavior: Sendable {
    public static let ignore = AccessibilityChildBehavior()
    public static let contain = AccessibilityChildBehavior()
    public static let combine = AccessibilityChildBehavior()
}

// MARK: - Modifiers

@MainActor
public extension View {
    func accessibilityLabel<S: StringProtocol>(_ label: S) -> AnyShimView { AnyShimView() }
    func accessibilityLabel(_ label: Text) -> AnyShimView { AnyShimView() }
    func accessibilityHint<S: StringProtocol>(_ hint: S) -> AnyShimView { AnyShimView() }
    func accessibilityValue<S: StringProtocol>(_ value: S) -> AnyShimView { AnyShimView() }
    func accessibilityAddTraits(_ traits: AccessibilityTraits) -> AnyShimView { AnyShimView() }
    func accessibilityRemoveTraits(_ traits: AccessibilityTraits) -> AnyShimView { AnyShimView() }
    func accessibilityElement(children: AccessibilityChildBehavior = .ignore) -> AnyShimView { AnyShimView() }
    func accessibilityHidden(_ hidden: Bool) -> AnyShimView { AnyShimView() }
    func accessibilitySortPriority(_ sortPriority: Double) -> AnyShimView { AnyShimView() }
}
