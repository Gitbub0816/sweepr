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
#if os(iOS)
import UIKit
#endif

// Route/map — the day's jobs plotted for navigation, with an ETA card list
// below. SKIP maps MapKit to maps-compose on Android.
public struct RouteScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [Job] = []
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 39.7392, longitude: -104.9903),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    )

    public init() {}

    /// Ordered stops with a sequence number and a stub ETA. Real ETAs should
    /// come from a routing call (MapKit directions / backend) once a device
    /// location is available; this is a deterministic placeholder so the ETA
    /// cards render meaningfully offline.
    private var routeStops: [RouteStop] {
        jobs.enumerated().compactMap { index, job in
            guard let a = job.booking.address, a.latitude != nil, a.longitude != nil else { return nil }
            return RouteStop(id: job.id, job: job, etaMinutes: 8 + index * 12, sequence: index + 1)
        }
    }

    private var stops: [Stop] {
        routeStops.compactMap { stop in
            guard let a = stop.job.booking.address, let lat = a.latitude, let lon = a.longitude
            else { return nil }
            return Stop(id: stop.job.id, sequence: stop.sequence, coordinate: .init(latitude: lat, longitude: lon))
        }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    // NOTE: this is a stub — the SwiftUI `Map(coordinateRegion:)`
                    // API used here doesn't expose a polyline overlay without
                    // dropping to `MKMapView` (UIViewRepresentable), which risks
                    // falling outside the SKIP-supported subset. A connecting
                    // route line between stops is the next increment once
                    // `skip verify` confirms overlay support on Android.
                    Map(coordinateRegion: $region, annotationItems: stops) { stop in
                        MapAnnotation(coordinate: stop.coordinate) {
                            ZStack {
                                Circle().fill(SweeprColor.brand).frame(width: 28, height: 28)
                                Text("\(stop.sequence)").font(SweeprFont.caption().weight(.bold))
                                    .foregroundColor(.white)
                            }
                        }
                    }
                    .frame(height: 280)
                }
                .ignoresSafeArea(edges: .top)

                if routeStops.isEmpty {
                    ContentUnavailableView {
                        Label("No stops today", systemImage: "map")
                    } description: {
                        Text("Accepted jobs with a scheduled address will show up here.")
                    }
                } else {
                    List(routeStops) { stop in
                        etaRow(stop)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Route")
        }
        .task { jobs = (try? await env.api.cleanerJobs()) ?? SweeprMock.jobs }
    }

    private func etaRow(_ stop: RouteStop) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            ZStack {
                Circle().fill(SweeprColor.seafoam100).frame(width: 32, height: 32)
                Text("\(stop.sequence)").font(SweeprFont.caption().weight(.bold))
                    .foregroundColor(SweeprColor.brand)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.job.booking.packageDisplayName).font(SweeprFont.body().weight(.semibold))
                    .foregroundColor(SweeprColor.textPrimary)
                Text(stop.job.maskedAreaLabel).font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("ETA \(stop.etaMinutes)m").font(SweeprFont.caption().weight(.semibold))
                    .foregroundColor(SweeprColor.brand)
                Button {
                    openInAppleMaps(stop.job)
                } label: {
                    Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                }
            }
        }
        .padding(.vertical, SweeprSpacing.xs)
    }

    private func openInAppleMaps(_ job: Job) {
        guard let addr = job.booking.address else { return }
        let query = addr.oneLine.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "https://maps.apple.com/?daddr=\(query)") else { return }
        #if os(iOS)
        UIApplication.shared.open(url)
        #endif
    }
}

private struct Stop: Identifiable {
    let id: String
    let sequence: Int
    let coordinate: CLLocationCoordinate2D
}
