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

// Route/map — the day's jobs plotted for navigation. SKIP maps MapKit to
// maps-compose on Android.
public struct RouteScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [Job] = []
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 39.7392, longitude: -104.9903),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    )

    public init() {}

    private var stops: [Stop] {
        jobs.compactMap { job in
            guard let a = job.booking.address, let lat = a.latitude, let lon = a.longitude
            else { return nil }
            return Stop(coordinate: .init(latitude: lat, longitude: lon))
        }
    }

    public var body: some View {
        NavigationStack {
            Map(coordinateRegion: $region, annotationItems: stops) { stop in
                MapMarker(coordinate: stop.coordinate, tint: SweeprColor.brand)
            }
            .ignoresSafeArea(edges: .top)
            .navigationTitle("Route")
        }
        .task { jobs = (try? await env.api.cleanerJobs()) ?? SweeprMock.jobs }
    }
}

private struct Stop: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}
