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

// Day-of-service job detail — mirrors the web `JobDetailPage.tsx`. Drives the
// check-in flow and the Smart Entry reveal-unlock (access code stays hidden
// behind a deliberate gesture and is only fetched from the server once the
// cleaner is checked in near check-in time).
public struct JobDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let job: Job
    @State private var dos: DayOfServiceStatus?
    @State private var smartEntryRevealed = false
    @State private var isLoading = true

    public init(job: Job) { self.job = job }

    private var status: BookingStatus { dos?.status ?? job.booking.status }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                headerCard
                checkInSection
                smartEntrySection
                photoSection
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle(job.booking.packageDisplayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var headerCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text("Today's job").font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    SweeprBadge(status: status)
                }
                if let addr = job.booking.address {
                    Text(addr.oneLine).font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                if let payout = job.payoutEstimate {
                    Text("Est. payout \(payout.dollarsString)").font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.brand)
                }
            }
        }
    }

    // Check-in / status advancement. Real transitions are server-validated
    // (claim-then-act, statusMachine). These buttons call the day-of-service API.
    private var checkInSection: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Text("Check-in").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                switch status {
                case .confirmed, .cleaner_accepted:
                    SweeprButton("I'm on my way", systemIcon: "car.fill") {
                        // TODO: POST /day-of-service/:id { transition: cleaner_on_the_way }
                    }
                case .cleaner_on_the_way:
                    SweeprButton("I've arrived", systemIcon: "mappin.circle.fill") {
                        // TODO: transition -> arrived (unlocks Smart Entry fetch)
                    }
                case .arrived:
                    SweeprButton("Start cleaning", systemIcon: "play.fill") {
                        // TODO: transition -> in_progress (after before-photos)
                    }
                case .in_progress:
                    SweeprButton("Complete & checkout", systemIcon: "checkmark.seal.fill") {
                        // TODO: transition -> completed (requires after-photos)
                    }
                default:
                    Text(status.displayLabel).font(SweeprFont.body())
                        .foregroundColor(SweeprColor.textSecondary)
                }
            }
        }
    }

    // Smart Entry reveal-unlock. The code is masked until the cleaner explicitly
    // reveals it; revealing logs the access on the server.
    @ViewBuilder private var smartEntrySection: some View {
        if let entry = dos?.smartEntry {
            SweeprCard {
                VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                    HStack {
                        Label("Smart Entry", systemImage: "key.fill")
                            .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                        Spacer()
                        SweeprBadge(entry.method.rawValue.replacingOccurrences(of: "_", with: " "),
                                    tone: .brand)
                    }
                    if smartEntryRevealed {
                        if let code = entry.code {
                            Text(code).font(.system(size: 34, weight: .bold, design: .monospaced))
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                        if let instructions = entry.instructions {
                            Text(instructions).font(SweeprFont.body())
                                .foregroundColor(SweeprColor.textSecondary)
                        }
                    } else {
                        Text("Access details are hidden. Reveal only when you're at the door.")
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        SweeprButton("Reveal access", systemIcon: "eye.fill") {
                            // Haptic + server log on reveal.
                            #if os(iOS)
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            #endif
                            smartEntryRevealed = true
                            // TODO: POST /day-of-service/:id/smart-entry/reveal
                        }
                    }
                }
            }
        }
    }

    private var photoSection: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Text("Photos").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Before/after photos upload to R2 and gate check-in/checkout. "
                     + "TODO: camera capture + upload.")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private func load() async {
        isLoading = true
        do { dos = try await env.api.dayOfServiceStatus(bookingId: job.booking.id) }
        catch {
            dos = DayOfServiceStatus(
                bookingId: job.booking.id, status: job.booking.status,
                checkedInAt: nil, arrivedAt: nil, startedAt: nil, completedAt: nil,
                requiresBeforePhotos: true, requiresAfterPhotos: true,
                smartEntry: SweeprMock.smartEntry
            )
        }
        isLoading = false
    }
}
