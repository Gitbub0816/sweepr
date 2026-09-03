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

// Jobs list — Today / Upcoming / Available (offer inbox) segments, fed by the
// real dashboard endpoints: /cleaner-dashboard/my-jobs (accepted work) merged
// with /cleaner-dashboard/available-offers (the inbox). Address stays an area
// label until the day-of flow reveals it. A job mid-shift is pinned at the top
// as an in-shift banner regardless of segment.
public struct JobsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [CleanerJob] = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var segment: JobSegment = .today
    @State private var decidingOfferId: String?

    public init() {}

    private var activeShiftJob: CleanerJob? { jobs.first { !$0.isOffer && $0.isActiveShift } }

    private var todayCount: Int {
        jobs.filter { !$0.isOffer && isToday($0.scheduledAt) }.count
    }
    private var offerCount: Int { jobs.filter(\.isOffer).count }

    private var segmentedJobs: [CleanerJob] {
        switch segment {
        case .today:
            return jobs.filter { !$0.isOffer && isToday($0.scheduledAt) }
        case .upcoming:
            return jobs.filter {
                !$0.isOffer && !isToday($0.scheduledAt) && ($0.status?.isActive ?? true)
            }
        case .available:
            return jobs.filter(\.isOffer)
        }
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SweeprSpacing.md) {
                    summaryHeader
                    if let active = activeShiftJob {
                        inShiftBanner(active)
                    }
                    segmentControl
                    content
                }
                .padding(SweeprSpacing.md)
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Jobs")
            .refreshable { await load() }
        }
        .task {
            await load()
        }
    }

    // MARK: - Header

    private var summaryHeader: some View {
        SweeprCard(elevation: .medium) {
            HStack(spacing: SweeprSpacing.lg) {
                SweeprStat(
                    value: "\(todayCount)",
                    caption: "Jobs today",
                    systemIcon: "sun.max.fill"
                )
                SweeprDivider().frame(width: 1, height: 44)
                SweeprStat(
                    value: "\(offerCount)",
                    caption: "New offers",
                    systemIcon: "sparkles"
                )
            }
        }
    }

    private var segmentControl: some View {
        SweeprSegmentedControl(
            selection: $segment,
            options: JobSegment.allCases.map { (value: $0, label: $0.rawValue) }
        )
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        if isLoading {
            VStack(spacing: SweeprSpacing.md) {
                ForEach(0..<3, id: \.self) { _ in SkeletonBlock(height: 116) }
            }
        } else if loadFailed && jobs.isEmpty {
            SweeprErrorState(
                message: "We couldn't load your jobs. Check your connection and try again.",
                onRetry: { Task { await load() } }
            )
        } else if segmentedJobs.isEmpty {
            emptyState
        } else {
            LazyVStack(spacing: SweeprSpacing.md) {
                ForEach(segmentedJobs) { job in
                    if job.isOffer {
                        offerCard(job)
                    } else {
                        NavigationLink(destination: JobDetailScreen(job: job)) {
                            jobCard(job)
                        }
                        .buttonStyle(SweeprPressableButtonStyle())
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        let (title, message, icon): (String, String, String) = {
            switch segment {
            case .today: return ("No jobs today", "Nothing scheduled for today yet. Pull down to refresh.", "sun.max")
            case .upcoming: return ("Nothing upcoming", "Jobs you accept will show up here so you can plan ahead.", "calendar")
            case .available: return ("No new offers", "We'll notify you the moment a job matches your area.", "tray")
            }
        }()
        return SweeprEmptyState(systemIcon: icon, title: title, message: message)
            .padding(.top, SweeprSpacing.lg)
    }

    // MARK: - In-shift banner

    private func inShiftBanner(_ job: CleanerJob) -> some View {
        NavigationLink(destination: JobDetailScreen(job: job)) {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(Color.white.opacity(0.18))
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("In progress")
                        .font(SweeprFont.footnote())
                        .foregroundColor(.white.opacity(0.85))
                    Text(job.packageDisplayName)
                        .font(SweeprFont.subheading())
                        .foregroundColor(.white)
                    Text(job.areaLabel)
                        .font(SweeprFont.caption())
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
            }
            .padding(SweeprSpacing.md)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [SweeprColor.seafoam600, SweeprColor.brand],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.card, style: .continuous))
            .sweeprElevation(.medium)
        }
        .buttonStyle(SweeprPressableButtonStyle())
    }

    // MARK: - Cards

    private func jobCard(_ job: CleanerJob) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    Text(job.packageDisplayName)
                        .font(SweeprFont.subheading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    if let payout = job.payoutMoney {
                        Text(payout.dollarsString)
                            .font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.brand)
                    }
                }
                if let when = job.scheduledAt {
                    Label(when.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                Label("\(job.areaLabel) · \(job.homeSummary)", systemImage: "mappin.and.ellipse")
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                    .lineLimit(1)
                SweeprDivider()
                HStack(spacing: SweeprSpacing.sm) {
                    if let status = job.status {
                        SweeprBadge(status: status)
                    }
                    Spacer()
                    Text("View")
                        .font(SweeprFont.caption().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(SweeprColor.brand)
                }
            }
        }
    }

    private func offerCard(_ job: CleanerJob) -> some View {
        let isDeciding = decidingOfferId == job.id
        return SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    SweeprBadge("New offer", tone: .brand)
                    Spacer()
                    if let payout = job.payoutMoney {
                        Text(payout.dollarsString)
                            .font(SweeprFont.title())
                            .foregroundColor(SweeprColor.brand)
                    }
                }
                Text(job.packageDisplayName)
                    .font(SweeprFont.heading())
                    .foregroundColor(SweeprColor.textPrimary)
                VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                    if let when = job.scheduledAt {
                        Label(when.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
                            .font(SweeprFont.caption())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    Label("\(job.areaLabel) · \(job.homeSummary)", systemImage: "mappin.and.ellipse")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprButton("Decline", style: .secondary) {
                        respond(job, accept: false)
                    }
                    SweeprButton(isDeciding ? "…" : "Accept", style: .primary, isLoading: isDeciding) {
                        respond(job, accept: true)
                    }
                }
                .disabled(isDeciding)
            }
        }
    }

    // MARK: - Actions

    private func respond(_ job: CleanerJob, accept: Bool) {
        decidingOfferId = job.id
        SweeprHaptics.impact(accept ? .medium : .light)
        Task {
            do {
                if accept {
                    try await env.cleanerAPI.acceptOffer(bookingId: job.id)
                    env.toasts.show("Offer accepted — see you there!", kind: .success)
                } else {
                    try await env.cleanerAPI.declineOffer(bookingId: job.id)
                    env.toasts.show("Offer declined", kind: .info)
                }
            } catch {
                // Offer response failed server-side (e.g. already claimed by
                // another cleaner) — re-sync from the source of truth below.
                env.toasts.show("That offer is no longer available.", kind: .warning)
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
        isLoading = jobs.isEmpty
        do {
            async let mine = env.cleanerAPI.myJobs()
            async let offers = env.cleanerAPI.availableOffers()
            jobs = try await offers + mine
            loadFailed = false
        } catch {
            // Keep whatever real rows are on screen; empty + failed renders
            // the retryable error state. Never fabricate jobs.
            loadFailed = true
        }
        env.activeJob = activeShiftJob
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
