//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
// SwiftUI compile-verification shim — view modifiers. Every modifier preserves
// the real SwiftUI signature and collapses to `AnyShimView`, so chaining and
// generic constraints type-check exactly as on-device. See SwiftUICore.swift.

import Foundation

@MainActor
public extension View {
    // Text / appearance
    func font(_ font: Font?) -> AnyShimView { AnyShimView() }
    func foregroundColor(_ color: Color?) -> AnyShimView { AnyShimView() }
    func foregroundStyle<S: ShapeStyle>(_ style: S) -> AnyShimView { AnyShimView() }
    func tint(_ tint: Color?) -> AnyShimView { AnyShimView() }
    func opacity(_ opacity: Double) -> AnyShimView { AnyShimView() }
    func multilineTextAlignment(_ alignment: TextAlignment) -> AnyShimView { AnyShimView() }
    func lineLimit(_ number: Int?) -> AnyShimView { AnyShimView() }
    func strikethrough(_ isActive: Bool = true) -> AnyShimView { AnyShimView() }

    // Layout
    func padding(_ length: CGFloat) -> AnyShimView { AnyShimView() }
    func padding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> AnyShimView { AnyShimView() }
    func frame(width: CGFloat? = nil, height: CGFloat? = nil, alignment: Alignment = .center) -> AnyShimView { AnyShimView() }
    func frame(
        minWidth: CGFloat? = nil, idealWidth: CGFloat? = nil, maxWidth: CGFloat? = nil,
        minHeight: CGFloat? = nil, idealHeight: CGFloat? = nil, maxHeight: CGFloat? = nil,
        alignment: Alignment = .center
    ) -> AnyShimView { AnyShimView() }
    func fixedSize() -> AnyShimView { AnyShimView() }
    func fixedSize(horizontal: Bool, vertical: Bool) -> AnyShimView { AnyShimView() }

    // Background / overlay / clipping
    func background<V: View>(_ content: V) -> AnyShimView { AnyShimView() }
    func background<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> AnyShimView { AnyShimView() }
    func overlay<V: View>(_ content: V) -> AnyShimView { AnyShimView() }
    func overlay<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> AnyShimView { AnyShimView() }
    func clipShape<S: Shape>(_ shape: S) -> AnyShimView { AnyShimView() }
    func contentShape<S: Shape>(_ shape: S) -> AnyShimView { AnyShimView() }
    func cornerRadius(_ radius: CGFloat) -> AnyShimView { AnyShimView() }
    func shadow(color: Color = .black, radius: CGFloat, x: CGFloat = 0, y: CGFloat = 0) -> AnyShimView { AnyShimView() }

    // Animation / transition
    func animation<V: Equatable>(_ animation: Animation?, value: V) -> AnyShimView { AnyShimView() }
    func transition(_ transition: AnyTransition) -> AnyShimView { AnyShimView() }
    func scaleEffect(_ scale: CGFloat, anchor: UnitPoint = .center) -> AnyShimView { AnyShimView() }
    func scaleEffect(x: CGFloat = 1, y: CGFloat = 1, anchor: UnitPoint = .center) -> AnyShimView { AnyShimView() }
    func rotationEffect(_ angle: Angle, anchor: UnitPoint = .center) -> AnyShimView { AnyShimView() }

    // Text input traits (real SwiftUI takes UIKit's UIKeyboardType /
    // UITextContentType on iOS; the faithful shim types are declared below —
    // app code only ever names the contextual members, never the types).
    func keyboardType(_ type: UIKeyboardType) -> AnyShimView { AnyShimView() }
    func textContentType(_ textContentType: UITextContentType?) -> AnyShimView { AnyShimView() }
    func textInputAutocapitalization(_ autocapitalization: TextInputAutocapitalization?) -> AnyShimView { AnyShimView() }
    func autocorrectionDisabled(_ disable: Bool = true) -> AnyShimView { AnyShimView() }
    func submitLabel(_ submitLabel: SubmitLabel) -> AnyShimView { AnyShimView() }
    func onSubmit(_ action: @escaping () -> Void) -> AnyShimView { AnyShimView() }

    // Safe area
    func ignoresSafeArea(edges: Edge.Set = .all) -> AnyShimView { AnyShimView() }

    // Gestures / lifecycle
    func onTapGesture(count: Int = 1, perform action: @escaping () -> Void) -> AnyShimView { AnyShimView() }
    func onLongPressGesture(
        minimumDuration: Double = 0.5,
        maximumDistance: CGFloat = 10,
        perform action: @escaping @MainActor () -> Void,
        onPressingChanged: @escaping @MainActor (Bool) -> Void = { _ in }
    ) -> AnyShimView { AnyShimView() }
    func onAppear(perform action: (() -> Void)? = nil) -> AnyShimView { AnyShimView() }
    func onDisappear(perform action: (() -> Void)? = nil) -> AnyShimView { AnyShimView() }
    func onChange<V: Equatable>(of value: V, _ action: @escaping (V, V) -> Void) -> AnyShimView { AnyShimView() }
    func task(priority: TaskPriority = .userInitiated, _ action: @escaping () async -> Void) -> AnyShimView { AnyShimView() }
    func refreshable(action: @escaping () async -> Void) -> AnyShimView { AnyShimView() }

