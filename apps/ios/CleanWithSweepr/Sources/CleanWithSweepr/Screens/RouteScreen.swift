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

// Today's route — the day's accepted jobs in time order. Exact addresses are
// PRIVACY-GATED: they only unlock per job via start-route, so this screen maps
// only the job you're actively working (from /jobs/bookings/:id/live) and
// shows honest arrival windows — no fabricated ETAs. Turn-by-turn hands off to
// the system maps app (locked architecture decision: no embedded navigation).
public struct RouteScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [CleanerJob] = []
    @State private var activeAddress: LiveJobAddress?
    @State private var isLoading = true
    @State private var loadFailed = false

    public init() {}

    private var todaysJobs: [CleanerJob] {
        jobs
            .filter { !$0.isOffer && ($0.status?.isActive ?? true) && isToday($0.scheduledAt) }
            .sorted { ($0.scheduledAt ?? .distantFuture) < ($1.scheduledAt ?? .distantFuture) }
    }

    private var activeJob: CleanerJob? { todaysJobs.first(where: \.isActiveShift) }

    private var activeCoordinate: CLLocationCoordinate2D? {
        guard let a = activeAddress, let lat = a.lat, let lng = a.lng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    if isLoading {
                        SkeletonBlock(height: 240)
                        SkeletonBlock(height: 96)
                    } else if loadFailed && jobs.isEmpty {
                        SweeprErrorState(
                            message: "We couldn't load your route. Check your connection and try again.",
                            onRetry: { Task { await load() } }
                        )
                        .padding(.top, SweeprSpacing.xl)
                    } else if todaysJobs.isEmpty {
                        emptyState
                    } else {
                        if let active = activeJob {
                            activeJobCard(active)
                        }
                        scheduleList
                        privacyNote
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

    // MARK: - Active job (address revealed → mappable)

    private func activeJobCard(_ job: CleanerJob) -> some View {
        VStack(spacing: 0) {
            if let coord = activeCoordinate {
                MapPreview(
                    coordinate: coord,
                    systemIcon: "house.fill",
                    title: "Active job",
                    height: 200,
                    cornerRadius: 0
                )
            }
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ACTIVE JOB")
                            .font(SweeprFont.footnote())
                            .foregroundColor(SweeprColor.textSecondary)
                        Text(job.packageDisplayName)
                            .font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    Spacer()
                    SweeprBadge("In shift", tone: .brand)
                }
                if let addr = activeAddress {
                    Label(addr.oneLine, systemImage: "mappin.and.ellipse")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprButton("Navigate", systemIcon: "location.north.line.fill") {
                        navigateToActive(job)
                    }
                    NavigationLink(destination: JobDetailScreen(job: job)) {
                        HStack(spacing: SweeprSpacing.sm) {
                            Image(systemName: "list.bullet.clipboard")
                            Text("Open job").font(SweeprFont.body().weight(.semibold))
                        }
                        .foregroundColor(SweeprColor.brand)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                    }
                    .buttonStyle(SweeprPressableButtonStyle())
                }
            }
            .padding(SweeprSpacing.md)
            .background(SweeprColor.surface)
        }
        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous)
                .stroke(SweeprColor.separator, lineWidth: 1)
        )
        .sweeprElevation(.medium)
    }

    // MARK: - Schedule

    private var scheduleList: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            SweeprSectionTitle("Today's schedule")
            VStack(spacing: 0) {
                ForEach(Array(todaysJobs.enumerated()), id: \.element.id) { idx, job in
                    NavigationLink(destination: JobDetailScreen(job: job)) {
                        scheduleRow(job, sequence: idx + 1)
                    }
                    .buttonStyle(SweeprPressableButtonStyle())
                    if idx < todaysJobs.count - 1 {
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

    private func scheduleRow(_ job: CleanerJob, sequence: Int) -> some View {
        HStack(spacing: SweeprSpacing.md) {
            ZStack {
                Circle()
                    .fill(job.isActiveShift ? SweeprColor.brand : SweeprColor.seafoam100)
                    .frame(width: 34, height: 34)
                Text("\(sequence)")
                    .font(SweeprFont.caption().weight(.bold))
                    .foregroundColor(job.isActiveShift ? .white : SweeprColor.brand)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(job.packageDisplayName)
                    .font(SweeprFont.body().weight(.semibold))
                    .foregroundColor(SweeprColor.textPrimary)
                Text("\(job.areaLabel) · \(job.homeSummary)")
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: SweeprSpacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
                if let when = job.scheduledAt {
                    Text(when.formatted(date: .omitted, time: .shortened))
                        .font(SweeprFont.caption().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                if let payout = job.payoutMoney {
                    Text(payout.dollarsString)
                        .font(SweeprFont.footnote())
                        .foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
        .padding(.vertical, SweeprSpacing.sm)
        .contentShape(Rectangle())
    }

    private var privacyNote: some View {
        HStack(alignment: .top, spacing: SweeprSpacing.sm) {
            Image(systemName: "lock.shield").foregroundColor(SweeprColor.textSecondary)
            Text("Exact addresses unlock per job when you start your route — that's what keeps customers' homes private.")
                .font(SweeprFont.footnote())
                .foregroundColor(SweeprColor.textSecondary)
        }
        .padding(.horizontal, SweeprSpacing.xs)
    }

    private var emptyState: some View {
        SweeprEmptyState(
            systemIcon: "map",
            title: "No stops today",
            message: "Accepted jobs will appear here in time order, ready to work through."
        )
        .padding(.top, SweeprSpacing.xl)
    }

    // MARK: - Actions

    private func navigateToActive(_ job: CleanerJob) {
        SweeprHaptics.impact(.medium)
        if let coord = activeCoordinate {
            SweeprMaps.openInMaps(latitude: coord.latitude, longitude: coord.longitude,
                                  label: job.packageDisplayName)
        } else if let addr = activeAddress {
            SweeprMaps.openInMaps(address: addr.oneLine)
        } else {
            env.toasts.show("Start the route in the job to unlock the address.", kind: .info)
        }
    }

    private func isToday(_ date: Date?) -> Bool {
        guard let date else { return false }
        return Calendar.current.isDateInToday(date)
    }

    private func load() async {
        isLoading = jobs.isEmpty
        do {
            jobs = try await env.cleanerAPI.myJobs()
            loadFailed = false
        } catch {
            loadFailed = true
        }
        // The active job's revealed address (mappable) comes from its live status.
        if let active = activeJob {
            activeAddress = (try? await env.cleanerAPI.liveStatus(bookingId: active.id))?.booking.address
        } else {
            activeAddress = nil
        }
        isLoading = false
    }
}
