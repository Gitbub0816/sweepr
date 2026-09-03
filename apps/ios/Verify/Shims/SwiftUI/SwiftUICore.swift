//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// ============================================================================
// SwiftUI COMPILE-VERIFICATION SHIM — NOT a runtime SwiftUI.
//
// This target is named `SwiftUI` so the Sweepr app + SweeprKit sources compile
// UNCHANGED on a Linux host that has no Apple SDK. It declares MINIMAL stub
// signatures matching the real SwiftUI APIs the app actually uses, so the Swift
// compiler type-checks every call, generic constraint, actor-isolation, and
// Sendability rule against faithful signatures — WITHOUT executing anything.
//
// It intentionally has NO rendering behaviour. `body` is never evaluated; view
// content closures are type-checked but discarded. Real SwiftUI layout/behaviour
// still needs Xcode. See apps/ios/Verify/README.md.
//
// `View` is `@MainActor` to mirror the real SwiftUI SDK (where `View` is
// `@MainActor @preconcurrency`), so the harness reproduces the same main-actor
// isolation the app relies on.
// ============================================================================

@_exported import Foundation

// MARK: - View protocol + primitive base

@MainActor public protocol View {
    associatedtype Body: View
    @ViewBuilder var body: Body { get }
}

/// The single opaque view type every `@ViewBuilder` and every modifier collapses
/// to. Faithful signatures are preserved at call sites; only the *result* type is
/// erased (the harness never renders). Primitive/leaf views declare
/// `typealias Body = AnyShimView` and inherit the default body below — so the
/// inferred `@ViewBuilder` transform on `body` is always satisfiable.
public struct AnyShimView: View {
    public typealias Body = AnyShimView
    public init() {}
}

public extension View where Body == AnyShimView {
    var body: AnyShimView { AnyShimView() }
}

public struct EmptyView: View {
    public typealias Body = AnyShimView
    public init() {}
}

// MARK: - ViewBuilder

@resultBuilder
public enum ViewBuilder {
    @MainActor public static func buildExpression<V: View>(_ v: V) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildBlock(_ parts: AnyShimView...) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildOptional(_ part: AnyShimView?) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildEither(first: AnyShimView) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildEither(second: AnyShimView) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildArray(_ parts: [AnyShimView]) -> AnyShimView { AnyShimView() }
    @MainActor public static func buildLimitedAvailability(_ part: AnyShimView) -> AnyShimView { AnyShimView() }
}

// MARK: - Property wrappers: State / Binding

@propertyWrapper
public struct State<Value> {
    private final class Box { var value: Value; init(_ v: Value) { value = v } }
    private let box: Box
    public init(wrappedValue: Value) { box = Box(wrappedValue) }
    public init(initialValue: Value) { box = Box(initialValue) }
    public var wrappedValue: Value {
        get { box.value }
        nonmutating set { box.value = newValue }
    }
    public var projectedValue: Binding<Value> {
        Binding(get: { box.value }, set: { box.value = $0 })
    }
}

@propertyWrapper
@dynamicMemberLookup
public struct Binding<Value> {
    private let getter: () -> Value
    private let setter: (Value) -> Void
    public init(get: @escaping () -> Value, set: @escaping (Value) -> Void) {
        self.getter = get
        self.setter = set
    }
    /// Enables the `{ $item in … }` closure-projection form (ForEach over a
    /// `Binding` collection), matching SwiftUI's `Binding.init(projectedValue:)`.
    public init(projectedValue: Binding<Value>) { self = projectedValue }
    public var wrappedValue: Value {
        get { getter() }
        nonmutating set { setter(newValue) }
    }
    public var projectedValue: Binding<Value> { self }
    public subscript<Subject>(dynamicMember keyPath: WritableKeyPath<Value, Subject>) -> Binding<Subject> {
        Binding<Subject>(
            get: { getter()[keyPath: keyPath] },
            set: { newValue in
                var v = getter()
                v[keyPath: keyPath] = newValue
                setter(v)
            }
        )
    }
}

// MARK: - Observable-object property wrappers

public protocol ObservableObject: AnyObject {}

@propertyWrapper
public struct Published<Value> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
}