    // Interaction state
    func disabled(_ disabled: Bool) -> AnyShimView { AnyShimView() }
    func allowsHitTesting(_ enabled: Bool) -> AnyShimView { AnyShimView() }

    // Identity / tags / badges
    func tag<V: Hashable>(_ tag: V) -> AnyShimView { AnyShimView() }
    func id<ID: Hashable>(_ id: ID) -> AnyShimView { AnyShimView() }
    func badge(_ label: String?) -> AnyShimView { AnyShimView() }

    // Styles
    func buttonStyle(_ style: _ButtonStyle) -> AnyShimView { AnyShimView() }
    func buttonStyle<S: ButtonStyle>(_ style: S) -> AnyShimView { AnyShimView() }
    func progressViewStyle(_ style: _ProgressViewStyle) -> AnyShimView { AnyShimView() }
    func listStyle(_ style: _ListStyle) -> AnyShimView { AnyShimView() }
    func pickerStyle(_ style: _PickerStyle) -> AnyShimView { AnyShimView() }
    func datePickerStyle(_ style: _DatePickerStyle) -> AnyShimView { AnyShimView() }
    func scrollIndicators(_ visibility: ScrollIndicatorVisibility) -> AnyShimView { AnyShimView() }

    // Navigation
    func navigationTitle(_ title: String) -> AnyShimView { AnyShimView() }
    func navigationBarTitleDisplayMode(_ mode: NavigationBarTitleDisplayMode) -> AnyShimView { AnyShimView() }
    func navigationDestination<V: View>(isPresented: Binding<Bool>, @ViewBuilder destination: () -> V) -> AnyShimView { AnyShimView() }

    // Tabs
    func tabItem(@ViewBuilder _ label: () -> AnyShimView) -> AnyShimView { AnyShimView() }

    // Lists
    func listRowBackground<V: View>(_ view: V?) -> AnyShimView { AnyShimView() }
    func listRowSeparator(_ visibility: Visibility) -> AnyShimView { AnyShimView() }
    func swipeActions<V: View>(edge: HorizontalEdge = .trailing, allowsFullSwipe: Bool = true, @ViewBuilder content: () -> V) -> AnyShimView { AnyShimView() }

    // Sheets
    func sheet<Content: View>(
        isPresented: Binding<Bool>,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) -> AnyShimView { AnyShimView() }

    // Dialogs
    func confirmationDialog<A: View>(
        _ title: String,
        isPresented: Binding<Bool>,
        titleVisibility: Visibility = .automatic,
        @ViewBuilder actions: () -> A
    ) -> AnyShimView { AnyShimView() }
    func confirmationDialog<A: View, M: View>(
        _ title: String,
        isPresented: Binding<Bool>,
        titleVisibility: Visibility = .automatic,
        @ViewBuilder actions: () -> A,
        @ViewBuilder message: () -> M
    ) -> AnyShimView { AnyShimView() }

    // Environment injection
    func environmentObject<T: AnyObject>(_ object: T) -> AnyShimView { AnyShimView() }

    // Modifiers
    func modifier<M: ViewModifier>(_ modifier: M) -> AnyShimView { AnyShimView() }
}

// MARK: - Text-input trait types (faithful minimal declarations)
//
// On iOS these come from UIKit through SwiftUI's modifier signatures; app code
// only names the dot-members. These shims declare exactly the members Sweepr
// uses so contextual lookup type-checks identically.

public enum UIKeyboardType: Sendable {
    case `default`
    case emailAddress
    case numberPad
    case phonePad
    case decimalPad
    case URL
}

public struct UITextContentType: Equatable, Sendable {
    private let raw: String
    private init(_ raw: String) { self.raw = raw }
    public static let emailAddress = UITextContentType("emailAddress")
    public static let password = UITextContentType("password")
    public static let newPassword = UITextContentType("newPassword")
    public static let oneTimeCode = UITextContentType("oneTimeCode")
    public static let givenName = UITextContentType("givenName")
    public static let familyName = UITextContentType("familyName")
    public static let telephoneNumber = UITextContentType("telephoneNumber")
    public static let streetAddressLine1 = UITextContentType("streetAddressLine1")
    public static let addressCity = UITextContentType("addressCity")
    public static let postalCode = UITextContentType("postalCode")
}

public struct TextInputAutocapitalization: Sendable {
    public static let never = TextInputAutocapitalization()
    public static let words = TextInputAutocapitalization()
    public static let sentences = TextInputAutocapitalization()
    public static let characters = TextInputAutocapitalization()
}

public struct SubmitLabel: Sendable {
    public static let done = SubmitLabel()
    public static let go = SubmitLabel()
    public static let next = SubmitLabel()
    public static let `continue` = SubmitLabel()
    public static let search = SubmitLabel()
    public static let send = SubmitLabel()
}
