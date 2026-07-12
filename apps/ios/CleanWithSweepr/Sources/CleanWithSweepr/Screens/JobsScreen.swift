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

// Jobs list — offered + assigned jobs with payout estimate and distance.
public struct JobsScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var jobs: [Job] = []
    @State private var isLoading = true

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: SweeprSpacing.sm) {
                        ForEach(0..<4, id: \.self) { _ in SkeletonBlock(height: 88) }
                    }
                    .padding(SweeprSpacing.md)
                } else {
                    ScrollView {
                        LazyVStack(spacing: SweeprSpacing.md) {
                            ForEach(jobs) { job in
                                NavigationLink(destination: JobDetailScreen(job: job)) {
                                    jobCard(job)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(SweeprSpacing.md)
                    }
                }
            }
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Jobs")
            .refreshable { await load() }
        }
        .task { await load() }
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
                if let addr = job.booking.address {
                    Text(addr.oneLine).font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprBadge(status: job.booking.status)
                    if let d = job.distanceMeters {
                        SweeprBadge(String(format: "%.1f mi", d / 1609.34), tone: .neutral)
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        do { jobs = try await env.api.cleanerJobs() }
        catch { jobs = SweeprMock.jobs }
        isLoading = false
    }
}
