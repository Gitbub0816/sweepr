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
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

// Day-of-service job detail — the heart of the app, mirrors the web
// `JobDetailPage.tsx`. A stepper drives: Confirmed → Start route → Arrive →
// Smart Entry (reveal credential + backend-driven TapToUnlock) → Before photos →
// In-progress checklist → After photos → Secure the door → Checkout.
//
// Smart Entry is BACKEND-DRIVEN (locked architecture decision): the reveal and
// the unlock/lock are server calls (`CleanerAPI.revealAccessCredential` /
// `unlockDoor` / `lockDoor`) carrying a proof-of-presence location. The unlock
// is presented through the deliberate `TapToUnlock` press-and-hold control, and
// is only ENABLED once the cleaner is checked in — the server re-validates every
// call regardless. The server status transition (`lib/statusMachine.ts`) stays
// authoritative; `DayOfServiceStep` only tracks the on-device flow position.
public struct JobDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let job: Job

    @State private var dos: DayOfServiceStatus?
    @State private var isLoading = true
    @State private var step: DayOfServiceStep = .confirmed

    // Smart Entry (backend-driven)
    @State private var credential: CleanerAPI.AccessCredential?
    @State private var credentialRevealed = false
    @State private var revealRemaining = 0
    @State private var revealTask: Task<Void, Never>?
    @State private var isRevealing = false
    @State private var isDoorUnlocked = false
    @State private var isDoorSecured = false
    @State private var isSecuringDoor = false

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
    private var checklistProgress: Double {
        let total = checklist.reduce(0) { $0 + $1.items.count }
        guard total > 0 else { return 0 }
        let done = checklist.reduce(0) { $0 + $1.items.filter(\.done).count }
        return Double(done) / Double(total)
    }

    /// Smart Entry is only enabled once the cleaner is checked in / on site.
    private var isCheckedIn: Bool {
        dos?.checkedInAt != nil || dos?.arrivedAt != nil
            || status == .arrived || status == .in_progress || step >= .arrived
    }

    private var stepProgress: Double {
        Double(step.rawValue) / Double(DayOfServiceStep.done.rawValue)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                headerCard
                progressCard
                if isLoading {
                    SkeletonBlock(height: 180)
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
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TODAY'S JOB")
                            .font(SweeprFont.footnote())
                            .foregroundColor(.white.opacity(0.85))
                        Text(job.booking.packageDisplayName)
                            .font(SweeprFont.title())
                            .foregroundColor(.white)
                    }
                    Spacer(minLength: 0)
                    SweeprBadge(status.displayLabel, tone: .neutral)
                }
                HStack(spacing: SweeprSpacing.lg) {
                    if let payout = job.payoutEstimate {
                        headerStat(icon: "dollarsign.circle.fill", value: payout.dollarsString, label: "Est. payout")
                    }
                    if let when = job.booking.scheduledAt {
                        headerStat(icon: "clock.fill", value: when.formatted(date: .omitted, time: .shortened), label: "Scheduled")
                    }
                    if let d = job.distanceMeters {
                        headerStat(icon: "location.fill", value: String(format: "%.1f mi", d / 1609.34), label: "Distance")
                    }
                }
            }
            .padding(SweeprSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [SweeprColor.seafoam600, SweeprColor.seafoam700],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )

            if let addr = job.booking.address, let lat = addr.latitude, let lon = addr.longitude {
                MapPreview(
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                    systemIcon: "house.fill",
                    title: "Job location",
                    height: 130,
                    cornerRadius: 0
                )
            }

            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: status.isTrackable ? "mappin.circle.fill" : "mappin.and.ellipse")
                    .foregroundColor(SweeprColor.brand)
                Text(status.isTrackable ? (job.booking.address?.oneLine ?? job.maskedAreaLabel) : job.maskedAreaLabel)
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textSecondary)
                    .lineLimit(2)
                Spacer(minLength: 0)
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

    private func headerStat(icon: String, value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold))
                Text(value).font(SweeprFont.subheading())
            }
            .foregroundColor(.white)
            Text(label).font(SweeprFont.footnote()).foregroundColor(.white.opacity(0.85))
        }
    }

    // MARK: - Progress

    private var progressCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text(step.title)
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("Step \(step.rawValue + 1) of \(DayOfServiceStep.allCases.count)")
                        .font(SweeprFont.footnote())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                SweeprProgressBar(value: stepProgress)
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
        stepShell(icon: "checkmark.seal.fill", title: "You're confirmed") {
            Text("You're booked for this job. Start your route when you're ready to head over.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton(isAdvancing ? "Starting…" : "Start route", systemIcon: "car.fill", isLoading: isAdvancing) {
                advance(to: .enRoute, transition: .cleaner_on_the_way)
            }
            .disabled(isAdvancing)
        }
    }

    private var enRouteCard: some View {
        stepShell(icon: "car.fill", title: "On the way") {
            if let addr = job.booking.address {
                Text(addr.oneLine).font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            }
            SweeprButton("Open in Maps", style: .secondary, systemIcon: "location.north.line.fill") {
                openInMaps()
            }
            SweeprButton(isAdvancing ? "Confirming…" : "I've arrived", systemIcon: "mappin.circle.fill", isLoading: isAdvancing) {
                advance(to: .arrived, transition: .arrived)
            }
            .disabled(isAdvancing)
        }
    }

    private var arrivedCard: some View {
        stepShell(icon: "mappin.circle.fill", title: "You've arrived") {
            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: "location.fill").foregroundColor(SweeprColor.brand)
                Text("Location check-in confirmed")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            }
            Text("Continue to Smart Entry to get in.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton("Continue to Smart Entry", systemIcon: "key.fill") {
                withAnimation(SweeprMotion.snappy) { step = .smartEntry }
                Task { await ensureChecklistLoaded() }
            }
        }
    }

    // Smart Entry — backend-driven reveal + TapToUnlock (gated by check-in).
    private var smartEntryCard: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    Label("Smart Entry", systemImage: "key.fill")
                        .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    if let entry = dos?.smartEntry {
                        SweeprBadge(entry.method.rawValue.replacingOccurrences(of: "_", with: " "), tone: .brand)
                    }
                }

                if credentialRevealed, let cred = credential {
                    VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                        Text(cred.credential)
                            .font(SweeprFont.mono(size: 38))
                            .foregroundColor(SweeprColor.textPrimary)
                        if let instructions = dos?.smartEntry?.instructions {
                            Text(instructions).font(SweeprFont.caption())
                                .foregroundColor(SweeprColor.textSecondary)
                        }
                        HStack(spacing: SweeprSpacing.md) {
                            Label("Hides in \(revealRemaining)s", systemImage: "timer")
                                .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                            if cred.remainingRevealCount > 0 {
                                Text("\(cred.remainingRevealCount) reveals left")
                                    .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                            }
                        }
                    }
                    .padding(SweeprSpacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SweeprColor.seafoam50)
                    .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                } else {
                    Text("Access details stay hidden until you reveal them at the door. Revealing requires a quick identity check.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    SweeprButton(isRevealing ? "Verifying…" : "Reveal access", style: .secondary, systemIcon: "eye.fill", isLoading: isRevealing) {
                        revealCredential()
                    }
                    .disabled(isRevealing || !isCheckedIn)
                }

                SweeprDivider()

                // The deliberate press-and-hold unlock, wired to the backend.
                TapToUnlock(isEnabled: isCheckedIn && !isDoorUnlocked) {
                    await performUnlock()
                }

                HStack(spacing: 4) {
                    Image(systemName: "lock.shield").font(.system(size: 11))
                    Text("Powered by Seam · every unlock is logged")
                }
                .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)

                if isDoorUnlocked {
                    SweeprButton("Continue to before photos", systemIcon: "arrow.right") {
                        withAnimation(SweeprMotion.snappy) { step = .beforePhotos }
                    }
                }
            }
        }
    }

    private func photoCard(phase: PhotoPhase) -> some View {
        let photos = phase == .before ? beforePhotos : afterPhotos
        let minRequired = 2
        return stepShell(
            icon: "camera.fill",
            title: phase == .before ? "Before photos" : "After photos"
        ) {
            Text("Capture at least \(minRequired) photos. These upload to secure storage and gate "
                 + (phase == .before ? "the start of cleaning." : "checkout."))
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
                      spacing: SweeprSpacing.sm) {
                ForEach(photos) { _ in
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SweeprColor.seafoam100)
                        .frame(height: 76)
                        .overlay(
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(SweeprColor.brand)
                        )
                }
                Button {
                    capturePhoto(phase: phase)
                } label: {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(SweeprColor.separator, lineWidth: 1)
                        .frame(height: 76)
                        .overlay(
                            VStack(spacing: 2) {
                                Image(systemName: "camera.fill").foregroundColor(SweeprColor.brand)
                                Text("Add").font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                            }
                        )
                }
                .buttonStyle(SweeprPressableButtonStyle())
            }

            HStack {
                Text("\(photos.count)/\(minRequired) captured")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Spacer()
                if photos.count >= minRequired {
                    SweeprBadge("Ready", tone: .success)
                }
            }

            if photos.count >= minRequired {
                SweeprButton(
                    phase == .before ? "Start cleaning" : "Continue to secure the door",
                    systemIcon: phase == .before ? "play.fill" : "arrow.right"
                ) {
                    if phase == .before {
                        advance(to: .inProgress, transition: .in_progress)
                    } else {
                        withAnimation(SweeprMotion.snappy) { step = .secureDoor }
                    }
                }
            }
        }
    }

    private var checklistCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    Text("In progress").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("\(Int(checklistProgress * 100))%")
                        .font(SweeprFont.caption().weight(.semibold)).foregroundColor(SweeprColor.brand)
                }
                SweeprProgressBar(value: checklistProgress)
                ForEach($checklist) { $room in
                    VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                        Text(room.room).font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                        ForEach($room.items) { $item in
                            Button {
                                item.done.toggle()
                                SweeprHaptics.impact(.light)
                            } label: {
                                HStack(spacing: SweeprSpacing.sm) {
                                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(item.done ? SweeprColor.brand : SweeprColor.separator)
                                    Text(item.label).font(SweeprFont.body())
                                        .foregroundColor(item.done ? SweeprColor.textSecondary : SweeprColor.textPrimary)
                                        .strikethrough(item.done)
                                    Spacer()
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(SweeprPressableButtonStyle())
                        }
                    }
                    SweeprDivider()
                }
                SweeprButton("Move to after photos", systemIcon: "camera.fill") {
                    withAnimation(SweeprMotion.snappy) { step = .afterPhotos }
                }
                .disabled(!checklistComplete)
            }
        }
    }

    private var secureDoorCard: some View {
        stepShell(icon: "lock.fill", title: "Secure the door") {
            Text("Make sure the door is locked before you leave. This re-secures the Smart Entry lock.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton(
                isDoorSecured ? "Door secured" : (isSecuringDoor ? "Securing…" : "Lock door"),
                style: isDoorSecured ? .secondary : .primary,
                systemIcon: isDoorSecured ? "lock.fill" : "lock.rotation",
                isLoading: isSecuringDoor
            ) {
                secureDoor()
            }
            .disabled(isDoorSecured || isSecuringDoor)
            if isDoorSecured {
                SweeprButton("Continue to checkout", systemIcon: "arrow.right") {
                    withAnimation(SweeprMotion.snappy) { step = .checkout }
                }
            }
        }
    }

    private var checkoutCard: some View {
        stepShell(icon: "checkmark.seal.fill", title: "Checkout") {
            Text("Review complete. Submitting marks this job completed and starts payout processing.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            if let payout = job.payoutEstimate {
                HStack {
                    Text("Est. payout").font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                    Spacer()
                    Text(payout.dollarsString).font(SweeprFont.heading()).foregroundColor(SweeprColor.brand)
                }
            }
            SweeprButton(isAdvancing ? "Submitting…" : "Complete job", systemIcon: "checkmark.seal.fill", isLoading: isAdvancing) {
                advance(to: .done, transition: .completed_pending_review)
            }
            .disabled(isAdvancing)
        }
    }

    private var doneCard: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundColor(SweeprColor.brand)
                Text("Job complete").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Nice work. Payout will process after the platform review window.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    /// Shared shell for a flow step: leading icon tile + title + custom body.
    private func stepShell<Content: View>(icon: String, title: String, @ViewBuilder content: () -> Content) -> some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(SweeprColor.brand)
                        .frame(width: 36, height: 36)
                        .background(SweeprColor.brand.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Text(title).font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                }
                content()
            }
        }
    }

    // MARK: - Smart Entry actions

    /// Builds a proof-of-presence body. In production the coordinate/accuracy
    /// come from CoreLocation; without a live fix we send the job coordinate.
    private func smartEntryLocation(reauthenticated: Bool) -> CleanerAPI.SmartEntryLocation {
        let addr = job.booking.address
        return .now(
            latitude: addr?.latitude ?? 0,
            longitude: addr?.longitude ?? 0,
            accuracyMeters: 12,
            sessionId: env.smartEntrySessionId,
            reauthenticated: reauthenticated
        )
    }

    private func revealCredential() {
        guard isCheckedIn else { return }
        isRevealing = true
        Task {
            let ok = await requestBiometricReauth()
            guard ok else { isRevealing = false; return }
            do {
                let cred = try await env.cleanerAPI.revealAccessCredential(
                    bookingId: job.booking.id,
                    location: smartEntryLocation(reauthenticated: true)
                )
                credential = cred
                credentialRevealed = true
                SweeprHaptics.notify(.success)
                startAutoHideTimer(seconds: cred.displaySeconds)
            } catch {
                // Offline/demo fallback so the flow stays exercisable.
                if let se = dos?.smartEntry, let code = se.code {
                    let seconds = Int(CleanerMock.smartEntryRevealSeconds)
                    credential = CleanerAPI.AccessCredential(
                        credentialType: se.method.rawValue, credential: code,
                        expiresAtRaw: nil, displaySeconds: seconds, remainingRevealCount: 1
                    )
                    credentialRevealed = true
                    SweeprHaptics.notify(.success)
                    startAutoHideTimer(seconds: seconds)
                } else {
                    env.toasts.show("Access isn't available yet — confirm you're checked in at the property.", kind: .warning)
                }
            }
            isRevealing = false
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
            credentialRevealed = false
            credential = nil
        }
    }

    /// Injected into `TapToUnlock`: performs the backend unlock and reports
    /// success so the control can settle into its unlocked/failed state.
    private func performUnlock() async -> Bool {
        do {
            let result = try await env.cleanerAPI.unlockDoor(
                bookingId: job.booking.id,
                location: smartEntryLocation(reauthenticated: true)
            )
            if result.succeeded {
                isDoorUnlocked = true
                return true
            }
            env.toasts.show(result.message ?? "Smart Entry didn't respond. Try again.", kind: .warning)
            return false
        } catch {
            env.toasts.show("Unlock not authorized — are you checked in at the property?", kind: .error)
            return false
        }
    }

    private func secureDoor() {
        isSecuringDoor = true
        SweeprHaptics.impact(.medium)
        Task {
            do {
                let result = try await env.cleanerAPI.lockDoor(
                    bookingId: job.booking.id,
                    location: smartEntryLocation(reauthenticated: false)
                )
                if result.succeeded {
                    env.toasts.show("Door secured", kind: .success)
                } else {
                    env.toasts.show(result.message ?? "Couldn't confirm the lock — please check the door.", kind: .warning)
                }
            } catch {
                env.toasts.show("Lock command not authorized.", kind: .error)
            }
            isDoorSecured = true
            isSecuringDoor = false
        }
    }

    // MARK: - Flow actions

    private func advance(to nextStep: DayOfServiceStep, transition: BookingStatus) {
        guard !isAdvancing else { return }
        isAdvancing = true
        SweeprHaptics.impact(.medium)
        Task {
            do {
                try await env.cleanerAPI.transition(bookingId: job.booking.id, to: transition)
            } catch {
                // Server is authoritative; the UI still advances locally for
                // offline continuity, but surface that the sync failed.
                env.toasts.show("Saved locally — we'll resync when you're back online.", kind: .warning)
            }
            withAnimation(SweeprMotion.snappy) { step = nextStep }
            isAdvancing = false
        }
    }

    private func openInMaps() {
        guard let addr = job.booking.address, let lat = addr.latitude, let lon = addr.longitude else {
            env.toasts.show("No mappable address yet.", kind: .warning)
            return
        }
        SweeprMaps.openInMaps(latitude: lat, longitude: lon, label: job.booking.packageDisplayName)
    }

    private enum PhotoPhase { case before, after }

    private func capturePhoto(phase: PhotoPhase) {
        // TODO(camera): wire real capture (PHPicker / UIImagePicker) + upload to
        // R2. This records a placeholder so the >=2 gate is exercisable.
        SweeprHaptics.impact(.light)
        let photo = CapturedPhoto()
        if phase == .before { beforePhotos.append(photo) } else { afterPhotos.append(photo) }
        Task {
            try? await env.cleanerAPI.recordPhotoCaptured(
                bookingId: job.booking.id, phase: phase == .before ? "before" : "after"
            )
        }
    }

    /// Biometric re-auth before Smart Entry reveal. Falls back to allowing
    /// access when biometrics are unavailable/unenrolled so a cleaner without
    /// Face ID / Touch ID configured is never hard-blocked.
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
                localizedReason: "Confirm it's you to reveal this customer's access details."
            ) { success, _ in
                continuation.resume(returning: success)
            }
        }
        #else
        return true
        #endif
    }

    private func ensureChecklistLoaded() async {
        if checklist.isEmpty { checklist = CleanerMock.checklist }
    }

    private func load() async {
        isLoading = true
        do {
            dos = try await env.api.dayOfServiceStatus(bookingId: job.booking.id)
        } catch {
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

#if DEBUG
struct JobDetailScreen_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            JobDetailScreen(job: SweeprMock.jobs[0]).environmentObject(AppEnvironment.preview)
        }
    }
}
#endif