@propertyWrapper
public struct StateObject<ObjectType: AnyObject> {
    public let wrappedValue: ObjectType
    public init(wrappedValue: @autoclosure @escaping () -> ObjectType) {
        self.wrappedValue = wrappedValue()
    }
}

@propertyWrapper
public struct EnvironmentObject<ObjectType: AnyObject> {
    public let wrappedValue: ObjectType
    public init(wrappedValue: ObjectType) { self.wrappedValue = wrappedValue }
    // In the shim there is no environment store; this initializer only exists so
    // `@EnvironmentObject var x: T` type-checks. It is never invoked (bodies are
    // not evaluated).
    public init() { fatalError("EnvironmentObject is compile-only in the shim") }

    /// Mirrors the real wrapper: `$env.someVar` yields a Binding via dynamic
    /// member lookup on the projected wrapper (used for TabView selection).
    @dynamicMemberLookup
    public struct Wrapper {
        let object: ObjectType
        public subscript<Subject>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, Subject>) -> Binding<Subject> {
            Binding(
                get: { object[keyPath: keyPath] },
                set: { object[keyPath: keyPath] = $0 }
            )
        }
    }

    public var projectedValue: Wrapper { Wrapper(object: wrappedValue) }
}

@propertyWrapper
public struct ObservedObject<ObjectType: AnyObject> {
    public var wrappedValue: ObjectType
    public init(wrappedValue: ObjectType) { self.wrappedValue = wrappedValue }
}

@propertyWrapper
@dynamicMemberLookup
public struct Bindable<Value: AnyObject> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
    public init(_ wrappedValue: Value) { self.wrappedValue = wrappedValue }
    public var projectedValue: Bindable<Value> { self }
    public subscript<Subject>(dynamicMember keyPath: ReferenceWritableKeyPath<Value, Subject>) -> Binding<Subject> {
        let object = wrappedValue
        return Binding<Subject>(
            get: { object[keyPath: keyPath] },
            set: { object[keyPath: keyPath] = $0 }
        )
    }
}

// MARK: - Environment

public struct EnvironmentValues {
    public var dismiss = DismissAction()
    public var openURL = OpenURLAction()
    public var isEnabled = true
    public var colorScheme: ColorScheme = .light
    public init() {}
}

@propertyWrapper
public struct Environment<Value> {
    private let keyPath: KeyPath<EnvironmentValues, Value>
    public init(_ keyPath: KeyPath<EnvironmentValues, Value>) { self.keyPath = keyPath }
    public var wrappedValue: Value { EnvironmentValues()[keyPath: keyPath] }
}

public struct DismissAction {
    public init() {}
    public func callAsFunction() {}
}

public struct OpenURLAction {
    public init() {}
    public func callAsFunction(_ url: URL) {}
}

// MARK: - ViewModifier

@MainActor public protocol ViewModifier {
    associatedtype Body: View
    typealias Content = _ViewModifierContent
    @ViewBuilder @MainActor func body(content: Content) -> Body
}

public struct _ViewModifierContent: View {
    public typealias Body = AnyShimView
    public init() {}
}

// MARK: - App / Scene

@MainActor public protocol App {
    associatedtype Body: Scene
    @MainActor var body: Body { get }
    init()
}

public extension App {
    static func main() {}
}

@MainActor public protocol Scene {
    associatedtype Body: Scene
    @MainActor var body: Body { get }
}

public struct AnyShimScene: Scene {
    public typealias Body = AnyShimScene
    public init() {}
}

public extension Scene where Body == AnyShimScene {
    var body: AnyShimScene { AnyShimScene() }
}

public struct WindowGroup: Scene {
    public typealias Body = AnyShimScene
    public init(@ViewBuilder content: () -> AnyShimView) {}
    public init(_ title: String, @ViewBuilder content: () -> AnyShimView) {}
}

// MARK: - Global helpers

@MainActor
@discardableResult
public func withAnimation<Result>(_ animation: Animation? = .default, _ body: () throws -> Result) rethrows -> Result {
    try body()
}

// MARK: - PreviewProvider

@MainActor public protocol PreviewProvider {
    associatedtype Previews: View
    @MainActor static var previews: Previews { get }
}
