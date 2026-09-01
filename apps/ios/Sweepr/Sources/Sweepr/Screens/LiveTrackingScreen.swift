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

// Live cleaner tracking — a map-forward view built on the SKIP-safe `MapPreview`
// (MapKit → maps-compose on Android). Plots the home and the cleaner's last-known
// position with a route line between them, and hands off to the system maps app
// via `SweeprMaps.openInMaps` for external turn-by-turn — there is intentionally
// NO embedded turn-by-turn (matches the web + Mapbox ToS). Polls the booking
// while it stays trackable (generous polling bucket, per API conventions).
public struct LiveTrackingScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.openURL) private var openURL
    @State private var booking: Booking

    public init(booking: Booking) {
        _booking = State(initialValue: booking)
    }

    private var homeCoordinate: CLLocationCoordinate2D? {
        guard let a = booking.address, let lat = a.latitude, let lon = a.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    private var cleanerCoordinate: CLLocationCoordinate2D? {
        guard let c = booking.cleaner, let lat = c.latitude, let lon = c.longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    private var markers: [MapMarker] {
        var out: [MapMarker] = []
        if let home = homeCoordinate {
            out.append(MapMarker(id: "home", coordinate: home, systemIcon: "house.fill",
                                 tint: SweeprColor.charcoal, title: "Home"))
        }
        if let cleaner = cleanerCoordinate {
            out.append(MapMarker(id: "cleaner", coordinate: cleaner, systemIcon: "car.fill",
                                 tint: SweeprColor.brand, title: "Cleaner"))
        }
        return out
    }

    private var route: [CLLocationCoordinate2D]? {
        guard let cleaner = cleanerCoordinate, let home = homeCoordinate else { return nil }
        return [cleaner, home]
    }

    public var body: some View {
        ZStack(alignment: .bottom) {
            MapPreview(markers: markers, route: route, height: nil, cornerRadius: 0)
                .ignoresSafeArea(edges: .top)
                .accessibilityHidden(true)
            statusBar
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .task { await pollLoop() }
    }

    private var statusBar: some View {
        SweeprCard(elevation: .high) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(spacing: SweeprSpacing.md) {
                    ZStack {
                        Circle().fill(SweeprColor.seafoam100).frame(width: 44, height: 44)
                        Image(systemName: "car.fill").foregroundColor(SweeprColor.seafoam700)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(booking.status.displayLabel).font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.textPrimary)
                        if let cleaner = booking.cleaner {
                            Text(statusDetail(cleaner))
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        }
                    }
                    Spacer(minLength: 0)
                    SweeprBadge(status: booking.status)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)

                HStack(spacing: SweeprSpacing.md) {
                    if let home = homeCoordinate {
                        actionPill("Open in Maps", icon: "map.fill") {
                            SweeprMaps.openInMaps(latitude: home.latitude, longitude: home.longitude,
                                                  label: booking.address?.street)
                        }
                    }
                    if booking.cleaner != nil {
                        actionPill("Message", icon: "message.fill", tint: SweeprColor.graphite700) {
                            env.toast.show("Messaging opens once your cleaner checks in", kind: .info)
                        }
                    }
                }
            }
        }
        .padding(SweeprSpacing.md)
    }

    private func statusDetail(_ cleaner: Cleaner) -> String {
        switch booking.status {
        case .cleaner_on_the_way: return "\(cleaner.displayName) is on the way"
        case .arrived: return "\(cleaner.displayName) has arrived"
        case .in_progress: return "\(cleaner.displayName) is cleaning now"
        default: return cleaner.displayName
        }
    }

    private func actionPill(_ title: String, icon: String, tint: Color = SweeprColor.brand, action: @escaping () -> Void) -> some View {
        Button(action: {
            SweeprHaptics.impact(.light)
            action()
        }) {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: icon)
                Text(title).font(SweeprFont.caption().weight(.semibold))
            }
            .foregroundColor(tint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(tint.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
        }
        .buttonStyle(SweeprPressableButtonStyle())
        .accessibilityLabel(title)
    }

    // Polls the booking detail while trackable. The read endpoint sits in the
    // generous polling rate-limit bucket (per API conventions).
    private func pollLoop() async {
        while booking.status.isTrackable {
            do {
                let updated = try await env.api.booking(id: booking.id)
                withAnimation(SweeprMotion.smooth) { booking = updated }
            } catch { break }
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10s
        }
    }
}
