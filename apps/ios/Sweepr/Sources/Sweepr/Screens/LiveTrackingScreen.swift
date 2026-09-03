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
// (MapKit → maps-compose on Android). The cleaner's position comes from the
// booking row's cleaner_lat/cleaner_lng (updated by the cleaner app's location
// pings); the home pin resolves through the customer's own saved address
// (bookings carry address_id, and /customer-profile/addresses has lat/lng).
// External turn-by-turn hands off to the system maps app — there is
// intentionally NO embedded navigation (matches the web + Mapbox ToS).
public struct LiveTrackingScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var booking: Booking
    @State private var cleanerName: String?
    @State private var homeCoordinate: CLLocationCoordinate2D?

    public init(booking: Booking) {
        _booking = State(initialValue: booking)
    }

    private var cleanerCoordinate: CLLocationCoordinate2D? {
        guard let lat = booking.cleanerLat, let lon = booking.cleanerLng else { return nil }
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
            if markers.isEmpty {
                waitingState
            } else {
                MapPreview(markers: markers, route: route, height: nil, cornerRadius: 0)
                    .ignoresSafeArea(edges: .top)
                    .accessibilityHidden(true)
            }
            statusBar
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Tracking")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await resolveHome()
            await resolveCleanerName()
            await pollLoop()
        }
    }

    private var waitingState: some View {
        VStack(spacing: SweeprSpacing.md) {
            Spacer()
            ProgressView()
            Text("Waiting for your cleaner's live position…")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
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
                        Text(statusDetail)
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                    SweeprBadge(status: booking.status)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)

                if let home = homeCoordinate {
                    actionPill("Open in Maps", icon: "map.fill") {
                        SweeprMaps.openInMaps(latitude: home.latitude, longitude: home.longitude,
                                              label: "Home")
                    }
                }
            }
        }
        .padding(SweeprSpacing.md)
    }

    private var statusDetail: String {
        let name = cleanerName ?? "Your cleaner"
        switch booking.status {
        case .cleaner_on_the_way: return "\(name) is on the way"
        case .arrived: return "\(name) has arrived"
        case .in_progress: return "\(name) is cleaning now"
        default: return name
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

    /// The home pin: match the booking's address_id against the customer's own
    /// saved addresses (which carry lat/lng).
    private func resolveHome() async {
        guard let addressId = booking.addressId else { return }
        guard let all = try? await env.api.addresses() else { return }
        if let match = all.first(where: { $0.id == addressId }),
           let lat = match.lat, let lng = match.lng {
            homeCoordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
    }

    private func resolveCleanerName() async {
        if let detail = try? await env.api.bookingDetail(id: booking.id) {
            cleanerName = detail.cleaner?.displayName
        }
    }

    // Polls the booking while trackable — cleaner_lat/lng refresh with each
    // location ping the cleaner app sends.
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
