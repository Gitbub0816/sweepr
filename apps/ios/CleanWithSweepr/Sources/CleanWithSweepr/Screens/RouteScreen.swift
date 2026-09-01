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

// Route/map — the day's jobs plotted with a connecting polyline, plus an ETA
// card list and a prominent "Start navigation" handoff to the system maps app.
// There is NO embedded turn-by-turn (the locked architecture decision); routing
// is handed to Apple/Google Maps via `SweeprMaps.openInMaps`. SKIP maps MapKit
// to maps-compose on Android.
public struct RouteScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [Job] = []
    @State private var isLoading = true
    @State private var selectedStopId: String?

    public init() {}

    /// Ordered stops with a sequence number and a stub ETA. Real ETAs should
    /// come from a routing call once a device location is available; this is a
    /// deterministic placeholder so the ETA cards render meaningfully offline.
    private var routeStops: [RouteStop] {
        jobs
            .filter { $0.booking.status.isActive && !$0.isOffer }
            .enumerated()
            .compactMap { index, job in
                guard let a = job.booking.address, a.latitude != nil, a.longitude != nil else { return nil }
                return RouteStop(id: job.id, job: job, etaMinutes: 8 + index * 12, sequence: index + 1)
            }
    }

    private var markers: [MapMarker] {
        routeStops.compactMap { stop in
            guard let a = stop.job.booking.address, let lat = a.latitude, let lon = a.longitude else { return nil }
            let isSelected = selectedStopId == stop.id
            return MapMarker(
                id: stop.id,
                coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                systemIcon: "\(stop.sequence).circle.fill",
                tint: isSelected ? SweeprColor.seafoam600 : SweeprColor.brand,
                title: "Stop \(stop.sequence)"
            )
        }
    }

    private var routeLine: [CLLocationCoordinate2D] {
        routeStops.compactMap { stop in
            guard let a = stop.job.booking.address, let lat = a.latitude, let lon = a.longitude else { return nil }
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
    }

    private var nextStop: RouteStop? { routeStops.first }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    if isLoading {
                        SkeletonBlock(height: 240)
                        SkeletonBlock(height: 96)
                    } else if routeStops.isEmpty {
                        emptyState
                    } else {
                        mapCard
                        if let next = nextStop {
                            nextStopCard(next)
                        }
                        stopsList
                    }
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Route")
            .refreshable { await load() }
        }
        .task { await load() }
    }

    // MARK: - Map

    private var mapCard: some View {
        VStack(spacing: 0) {
            MapPreview(
                markers: markers,
                route: routeLine.count >= 2 ? routeLine : nil,
                height: 260,
                cornerRadius: SweeprRadius.card
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous)
                .stroke(SweeprColor.separator, lineWidth: 1)
        )
        .sweeprElevation(.medium)
    }

    private func nextStopCard(_ stop: RouteStop) -> some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("NEXT STOP")
                            .font(SweeprFont.footnote())
                            .foregroundColor(SweeprColor.textSecondary)
                        Text(stop.job.booking.packageDisplayName)
                            .font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(stop.etaMinutes) min")
                            .font(SweeprFont.subheading())
                            .foregroundColor(SweeprColor.brand)
                        Text("ETA")
                            .font(SweeprFont.footnote())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                }
                Label(stop.job.maskedAreaLabel, systemImage: "mappin.and.ellipse")
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Start navigation", systemIcon: "location.north.line.fill") {
                    navigate(to: stop)
                }
            }
        }
    }

    private var stopsList: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("All stops")
            VStack(spacing: 0) {
                ForEach(Array(routeStops.enumerated()), id: \.element.id) { idx, stop in
                    Button {
                        SweeprHaptics.selection()
                        selectedStopId = stop.id
                    } label: {
                        etaRow(stop)
                    }
                    .buttonStyle(SweeprPressableButtonStyle())
                    if idx < routeStops.count - 1 {
                        SweeprDivider(inset: SweeprSpacing.xl)
                    }
                }
            }
            .padding(.horizontal, SweeprSpacing.md)
            .background(SweeprColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous)
                    .stroke(SweeprColor.separator, lineWidth: 1)
            )
            .sweeprElevation(.low)
        }
    }

    private func etaRow(_ stop: RouteStop) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            ZStack {
                Circle()
                    .fill(selectedStopId == stop.id ? SweeprColor.brand : SweeprColor.seafoam100)
                    .frame(width: 34, height: 34)
                Text("\(stop.sequence)")
                    .font(SweeprFont.caption().weight(.bold))
                    .foregroundColor(selectedStopId == stop.id ? .white : SweeprColor.brand)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.job.booking.packageDisplayName)
                    .font(SweeprFont.body().weight(.semibold))
                    .foregroundColor(SweeprColor.textPrimary)
                Text(stop.job.maskedAreaLabel)
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: SweeprSpacing.sm)
            Text("ETA \(stop.etaMinutes)m")
                .font(SweeprFont.caption().weight(.semibold))
                .foregroundColor(SweeprColor.brand)
            Button {
                navigate(to: stop)
            } label: {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(SweeprColor.brand)
            }
            .buttonStyle(SweeprPressableButtonStyle())
        }
        .padding(.vertical, SweeprSpacing.sm)
        .contentShape(Rectangle())
    }

    private var emptyState: some View {
        SweeprEmptyState(
            systemIcon: "map",
            title: "No stops today",
            message: "Accepted jobs with a scheduled address will appear here, mapped and ready to navigate."
        )
        .padding(.top, SweeprSpacing.xl)
    }

    // MARK: - Navigation handoff

    private func navigate(to stop: RouteStop) {
        SweeprHaptics.impact(.medium)
        guard let a = stop.job.booking.address, let lat = a.latitude, let lon = a.longitude else {
            env.toasts.show("This stop has no mappable address yet.", kind: .warning)
            return
        }
        SweeprMaps.openInMaps(latitude: lat, longitude: lon, label: stop.job.booking.packageDisplayName)
    }

    private func load() async {
        isLoading = true
        jobs = (try? await env.api.cleanerJobs()) ?? SweeprMock.jobs
        isLoading = false
    }
}
