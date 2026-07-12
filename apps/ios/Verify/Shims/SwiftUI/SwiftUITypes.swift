//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// SwiftUI compile-verification shim — value types (colors, fonts, alignment,
// styles, gradients, transitions, animations) and enums. See SwiftUICore.swift.

import Foundation

// MARK: - Geometry helpers

public enum Axis: Hashable, Sendable {
    case horizontal, vertical
    public struct Set: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }
        public static let horizontal = Set(rawValue: 1 << 0)
        public static let vertical = Set(rawValue: 1 << 1)
        public static let all: Set = [.horizontal, .vertical]
    }
}

public enum Edge: Int, Hashable, Sendable, CaseIterable {
    case top, leading, bottom, trailing
    public struct Set: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }
        public static let top = Set(rawValue: 1 << 0)
        public static let leading = Set(rawValue: 1 << 1)
        public static let bottom = Set(rawValue: 1 << 2)
        public static let trailing = Set(rawValue: 1 << 3)
        public static let horizontal: Set = [.leading, .trailing]
        public static let vertical: Set = [.top, .bottom]
        public static let all: Set = [.top, .leading, .bottom, .trailing]
    }
}

public enum HorizontalEdge: Hashable, Sendable { case leading, trailing }

public enum HorizontalAlignment: Hashable, Sendable { case leading, center, trailing }
public enum VerticalAlignment: Hashable, Sendable { case top, center, bottom, firstTextBaseline, lastTextBaseline }

public struct Alignment: Hashable, Sendable {
    public var horizontal: HorizontalAlignment
    public var vertical: VerticalAlignment
    public init(horizontal: HorizontalAlignment, vertical: VerticalAlignment) {
        self.horizontal = horizontal
        self.vertical = vertical
    }
    public static let center = Alignment(horizontal: .center, vertical: .center)
    public static let leading = Alignment(horizontal: .leading, vertical: .center)
    public static let trailing = Alignment(horizontal: .trailing, vertical: .center)
    public static let top = Alignment(horizontal: .center, vertical: .top)
    public static let bottom = Alignment(horizontal: .center, vertical: .bottom)
    public static let topLeading = Alignment(horizontal: .leading, vertical: .top)
    public static let topTrailing = Alignment(horizontal: .trailing, vertical: .top)
    public static let bottomLeading = Alignment(horizontal: .leading, vertical: .bottom)
    public static let bottomTrailing = Alignment(horizontal: .trailing, vertical: .bottom)
}

public struct UnitPoint: Hashable, Sendable {
    public var x: CGFloat
    public var y: CGFloat
    public init(x: CGFloat = 0, y: CGFloat = 0) { self.x = x; self.y = y }
    public static let center = UnitPoint(x: 0.5, y: 0.5)
    public static let top = UnitPoint(x: 0.5, y: 0)
    public static let bottom = UnitPoint(x: 0.5, y: 1)
    public static let leading = UnitPoint(x: 0, y: 0.5)
    public static let trailing = UnitPoint(x: 1, y: 0.5)
    public static let topLeading = UnitPoint(x: 0, y: 0)
    public static let topTrailing = UnitPoint(x: 1, y: 0)
    public static let bottomLeading = UnitPoint(x: 0, y: 1)
    public static let bottomTrailing = UnitPoint(x: 1, y: 1)
}

public struct GeometryProxy {
    public let size: CGSize
    public init(size: CGSize = .zero) { self.size = size }
}

// MARK: - Enumerated style tokens

public enum TextAlignment: Hashable, Sendable { case leading, center, trailing }
public enum RoundedCornerStyle: Hashable, Sendable { case circular, continuous }
public enum Visibility: Hashable, Sendable { case automatic, visible, hidden }
public enum NavigationBarTitleDisplayMode: Hashable, Sendable { case automatic, inline, large }
public enum ButtonRole: Hashable, Sendable { case destructive, cancel }

public struct ScrollIndicatorVisibility: Hashable, Sendable {
    public static let automatic = ScrollIndicatorVisibility()
    public static let visible = ScrollIndicatorVisibility()
    public static let hidden = ScrollIndicatorVisibility()
}

public struct DatePickerComponents: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let date = DatePickerComponents(rawValue: 1 << 0)
    public static let hourAndMinute = DatePickerComponents(rawValue: 1 << 1)
}

// MARK: - Style tokens (button / list / picker / datePicker)

