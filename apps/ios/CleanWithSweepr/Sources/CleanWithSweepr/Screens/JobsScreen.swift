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
import SweeprKit
#if os(iOS)
import UIKit
#endif

// Jobs list — Today / Upcoming / Available (offer inbox) segments. Address is
// masked to an area label until the cleaner is en route. A job mid-shift is
// pinned at the top as an in-shift banner regardless of segment.
public struct JobsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [Job] = []
    @State private var isLoading = true
    @State private var segment: JobSegment = .today
    @State private var decidingOfferId: String?

    public init() {}

    private var activeShiftJob: Job? { jobs.first(where: \.isActiveShift) }

    private var segmentedJobs: [Job] {
        switch segment {
        case .today:
            return jobs.filter { !$0.isOffer && isToday($0.booking.scheduledAt) }
        case .upcoming:
            return jobs.filter { !$0.isOffer && !isToday($0.booking.scheduledAt) && $0.booking.status.isActive }
        case .available:
            return jobs.filter(\.isOffer)
        }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let active = activeShiftJob {
                    inShiftBanner(active)
                }
                Picker("Segment", selection: $segment) {
                    ForEach(JobSegment.allCases) { seg in
                        Text(seg.rawValue).tag(seg)
                    }
                }
                .pickerStyle(.segmented)
                .padding(SweeprSpacing.md)

                content
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Jobs")
        }
        .task {
            await load()
            env.activeJob = activeShiftJob
        }
    }

    @ViewBuilder private var content: some View {
        if isLoading {
            ScrollView {
                VStack(spacing: SweeprSpacing.sm) {
                    ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 88) }
                }
                .padding(SweeprSpacing.md)
            }
        } else if segmentedJobs.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVStack(spacing: SweeprSpacing.md) {
                    ForEach(segmentedJobs) { job in
                        if job.isOffer {
                            offerCard(job)
                        } else {
                            NavigationLink(destination: JobDetailScreen(job: job)) {
                                jobCard(job)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(SweeprSpacing.md)
            }
            .refreshable { await load() }
        }
    }

    private var emptyState: some View {
        let (title, message, icon): (String, String, String) = {
            switch segment {
            case .today: return ("No jobs today", "Nothing scheduled for today yet. Pull to refresh.", "sun.max")
            case .upcoming: return ("Nothing upcoming", "Your accepted jobs will show up here.", "calendar")
            case .available: return ("No new offers", "We'll notify you the moment a job matches your area.", "tray")
            }
        }()
        return ScrollView {
            ContentUnavailableView {
                Label(title, systemImage: icon)
            } description: {
                Text(message)
            }
            .padding(.top, SweeprSpacing.xl)
        }
        .refreshable { await load() }
    }

    private func inShiftBanner(_ job: Job) -> some View {
        NavigationLink(destination: JobDetailScreen(job: job)) {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "bolt.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text("In progress — \(job.booking.packageDisplayName)")
                        .font(SweeprFont.body().weight(.semibold))
                    Text(job.maskedAreaLabel).font(SweeprFont.caption())
                }
                Spacer()
                Image(systemName: "chevron.right")
            }
            .foregroundColor(.white)
            .padding(SweeprSpacing.md)
            .frame(maxWidth: .infinity)
            .background(SweeprColor.brand)
        }
        .buttonStyle(.plain)
    }

    private func jobCard(_ job: Job) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text(job.booking.packageDisplayName).font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    if let payout = job.payoutEstimate {
                        Text(payout.dollarsString).font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.brand)
                    }
                }
                if let when = job.booking.scheduledAt {
                    Text(when.formatted(date: .abbreviated, time: .shortened))
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                Text(job.maskedAreaLabel).font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprBadge(status: job.booking.status)
                    if let d = job.distanceMeters {
                        SweeprBadge(String(format: "%.1f mi", d / 1609.34), tone: .neutral)
                    }
                }
            }
        }
    }

    private func offerCard(_ job: Job) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text(job.booking.packageDisplayName).font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    if let payout = job.payoutEstimate {
                        Text(payout.dollarsString).font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.brand)
                    }
                }
                if let when = job.booking.scheduledAt {
                    Text(when.formatted(date: .abbreviated, time: .shortened))
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                Text(job.maskedAreaLabel).font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprButton("Decline", style: .secondary) {
                        respond(job, accept: false)
                    }
                    SweeprButton("Accept", style: .primary) {
                        respond(job, accept: true)
                    }
                }
                .disabled(decidingOfferId == job.id)
            }
        }
    }

    private func respond(_ job: Job, accept: Bool) {
        decidingOfferId = job.id
        #if os(iOS)
        UIImpactFeedbackGenerator(style: accept ? .medium : .light).impactOccurred()
        #endif
        Task {
            do {
                if accept {
                    try await env.cleanerAPI.acceptOffer(jobId: job.id)
                } else {
                    try await env.cleanerAPI.declineOffer(jobId: job.id)
                }
            } catch {
                // Offer response failed server-side (e.g. already claimed by
                // another cleaner) — re-sync from the source of truth below.
            }
            await load()
            decidingOfferId = nil
        }
    }

    private func isToday(_ date: Date?) -> Bool {
        guard let date else { return false }
        return Calendar.current.isDateInToday(date)
    }

    private func load() async {
        isLoading = true
        do { jobs = try await env.api.cleanerJobs() }
        catch { jobs = SweeprMock.jobs }
        isLoading = false
    }
}

#if DEBUG
struct JobsScreen_Previews: PreviewProvider {
    static var previews: some View {
        JobsScreen().environmentObject(AppEnvironment.preview)
    }
}
#endif
