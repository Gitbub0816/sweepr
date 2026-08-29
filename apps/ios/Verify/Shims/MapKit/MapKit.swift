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
// MapKit / CoreLocation COMPILE-VERIFICATION SHIM — NOT a runtime MapKit.
//
// Named `MapKit` so `LiveTrackingScreen` / `RouteScreen` compile UNCHANGED on a
// Linux host. Declares the modern (iOS 17+) `Map(position:)` + MapContentBuilder
// surface (Marker / Annotation) the refined app code uses. See
// apps/ios/Verify/README.md.
// ============================================================================

import Foundation
import SwiftUI

// MARK: - CoreLocation

public struct CLLocationCoordinate2D: Hashable, Sendable {
    public var latitude: Double
    public var longitude: Double
    public init() { self.latitude = 0; self.longitude = 0 }
    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

// MARK: - MapKit region types

public struct MKCoordinateSpan: Hashable, Sendable {
    public var latitudeDelta: Double
    public var longitudeDelta: Double
    public init(latitudeDelta: Double, longitudeDelta: Double) {
        self.latitudeDelta = latitudeDelta
        self.longitudeDelta = longitudeDelta
    }
}

public struct MKCoordinateRegion: Sendable {
    public var center: CLLocationCoordinate2D
    public var span: MKCoordinateSpan
    public init() {
        self.center = CLLocationCoordinate2D()
        self.span = MKCoordinateSpan(latitudeDelta: 0, longitudeDelta: 0)
    }
    public init(center: CLLocationCoordinate2D, span: MKCoordinateSpan) {
        self.center = center
        self.span = span
    }
}

// MARK: - Map camera position (modern Map API)

public struct MapCameraPosition: Equatable, Sendable {
    private let id: Int
    private init(id: Int) { self.id = id }
    public static func region(_ region: MKCoordinateRegion) -> MapCameraPosition { MapCameraPosition(id: 0) }
    public static func rect(_ rect: MKMapRect) -> MapCameraPosition { MapCameraPosition(id: 1) }
    public static let automatic = MapCameraPosition(id: 2)
    public static func == (lhs: MapCameraPosition, rhs: MapCameraPosition) -> Bool { lhs.id == rhs.id }
}

public struct MKMapRect: Sendable {
    public init() {}
}

// MARK: - MapContent + builder

@MainActor public protocol MapContent {}

public struct _AnyMapContent: MapContent {
    public init() {}
}

@resultBuilder
public enum MapContentBuilder {
    @MainActor public static func buildExpression<M: MapContent>(_ content: M) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildBlock(_ parts: _AnyMapContent...) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildOptional(_ part: _AnyMapContent?) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildEither(first: _AnyMapContent) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildEither(second: _AnyMapContent) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildArray(_ parts: [_AnyMapContent]) -> _AnyMapContent { _AnyMapContent() }
    @MainActor public static func buildLimitedAvailability(_ part: _AnyMapContent) -> _AnyMapContent { _AnyMapContent() }
}

// MARK: - Map markers / annotations

public struct Marker: MapContent {
    public init(_ title: String, coordinate: CLLocationCoordinate2D) {}
    public init(_ title: String, systemImage: String, coordinate: CLLocationCoordinate2D) {}
}

public struct Annotation: MapContent {
    public init<Content: View>(
        _ title: String,
        coordinate: CLLocationCoordinate2D,
        @ViewBuilder content: () -> Content
    ) {}
}

// A polyline overlay drawn through an ordered list of coordinates. SKIP maps
// this to a maps-compose `Polyline`.
public struct MapPolyline: MapContent {
    public init(coordinates: [CLLocationCoordinate2D]) {}
    public init(points: [MKMapPoint]) {}
}

public struct MKMapPoint: Sendable {
    public init() {}
    public init(_ coordinate: CLLocationCoordinate2D) {}
}

// MARK: - MapContent styling modifiers (chainable, mirror the real API)

public extension MapContent {
    func stroke<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _AnyMapContent { _AnyMapContent() }
    func foregroundStyle<S: ShapeStyle>(_ style: S) -> _AnyMapContent { _AnyMapContent() }
    func tint(_ color: Color) -> _AnyMapContent { _AnyMapContent() }
    func annotationTitles(_ visibility: Visibility) -> _AnyMapContent { _AnyMapContent() }
}

// MARK: - MKMapItem / launch handoff (external turn-by-turn)

public final class MKMapItem: @unchecked Sendable {
    public var name: String?
    public let placemark: MKPlacemark
    public init(placemark: MKPlacemark) { self.placemark = placemark }
    public static func openMaps(with items: [MKMapItem], launchOptions: [String: Any]? = nil) -> Bool { false }
    public func openInMaps(launchOptions: [String: Any]? = nil) -> Bool { false }
    public static let openInMapsLaunchOptionsDirectionsModeKey = "MKLaunchOptionsDirectionsModeKey"
    public static let openInMapsLaunchOptionsDirectionsModeDriving = "Driving"
    public static let openInMapsLaunchOptionsDirectionsModeWalking = "Walking"
}

public final class MKPlacemark: @unchecked Sendable {
    public let coordinate: CLLocationCoordinate2D
    public init(coordinate: CLLocationCoordinate2D) { self.coordinate = coordinate }
}

// MARK: - Map view (modern position-based API)

public struct Map: View {
    public typealias Body = AnyShimView
    public init(@MapContentBuilder content: () -> _AnyMapContent) {}
    public init(
        position: Binding<MapCameraPosition>,
        @MapContentBuilder content: () -> _AnyMapContent
    ) {}
    public init(
        initialPosition: MapCameraPosition,
        @MapContentBuilder content: () -> _AnyMapContent
    ) {}
}
