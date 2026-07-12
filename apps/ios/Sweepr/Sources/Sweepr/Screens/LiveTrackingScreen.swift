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
import SweeprKit

// Live cleaner tracking — DoorDash-style native map. Shows the service address
// and the cleaner's last-known position, polling the booking for updates.
//
// SKIP: MapKit maps to Google maps-compose on Android (declared in skip.yml).
// Keep the Map API to the SkipUI-supported subset.
public struct LiveTrackingScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var booking: Booking
    @State private var cameraPosition: MapCameraPosition

    public init(booking: Booking) {
        _booking = State(initialValue: booking)
        let center = CLLocationCoordinate2D(
            latitude: booking.address?.latitude ?? 39.7392,
            longitude: booking.address?.longitude ?? -104.9903
        )
        _cameraPosition = State(initialValue: .region(MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
        )))
    }

    private var homeCoordinate: CLLocationCoordinate2D? {
        guard let a = booking.address, let lat = a.latitude, let lon = a.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    private var cleanerCoordinate: CLLocationCoordinate2D? {
        guard let c = booking.cleaner, let lat = c.latitude, let lon = c.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    public var body: some View {
        // Modern iOS 17+ `Map(position:)` + `MapContentBuilder` API (replaces the
        // deprecated `Map(coordinateRegion:annotationItems:)`). SKIP maps this to
        // maps-compose markers on Android (declared in skip.yml).
        Map(position: $cameraPosition) {
            if let home = homeCoordinate {
                Annotation("Home", coordinate: home) {
                    Image(systemName: "house.fill")
                        .foregroundColor(.white)
                        .padding(8)
                        .background(SweeprColor.charcoal)
                        .clipShape(Circle())
                }
            }
            if let cleaner = cleanerCoordinate {
                Annotation("Cleaner", coordinate: cleaner) {
                    Image(systemName: "car.fill")
                        .foregroundColor(.white)
                        .padding(8)
                        .background(SweeprColor.brand)
                        .clipShape(Circle())
                }
            }
        }
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .bottom) { statusBar }
        .navigationTitle("Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .task { await pollLoop() }
    }

    private var statusBar: some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    Text(booking.status.displayLabel).font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    if let cleaner = booking.cleaner {
                        Text("\(cleaner.displayName) is on the way")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                }
                Spacer()
                SweeprBadge(status: booking.status)
            }
        }
        .padding(SweeprSpacing.md)
    }

    // Polls the booking detail while trackable. The read endpoint sits in the
    // generous polling rate-limit bucket (per API conventions).
    private func pollLoop() async {
        while booking.status.isTrackable {
            do {
                let updated = try await env.api.booking(id: booking.id)
                booking = updated
            } catch { break }
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10s
        }
    }
}
