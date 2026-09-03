//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// SwiftUI compile-verification shim — concrete view types + containers +
// controls. Content closures are type-checked but discarded. See
// SwiftUICore.swift.

import Foundation

// MARK: - Leaf views

public struct Text: View {
    public typealias Body = AnyShimView
    public init(_ content: String) {}
    public init<S: StringProtocol>(_ content: S) {}
    public init(verbatim content: String) {}
}

public struct Image: View {
    public typealias Body = AnyShimView
    public init(systemName: String) {}
    public init(_ name: String) {}
}

public struct Label: View {
    public typealias Body = AnyShimView
    public init(_ title: String, systemImage: String) {}
    public init(@ViewBuilder title: () -> AnyShimView, @ViewBuilder icon: () -> AnyShimView) {}
}

public struct Divider: View {
    public typealias Body = AnyShimView
    public init() {}
}

public struct Spacer: View {
    public typealias Body = AnyShimView
    public init(minLength: CGFloat? = nil) {}
}

// MARK: - Shapes

public protocol Shape: View {}

public extension Shape {
    func fill<S: ShapeStyle>(_ style: S) -> AnyShimView { AnyShimView() }
    func fill() -> AnyShimView { AnyShimView() }
    func stroke<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> AnyShimView { AnyShimView() }
    func strokeBorder<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> AnyShimView { AnyShimView() }
}

public struct Rectangle: Shape {
    public typealias Body = AnyShimView
    public init() {}
}

public struct Circle: Shape {
    public typealias Body = AnyShimView
    public init() {}
}

public struct Capsule: Shape {
    public typealias Body = AnyShimView
    public init(style: RoundedCornerStyle = .circular) {}
}

public struct RoundedRectangle: Shape {
    public typealias Body = AnyShimView
    public init(cornerRadius: CGFloat, style: RoundedCornerStyle = .circular) {}
}

// MARK: - Layout containers

public struct VStack: View {
    public typealias Body = AnyShimView
    public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> AnyShimView) {}
}

public struct HStack: View {
    public typealias Body = AnyShimView
    public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> AnyShimView) {}
}

public struct ZStack: View {
    public typealias Body = AnyShimView
    public init(alignment: Alignment = .center, @ViewBuilder content: () -> AnyShimView) {}
}

public struct LazyVStack: View {
    public typealias Body = AnyShimView
    public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> AnyShimView) {}
}

public struct LazyHStack: View {
    public typealias Body = AnyShimView
    public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> AnyShimView) {}
}

public struct GridItem: Sendable {
    public enum Size: Sendable {
        case fixed(CGFloat)
        case flexible(minimum: CGFloat, maximum: CGFloat)
        case adaptive(minimum: CGFloat, maximum: CGFloat)
        public static func flexible() -> Size { .flexible(minimum: 10, maximum: .infinity) }
        public static func adaptive(minimum: CGFloat) -> Size { .adaptive(minimum: minimum, maximum: .infinity) }
    }
    public init(_ size: Size = .flexible(), spacing: CGFloat? = nil, alignment: Alignment? = nil) {}
}

public struct LazyVGrid: View {
    public typealias Body = AnyShimView
    public init(columns: [GridItem], alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> AnyShimView) {}
}

public struct GeometryReader: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: @escaping (GeometryProxy) -> AnyShimView) {}
}

public struct ScrollView: View {
    public typealias Body = AnyShimView
    public init(_ axes: Axis.Set = .vertical, showsIndicators: Bool = true, @ViewBuilder content: () -> AnyShimView) {}
}

// MARK: - Navigation / tabs

public struct TabView: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: () -> AnyShimView) {}
    public init<S: Hashable>(selection: Binding<S>?, @ViewBuilder content: () -> AnyShimView) {}
}

public struct NavigationStack: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: () -> AnyShimView) {}
}

public struct NavigationLink: View {
    public typealias Body = AnyShimView
    public init<Destination: View>(destination: Destination, @ViewBuilder label: () -> AnyShimView) {}
    public init<Destination: View>(_ title: String, destination: Destination) {}
}

// MARK: - Lists / sections / iteration

