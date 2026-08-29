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
import MapKit
#if os(iOS)
import UIKit
#endif

// SKIP-safe maps. A reusable `MapPreview` over the modern `Map(position:)` +
// MapContentBuilder surface (SKIP maps MapKit → maps-compose on Android), plus
// an `openInMaps` handoff that launches the system maps app for external
// turn-by-turn. There is intentionally NO embedded turn-by-turn navigation —
// this matches the web (and Mapbox ToS) and keeps the app inside the SwiftUI
// subset SkipUI transpiles.

// MARK: - Marker model

/// One point on a `MapPreview`. `title` labels it for accessibility; the pin is
/// a tinted circle with an SF Symbol so both platforms render it identically.
public struct MapMarker: Identifiable, Sendable {
    public let id: String
    public let coordinate: CLLocationCoordinate2D
    public let systemIcon: String
    public let tint: Color
    public let title: String

    public init(
        id: String = UUID().uuidString,
        coordinate: CLLocationCoordinate2D,
        systemIcon: String = "mappin.circle.fill",
        tint: Color = SweeprColor.brand,
        title: String = ""
    ) {
        self.id = id
        self.coordinate = coordinate
        self.systemIcon = systemIcon
        self.tint = tint
        self.title = title
    }
}

// MARK: - MapPreview

/// A read-only map card showing one or more annotated coordinates, with an
/// optional route polyline threaded through supplied coordinates. Consumed by
/// the customer `LiveTrackingScreen` (home + cleaner pins) and the cleaner
/// `RouteScreen` (numbered stops + connecting line).
public struct MapPreview: View {
    private let markers: [MapMarker]
    private let route: [CLLocationCoordinate2D]?
    private let height: CGFloat?
    private let cornerRadius: CGFloat
    @State private var cameraPosition: MapCameraPosition

    /// Full initializer.
    /// - Parameters:
    ///   - markers: annotated points to plot.
    ///   - route: optional ordered coordinates for a connecting polyline.
    ///   - spanDegrees: latitude/longitude delta for the initial camera.
    ///   - height: fixed map height, or `nil` to fill the parent.
    ///   - cornerRadius: clip radius (0 for an edge-to-edge map).
    public init(
        markers: [MapMarker],
        route: [CLLocationCoordinate2D]? = nil,
        spanDegrees: Double = 0.02,
        height: CGFloat? = 220,
        cornerRadius: CGFloat = SweeprRadius.card
    ) {
        self.markers = markers
        self.route = route
        self.height = height
        self.cornerRadius = cornerRadius
        let region = MapPreview.region(for: markers, spanDegrees: spanDegrees)
        _cameraPosition = State(initialValue: .region(region))
    }

    /// Convenience for a single coordinate.
    public init(
        coordinate: CLLocationCoordinate2D,
        systemIcon: String = "mappin.circle.fill",
        tint: Color = SweeprColor.brand,
        title: String = "",
        spanDegrees: Double = 0.02,
        height: CGFloat? = 220,
        cornerRadius: CGFloat = SweeprRadius.card
    ) {
        self.init(
            markers: [MapMarker(coordinate: coordinate, systemIcon: systemIcon, tint: tint, title: title)],
            route: nil,
            spanDegrees: spanDegrees,
            height: height,
            cornerRadius: cornerRadius
        )
    }

    public var body: some View {
        Map(position: $cameraPosition) {
            if let route, route.count >= 2 {
                MapPolyline(coordinates: route)
                    .stroke(SweeprColor.brand, lineWidth: 4)
            }
            for marker in markers {
                Annotation(marker.title, coordinate: marker.coordinate) {
                    Image(systemName: marker.systemIcon)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(marker.tint)
                        .clipShape(Circle())
                        .sweeprElevation(.low)
                }
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    /// Centres the camera on the mean of the supplied markers (falls back to a
    /// sensible default when empty).
    private static func region(for markers: [MapMarker], spanDegrees: Double) -> MKCoordinateRegion {
        guard !markers.isEmpty else {
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 39.7392, longitude: -104.9903),
                span: MKCoordinateSpan(latitudeDelta: spanDegrees, longitudeDelta: spanDegrees)
            )
        }
        let lat = markers.reduce(0.0) { $0 + $1.coordinate.latitude } / Double(markers.count)
        let lon = markers.reduce(0.0) { $0 + $1.coordinate.longitude } / Double(markers.count)
        // Widen the span to fit spread-out markers.
        let latSpread = (markers.map { $0.coordinate.latitude }.max() ?? lat)
            - (markers.map { $0.coordinate.latitude }.min() ?? lat)
        let lonSpread = (markers.map { $0.coordinate.longitude }.max() ?? lon)
            - (markers.map { $0.coordinate.longitude }.min() ?? lon)
        let span = Swift.max(spanDegrees, Swift.max(latSpread, lonSpread) * 1.4)
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        )
    }
}

// MARK: - System maps handoff

public enum SweeprMaps {
    /// Builds the Apple Maps directions URL for a destination coordinate — the
    /// external turn-by-turn handoff target. On Android, SKIP callers should
    /// instead hand off via a `geo:` intent; this URL form is the iOS path.
    public static func directionsURL(latitude: Double, longitude: Double, label: String? = nil) -> URL? {
        let coord = "\(latitude),\(longitude)"
        var string = "https://maps.apple.com/?daddr=\(coord)&dirflg=d"
        if let label, let encoded = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            string += "&q=\(encoded)"
        }
        return URL(string: string)
    }

    /// Opens the system maps app with directions to the coordinate. No-ops off
    /// iOS (Android/SKIP callers use a platform intent).
    @MainActor
    public static func openInMaps(latitude: Double, longitude: Double, label: String? = nil) {
        guard let url = directionsURL(latitude: latitude, longitude: longitude, label: label) else { return }
        #if os(iOS)
        UIApplication.shared.open(url)
        #endif
    }
}

public extension MapPreview {
    /// Convenience passthrough so screens can call `MapPreview.openInMaps(...)`.
    @MainActor
    static func openInMaps(latitude: Double, longitude: Double, label: String? = nil) {
        SweeprMaps.openInMaps(latitude: latitude, longitude: longitude, label: label)
    }
}