public struct _ButtonStyle: Sendable { public static let plain = _ButtonStyle(); public static let automatic = _ButtonStyle(); public static let bordered = _ButtonStyle(); public static let borderedProminent = _ButtonStyle() }
public struct _ListStyle: Sendable { public static let plain = _ListStyle(); public static let insetGrouped = _ListStyle(); public static let grouped = _ListStyle(); public static let automatic = _ListStyle() }
public struct _PickerStyle: Sendable { public static let segmented = _PickerStyle(); public static let menu = _PickerStyle(); public static let automatic = _PickerStyle(); public static let inline = _PickerStyle() }
public struct _DatePickerStyle: Sendable { public static let graphical = _DatePickerStyle(); public static let compact = _DatePickerStyle(); public static let wheel = _DatePickerStyle(); public static let automatic = _DatePickerStyle() }

// MARK: - ShapeStyle / Color

public protocol ShapeStyle {}

public struct Color: ShapeStyle, Hashable, Sendable {
    public var red: Double
    public var green: Double
    public var blue: Double
    public var alpha: Double
    public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {
        self.red = red; self.green = green; self.blue = blue; self.alpha = opacity
    }
    public init(white: Double, opacity: Double = 1) {
        self.red = white; self.green = white; self.blue = white; self.alpha = opacity
    }
    public func opacity(_ opacity: Double) -> Color {
        Color(red: red, green: green, blue: blue, opacity: opacity)
    }
    public static let white = Color(white: 1)
    public static let black = Color(white: 0)
    public static let clear = Color(white: 0, opacity: 0)
    public static let gray = Color(white: 0.5)
    public static let red = Color(red: 1, green: 0, blue: 0)
    public static let primary = Color(white: 0)
    public static let secondary = Color(white: 0.5)
    public static let accentColor = Color(white: 0.5)
}

// View conformance in an extension so the whole `Color` type is NOT inferred
// `@MainActor` (it's built from nonisolated `SweeprColor` static members).
extension Color: View {
    public typealias Body = AnyShimView
}

public struct LinearGradient: View, ShapeStyle {
    public typealias Body = AnyShimView
    public init(colors: [Color], startPoint: UnitPoint, endPoint: UnitPoint) {}
    public init(gradient: Gradient, startPoint: UnitPoint, endPoint: UnitPoint) {}
}

public struct Gradient: Sendable {
    public init(colors: [Color]) {}
}

// MARK: - Font

public struct Font: Hashable, Sendable {
    public enum Weight: Hashable, Sendable {
        case ultraLight, thin, light, regular, medium, semibold, bold, heavy, black
    }
    public enum Design: Hashable, Sendable {
        case `default`, serif, rounded, monospaced
    }
    private var size: CGFloat
    private var weight: Weight
    private var design: Design
    public static func system(size: CGFloat, weight: Weight = .regular, design: Design = .default) -> Font {
        Font(size: size, weight: weight, design: design)
    }
    public func weight(_ weight: Weight) -> Font {
        Font(size: size, weight: weight, design: design)
    }
    public static let body = Font(size: 17, weight: .regular, design: .default)
    public static let caption = Font(size: 12, weight: .regular, design: .default)
    public static let headline = Font(size: 17, weight: .semibold, design: .default)
    public static let title = Font(size: 28, weight: .regular, design: .default)
}

// MARK: - Animation / Transition

public struct Animation: Sendable {
    public static func easeInOut(duration: Double) -> Animation { Animation() }
    public static func easeInOut() -> Animation { Animation() }
    public static func easeIn(duration: Double) -> Animation { Animation() }
    public static func easeOut(duration: Double) -> Animation { Animation() }
    public static func linear(duration: Double) -> Animation { Animation() }
    public static func spring(response: Double = 0.5, dampingFraction: Double = 0.825, blendDuration: Double = 0) -> Animation { Animation() }
    public static let `default` = Animation()
    public func repeatForever(autoreverses: Bool = true) -> Animation { self }
    public func delay(_ delay: Double) -> Animation { self }
    public func speed(_ speed: Double) -> Animation { self }
}

public struct AnyTransition: Sendable {
    public static let opacity = AnyTransition()
    public static let identity = AnyTransition()
    public static let scale = AnyTransition()
    public static func move(edge: Edge) -> AnyTransition { AnyTransition() }
    public static func asymmetric(insertion: AnyTransition, removal: AnyTransition) -> AnyTransition { AnyTransition() }
    public func combined(with other: AnyTransition) -> AnyTransition { self }
}
