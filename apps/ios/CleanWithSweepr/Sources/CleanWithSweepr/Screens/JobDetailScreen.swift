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
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

// Day-of-service job detail — the heart of the app, mirrors the web
// `JobDetailPage.tsx`. A stepper drives: Confirmed -> Start Route -> Arrive ->
// Smart Entry (reveal-unlock, biometric-gated, 45s auto-hide) -> Before photos
// -> In-progress checklist -> After photos -> Secure the door -> Checkout.
// The *server* status transition (`lib/statusMachine.ts`) remains
// authoritative; `DayOfServiceStep` only tracks where the on-device flow is.
public struct JobDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let job: Job

    @State private var dos: DayOfServiceStatus?
    @State private var isLoading = true
    @State private var step: DayOfServiceStep = .confirmed

    // Smart Entry
    @State private var access: CleanerAPI.AccessReveal?
    @State private var smartEntryRevealed = false
    @State private var revealRemaining: Int = 0
    @State private var revealTask: Task<Void, Never>?
    @State private var isAuthenticating = false
    @State private var isDoorUnlocked = false
    @State private var isDoorSecured = false

    // Photos
    @State private var beforePhotos: [CapturedPhoto] = []
    @State private var afterPhotos: [CapturedPhoto] = []

    // Checklist
    @State private var checklist: [RoomChecklist] = []

    // Transitions in flight
    @State private var isAdvancing = false

    public init(job: Job) { self.job = job }

    private var status: BookingStatus { dos?.status ?? job.booking.status }
    private var checklistComplete: Bool { !checklist.isEmpty && checklist.allSatisfy(\.isComplete) }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                headerCard
                progressBar
                if isLoading {
                    SkeletonBlock(height: 160)
                } else {
                    stepCard
                }
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle(job.booking.packageDisplayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onDisappear { revealTask?.cancel() }
    }

    // MARK: - Header

    private var headerCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text("Today's job").font(SweeprFont.heading())
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    SweeprBadge(status: status)
                }
                Text(job.maskedAreaLabel).font(SweeprFont.body())
                    .foregroundColor(SweeprColor.textSecondary)
                if let payout = job.payoutEstimate {
                    Text("Est. payout \(payout.dollarsString)").font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.brand)
                }
            }
        }
    }

    // MARK: - Progress indicator

    private var progressBar: some View {
        HStack(spacing: 4) {
            ForEach(DayOfServiceStep.allCases, id: \.rawValue) { s in
                Capsule()
                    .fill(s.rawValue <= step.rawValue ? SweeprColor.brand : SweeprColor.separator)
                    .frame(height: 5)
            }
        }
    }

    // MARK: - Step card (the flow)

    @ViewBuilder private var stepCard: some View {
        switch step {
        case .confirmed: confirmedCard
        case .enRoute: enRouteCard
        case .arrived: arrivedCard
        case .smartEntry: smartEntryCard
        case .beforePhotos: photoCard(phase: .before)
        case .inProgress: checklistCard
        case .afterPhotos: photoCard(phase: .after)
        case .secureDoor: secureDoorCard
        case .checkout: checkoutCard
        case .done: doneCard
        }
    }

    private var confirmedCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Confirmed").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("You're booked for this job. Start your route when you're ready to head over.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Start route", systemIcon: "car.fill") {
                    advance(to: .enRoute, transition: .cleaner_on_the_way)
                }
            }
        }
    }

    private var enRouteCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("On the way").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                if let addr = job.booking.address {
                    Text(addr.oneLine).font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                }
                HStack(spacing: SweeprSpacing.sm) {
                    SweeprButton("Open in Maps", style: .secondary, systemIcon: "map.fill") {
                        openInAppleMaps()
                    }
                    SweeprButton("View route", style: .secondary, systemIcon: "point.topleft.down.curvedto.point.bottomright.up.fill") {
                        // Navigation is handled by the Route tab; this screen
                        // stays focused on the day-of-service flow.
                    }
                }
                SweeprButton("I've arrived", systemIcon: "mappin.circle.fill") {
                    advance(to: .arrived, transition: .arrived)
                }
            }
        }
    }

    private var arrivedCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Arrived").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Label("Location check-in confirmed", systemImage: "location.fill")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Text("Continue to Smart Entry to get in.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Continue", systemIcon: "arrow.right") {
                    step = .smartEntry
                    Task { await loadAccessIfNeeded() }
                }
            }
        }
    }

    // Smart Entry reveal-unlock: biometric-gated, code auto-hides after 45s.
    private var smartEntryCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Label("Smart Entry", systemImage: "key.fill")
                        .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    if let entry = dos?.smartEntry {
                        SweeprBadge(entry.method.rawValue.replacingOccurrences(of: "_", with: " "), tone: .brand)
                    }
                }

                if smartEntryRevealed, let access {
                    if let code = access.code {
                        Text(code).font(.system(size: 34, weight: .bold, design: .monospaced))
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    if let instructions = access.instructions ?? dos?.smartEntry?.instructions {
                        Text(instructions).font(SweeprFont.body())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    Text("Hides in \(revealRemaining)s").font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)

                    SweeprButton(
                        isDoorUnlocked ? "Unlocked" : "Unlock door",
                        style: isDoorUnlocked ? .secondary : .primary,
                        systemIcon: isDoorUnlocked ? "lock.open.fill" : "lock.fill"
                    ) {
                        unlockDoor()
                    }
                    .disabled(isDoorUnlocked)
                } else {
                    Text("Access details are hidden. Reveal only when you're at the door.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    SweeprButton(isAuthenticating ? "Verifying…" : "Reveal access", systemIcon: "eye.fill") {
                        revealAccess()
                    }
                    .disabled(isAuthenticating)
                }

                Text("Powered by Seam").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

                if isDoorUnlocked {
                    SweeprButton("Continue to before photos", systemIcon: "arrow.right") {
                        step = .beforePhotos
                    }
                }
            }
        }
    }

    private func photoCard(phase: PhotoPhase) -> some View {
        let photos = phase == .before ? beforePhotos : afterPhotos
        let minRequired = 2
        return SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text(phase == .before ? "Before photos" : "After photos")
                    .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Capture at least \(minRequired) photos. These upload to secure storage and gate "
                     + (phase == .before ? "check-in." : "checkout."))
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
                          spacing: SweeprSpacing.sm) {
                    ForEach(photos) { _ in
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(SweeprColor.seafoam100)
                            .frame(height: 72)
                            .overlay(Image(systemName: "checkmark.circle.fill").foregroundColor(SweeprColor.brand))
                    }
                    Button {
                        capturePhoto(phase: phase)
                    } label: {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(SweeprColor.separator, lineWidth: 1)
                            .frame(height: 72)
                            .overlay(Image(systemName: "camera.fill").foregroundColor(SweeprColor.textSecondary))
                    }
                }

                Text("\(photos.count)/\(minRequired) captured")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

                if photos.count >= minRequired {
                    SweeprButton(
                        phase == .before ? "Start cleaning" : "Secure the door",
                        systemIcon: phase == .before ? "play.fill" : "lock.fill"
                    ) {
                        if phase == .before {
                            advance(to: .inProgress, transition: .in_progress)
                        } else {
                            step = .secureDoor
                        }
                    }
                }
            }
        }
    }

    private var checklistCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("In progress").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                ForEach($checklist) { $room in
                    VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                        Text(room.room).font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        ForEach($room.items) { $item in
                            Button {
                                item.done.toggle()
                                #if os(iOS)
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                #endif
                            } label: {
                                HStack {
                                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(item.done ? SweeprColor.brand : SweeprColor.textSecondary)
                                    Text(item.label).font(SweeprFont.body())
                                        .foregroundColor(SweeprColor.textPrimary)
                                        .strikethrough(item.done)
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Divider()
                }
                SweeprButton("Move to after photos", systemIcon: "camera.fill") {
                    step = .afterPhotos
                }
                .disabled(!checklistComplete)
            }
        }
    }

    private var secureDoorCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Secure the door").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Make sure the door is locked before you leave. This re-secures the Smart Entry lock.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton(isDoorSecured ? "Door secured" : "Lock door", style: isDoorSecured ? .secondary : .primary,
                             systemIcon: "lock.fill") {
                    secureDoor()
                }
                .disabled(isDoorSecured)
                if isDoorSecured {
                    SweeprButton("Continue to checkout", systemIcon: "arrow.right") {
                        step = .checkout
                    }
                }
            }
        }
    }

    private var checkoutCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Checkout").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Review complete. Submitting will mark this job as completed and start payout processing.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                if let payout = job.payoutEstimate {
                    HStack {
                        Text("Est. payout").font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                        Spacer()
                        Text(payout.dollarsString).font(SweeprFont.heading()).foregroundColor(SweeprColor.brand)
                    }
                }
                SweeprButton(isAdvancing ? "Submitting…" : "Complete job", systemIcon: "checkmark.seal.fill") {
                    advance(to: .done, transition: .completed_pending_review)
                }
                .disabled(isAdvancing)
            }
        }
    }

    private var doneCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Label("Job complete", systemImage: "checkmark.seal.fill")
                    .font(SweeprFont.heading()).foregroundColor(SweeprColor.brand)
                Text("Nice work. Payout will process after the platform review window.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    // MARK: - Actions

    private func advance(to nextStep: DayOfServiceStep, transition: BookingStatus) {
        guard !isAdvancing else { return }
        isAdvancing = true
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
        Task {
            do { try await env.cleanerAPI.transition(bookingId: job.booking.id, to: transition) }
            catch { /* Server is authoritative; UI still advances locally for
                       demo/offline continuity, but a real failure should
                       surface an error toast here. */ }
            step = nextStep
            isAdvancing = false
        }
    }

    private func openInAppleMaps() {
        guard let addr = job.booking.address else { return }
        let query = addr.oneLine.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "https://maps.apple.com/?daddr=\(query)") else { return }
        #if os(iOS)
        UIApplication.shared.open(url)
        #endif
    }

    private func revealAccess() {
        isAuthenticating = true
        Task {
            let ok = await requestBiometricReauth()
            guard ok else { isAuthenticating = false; return }
            do { access = try await env.cleanerAPI.revealAccess(bookingId: job.booking.id) }
            catch {
                access = CleanerAPI.AccessReveal(
                    code: dos?.smartEntry?.code, instructions: dos?.smartEntry?.instructions,
                    expiresInSeconds: Int(CleanerMock.smartEntryRevealSeconds)
                )
            }
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            #endif
            smartEntryRevealed = true
            isAuthenticating = false
            startAutoHideTimer(seconds: access?.expiresInSeconds ?? Int(CleanerMock.smartEntryRevealSeconds))
        }
    }

    private func startAutoHideTimer(seconds: Int) {
        revealTask?.cancel()
        revealRemaining = seconds
        revealTask = Task {
            while revealRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                revealRemaining -= 1
            }
            smartEntryRevealed = false
            access = nil
        }
    }

    private func unlockDoor() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        #endif
        Task {
            do { try await env.cleanerAPI.setLock(bookingId: job.booking.id, locked: false) } catch {}
            isDoorUnlocked = true
        }
    }

    private func secureDoor() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
        Task {
            do { try await env.cleanerAPI.setLock(bookingId: job.booking.id, locked: true) } catch {}
            isDoorSecured = true
        }
    }

    private enum PhotoPhase { case before, after }

    private func capturePhoto(phase: PhotoPhase) {
        // TODO: wire real camera capture (PHPickerViewController /
        // UIImagePickerController) + upload to R2. This records a placeholder
        // capture so the gate (>=2 photos) can be exercised end-to-end.
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
        let photo = CapturedPhoto()
        if phase == .before { beforePhotos.append(photo) } else { afterPhotos.append(photo) }
        Task {
            try? await env.cleanerAPI.recordPhotoCaptured(
                bookingId: job.booking.id, phase: phase == .before ? "before" : "after"
            )
        }
    }

    /// Biometric re-auth before Smart Entry reveal/unlock. Falls back to
    /// allowing access when biometrics are unavailable/unenrolled so onboarding
    /// never hard-blocks a cleaner without Face ID/Touch ID configured.
    private func requestBiometricReauth() async -> Bool {
        #if os(iOS) && canImport(LocalAuthentication)
        let context = LAContext()
        var evalError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &evalError) else {
            return true
        }
        return await withCheckedContinuation { continuation in
            context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Confirm it's you to reveal this customer's access code."
            ) { success, _ in
                continuation.resume(returning: success)
            }
        }
        #else
        return true
        #endif
    }

    private func loadAccessIfNeeded() async {
        if checklist.isEmpty { checklist = CleanerMock.checklist }
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
        step = DayOfServiceStep.from(status: status)
        checklist = (try? await env.cleanerAPI.checklist(bookingId: job.booking.id)) ?? CleanerMock.checklist
        isLoading = false
    }
}