public struct Section: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: () -> AnyShimView) {}
    public init(_ title: String, @ViewBuilder content: () -> AnyShimView) {}
    public init(header: () -> AnyShimView, @ViewBuilder content: () -> AnyShimView) {}
}

public struct List: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: () -> AnyShimView) {}
    public init<Data: RandomAccessCollection>(
        _ data: Data,
        @ViewBuilder rowContent: (Data.Element) -> AnyShimView
    ) where Data.Element: Identifiable {}
}

public struct ForEach: View {
    public typealias Body = AnyShimView
    public init<Data: RandomAccessCollection>(
        _ data: Data,
        @ViewBuilder content: (Data.Element) -> AnyShimView
    ) where Data.Element: Identifiable {}
    public init<Data: RandomAccessCollection, ID: Hashable>(
        _ data: Data,
        id: KeyPath<Data.Element, ID>,
        @ViewBuilder content: (Data.Element) -> AnyShimView
    ) {}
    public init<Data: RandomAccessCollection>(
        _ data: Binding<Data>,
        @ViewBuilder content: (Binding<Data.Element>) -> AnyShimView
    ) where Data.Element: Identifiable {}
}

// MARK: - Controls

public struct Button: View {
    public typealias Body = AnyShimView
    public init(action: @escaping () -> Void, @ViewBuilder label: () -> AnyShimView) {}
    public init(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) {}
    public init(role: ButtonRole?, action: @escaping () -> Void, @ViewBuilder label: () -> AnyShimView) {}
}

// MARK: - Custom button styles (configuration-driven)

public struct ButtonStyleConfiguration {
    public struct Label: View {
        public typealias Body = AnyShimView
        public init() {}
    }
    public let label: Label
    public let isPressed: Bool
    public let role: ButtonRole?
    public init(label: Label, isPressed: Bool = false, role: ButtonRole? = nil) {
        self.label = label
        self.isPressed = isPressed
        self.role = role
    }
}

@MainActor public protocol ButtonStyle {
    associatedtype Body: View
    typealias Configuration = ButtonStyleConfiguration
    @ViewBuilder @MainActor func makeBody(configuration: Configuration) -> Body
}

// MARK: - Progress indicators

public struct ProgressView: View {
    public typealias Body = AnyShimView
    public init() {}
    public init(_ title: String) {}
    public init(value: Double) {}
    public init(value: Double, total: Double) {}
    public init<Label: View>(@ViewBuilder label: () -> Label) {}
}

public struct Toggle: View {
    public typealias Body = AnyShimView
    public init(_ title: String, isOn: Binding<Bool>) {}
    public init(isOn: Binding<Bool>, @ViewBuilder label: () -> AnyShimView) {}
}

public struct Picker: View {
    public typealias Body = AnyShimView
    public init<SelectionValue: Hashable>(
        _ title: String,
        selection: Binding<SelectionValue>,
        @ViewBuilder content: () -> AnyShimView
    ) {}
}

public struct DatePicker: View {
    public typealias Body = AnyShimView
    public init(
        _ title: String,
        selection: Binding<Date>,
        in range: PartialRangeFrom<Date>,
        displayedComponents: DatePickerComponents
    ) {}
    public init(
        _ title: String,
        selection: Binding<Date>,
        displayedComponents: DatePickerComponents
    ) {}
}

public struct Stepper: View {
    public typealias Body = AnyShimView
    public init(_ title: String, value: Binding<Int>, in bounds: ClosedRange<Int>, step: Int = 1) {}
}

public struct TextField: View {
    public typealias Body = AnyShimView
    public init(_ titleKey: String, text: Binding<String>) {}
}

public struct SecureField: View {
    public typealias Body = AnyShimView
    public init(_ titleKey: String, text: Binding<String>) {}
}

public struct Group: View {
    public typealias Body = AnyShimView
    public init(@ViewBuilder content: () -> AnyShimView) {}
}

public struct ContentUnavailableView: View {
    public typealias Body = AnyShimView
    public init(
        @ViewBuilder label: () -> AnyShimView,
        @ViewBuilder description: () -> AnyShimView
    ) {}
    public init(
        @ViewBuilder label: () -> AnyShimView
    ) {}
}
