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

// Day-of-service job detail — drives the REAL server machine
// (routes/dayOfService.ts). There is no generic "transition" call: each step
// is its own endpoint with its own guards, and the SERVER is authoritative —
// a failed call never advances the UI.
//
//   confirmed ──start-route──▶ en_route ──GPS pings──▶ arrived
//     arrived ──start-clean──▶ in_progress ──finish-clean──▶ awaiting_checkout
//     awaiting_checkout ──complete(checkout photo)──▶ completed
//
// Arrival is GPS-verified server-side (within 150 m of the property). Photos
// upload to R2 through presigned URLs and are recorded per phase; the server
// enforces the before/after minimums at completion. Smart Entry stays
// backend-driven (reveal + TapToUnlock + lock through /cleaner/bookings/…),
// gated on being checked in, with a biometric re-auth before reveal.
public struct JobDetailScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let job: CleanerJob

    @State private var live: LiveJobStatus?
    @State private var loadFailed = false
    @State private var isLoading = true
    @State private var isActing = false

    // Address revealed by start-route (before `live` catches up).
    @State private var revealedAddress: RevealedAddress?
    // Legacy access codes handed out by start-clean (keypad/lockbox notes).
    @State private var accessCodes: [JobAccessCode] = []

    // Arrival pinging
    @State private var pingTask: Task<Void, Never>?
    @State private var lastPingDistanceHint: String?

    // Smart Entry
    @State private var credential: CleanerAPI.AccessCredential?
    @State private var credentialRevealed = false
    @State private var revealRemaining = 0
    @State private var revealTask: Task<Void, Never>?
    @State private var isRevealing = false
    @State private var isDoorUnlocked = false
    @State private var isDoorSecured = false
    @State private var isSecuringDoor = false

    // Photos
    @State private var captureFor: PhotoPhase?
    @State private var isUploadingPhoto = false
    @State private var checkoutPhotoKey: String?

    // Local working guide (client-side only; server gates are the photos)
    @State private var guide: [RoomChecklist] = []

    public init(job: CleanerJob) { self.job = job }

    // MARK: - Derived state

    private var dayStatus: DayStatus? { live?.booking.dayStatus ?? job.dayStatus }
    private var beforeCount: Int { live?.beforeCount ?? 0 }
    private var afterCount: Int { live?.afterCount ?? 0 }
    private let requiredPhotos = 3 // server default (site_settings can raise it)

    private var isCheckedIn: Bool {
        switch dayStatus {
        case .arrived, .in_progress, .awaiting_checkout: return true
        default: return live?.booking.arrivalVerifiedAt != nil
        }
    }

    private var addressText: String? {
        live?.booking.address?.oneLine ?? revealedAddress.map(\.oneLine)
    }

    private var addressCoordinate: CLLocationCoordinate2D? {
        guard let a = live?.booking.address, let lat = a.lat, let lng = a.lng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private var stepIndex: Int {
        switch dayStatus {
        case nil, .unknown: return 0
        case .en_route: return 1
        case .arrived: return 2
        case .in_progress: return 3
        case .awaiting_checkout: return 4
        case .completed: return 5
        }
    }

    private var stepTitle: String {
        switch dayStatus {
        case nil, .unknown: return "Ready when you are"
        case .en_route: return "On the way"
        case .arrived: return "On site"
        case .in_progress: return "Cleaning"
        case .awaiting_checkout: return "Wrap up"
        case .completed: return "Complete"
        }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                headerCard
                progressCard
                if isLoading {
                    SkeletonBlock(height: 180)
                } else if loadFailed && live == nil {
                    SweeprCard {
                        SweeprErrorState(
                            message: "Couldn't load this job. Check your connection and try again.",
                            onRetry: { Task { await refresh() } }
                        )
                    }
                } else {
                    stageCards
                }
            }
            .padding(SweeprSpacing.md)
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle(job.packageDisplayName)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task { await refresh() }
        .onDisappear {
            revealTask?.cancel()
            pingTask?.cancel()
        }
        .sheet(isPresented: Binding(
            get: { captureFor != nil },
            set: { if !$0 { captureFor = nil } }
        )) {
            PhotoCaptureSheet { data in
                if let phase = captureFor {
                    Task { await uploadPhoto(data, phase: phase) }
                }
            }
        }
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
                        Text(job.packageDisplayName)
                            .font(SweeprFont.title())
                            .foregroundColor(.white)
                    }
                    Spacer(minLength: 0)
                    SweeprBadge(stepTitle, tone: .neutral)
                }
                HStack(spacing: SweeprSpacing.lg) {
                    if let payout = job.payoutMoney {
                        headerStat(icon: "dollarsign.circle.fill", value: payout.dollarsString, label: "Your payout")
                    }
                    if let when = job.scheduledAt {
                        headerStat(icon: "clock.fill", value: when.formatted(date: .omitted, time: .shortened), label: "Scheduled")
                    }
                    headerStat(icon: "house.fill", value: job.homeSummary, label: "Home")
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

            if let coord = addressCoordinate {
                MapPreview(
                    coordinate: coord,
                    systemIcon: "house.fill",
                    title: "Job location",
                    height: 130,
                    cornerRadius: 0
                )
            }

            HStack(spacing: SweeprSpacing.sm) {
                Image(systemName: addressText == nil ? "mappin.and.ellipse" : "mappin.circle.fill")
                    .foregroundColor(SweeprColor.brand)
                Text(addressText ?? "\(job.areaLabel) — address unlocks when you start your route")
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

    private var progressCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack {
                    Text(stepTitle)
                        .font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("Step \(stepIndex + 1) of 6")
                        .font(SweeprFont.footnote())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                SweeprProgressBar(value: Double(stepIndex) / 5.0)
            }
        }
    }

    // MARK: - Stage cards

    @ViewBuilder private var stageCards: some View {
        switch dayStatus {
        case nil, .unknown:
            startRouteCard
        case .en_route:
            enRouteCard
        case .arrived:
            smartEntrySection
            photosCard(phase: .before)
            startCleanCard
        case .in_progress:
            guideCard
            photosCard(phase: .after)
            finishCleanCard
        case .awaiting_checkout:
            secureDoorCard
            checkoutCard
        case .completed:
            doneCard
        }
    }

    private var startRouteCard: some View {
        stepShell(icon: "car.fill", title: "Start your route") {
            Text("Starting your route reveals the exact address and lets the customer track your arrival.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton("Start route", systemIcon: "car.fill", isLoading: isActing) {
                Task { await startRoute() }
            }
            .disabled(isActing)
        }
    }

    private var enRouteCard: some View {
        stepShell(icon: "location.fill", title: "Heading there") {
            if let addressText {
                Text(addressText).font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton("Open in Maps", style: .secondary, systemIcon: "arrow.triangle.turn.up.right.diamond.fill") {
                    if let coord = addressCoordinate {
                        SweeprMaps.openInMaps(latitude: coord.latitude, longitude: coord.longitude, label: "Job")
                    } else {
                        SweeprMaps.openInMaps(address: addressText)
                    }
                }
            }
            SweeprDivider()
            HStack(spacing: SweeprSpacing.sm) {
                ProgressView()
                Text("We check you in automatically when you're within 150 m of the property.")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            }
            if let hint = lastPingDistanceHint {
                Text(hint).font(SweeprFont.footnote()).foregroundColor(SweeprColor.amber)
            }
            SweeprButton("I'm here — check me in", systemIcon: "mappin.circle.fill", isLoading: isActing) {
                Task { await pingLocation(manual: true) }
            }
            .disabled(isActing)
        }
    }

    // Smart Entry — backend-driven reveal + TapToUnlock, only once checked in.
    @ViewBuilder private var smartEntrySection: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    Label("Getting in", systemImage: "key.fill")
                        .font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    SweeprBadge("Checked in", tone: .success)
                }

                if credentialRevealed, let cred = credential {
                    VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                        Text(cred.credential)
                            .font(SweeprFont.mono(size: 38))
                            .foregroundColor(SweeprColor.textPrimary)
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
                    Text("Access details stay hidden until you reveal them at the door. Revealing takes a quick identity check.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    SweeprButton(isRevealing ? "Verifying…" : "Reveal access", style: .secondary, systemIcon: "eye.fill", isLoading: isRevealing) {
                        revealCredential()
                    }
                    .disabled(isRevealing)
                }

                if !accessCodes.isEmpty {
                    ForEach(Array(accessCodes.enumerated()), id: \.offset) { _, code in
                        if let notes = code.notes {
                            HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                                Image(systemName: "note.text").foregroundColor(SweeprColor.brand)
                                Text(notes).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                            }
                        }
                    }
                }

                SweeprDivider()

                // Deliberate press-and-hold remote unlock (Seam, server-side).
                TapToUnlock(isEnabled: isCheckedIn && !isDoorUnlocked) {
                    await performUnlock()
                }

                HStack(spacing: 4) {
                    Image(systemName: "lock.shield").font(.system(size: 11))
                    Text("Powered by Seam · every unlock is logged")
                }
                .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    private func photosCard(phase: PhotoPhase) -> some View {
        let count = phase == .before ? beforeCount : afterCount
        return stepShell(
            icon: "camera.fill",
            title: phase == .before ? "Before photos" : "After photos"
        ) {
            Text("Capture at least \(requiredPhotos). They upload to secure storage and are required before checkout.")
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

            HStack(spacing: SweeprSpacing.md) {
                ForEach(0..<max(count, requiredPhotos), id: \.self) { i in
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(i < count ? SweeprColor.seafoam100 : SweeprColor.surface)
                        .frame(width: 64, height: 64)
                        .overlay(
                            Image(systemName: i < count ? "checkmark.circle.fill" : "camera")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(i < count ? SweeprColor.brand : SweeprColor.separator)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(SweeprColor.separator, lineWidth: i < count ? 0 : 1)
                        )
                }
            }

            HStack {
                Text("\(count)/\(requiredPhotos) uploaded")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                Spacer()
                if count >= requiredPhotos {
                    SweeprBadge("Ready", tone: .success)
                }
            }

            SweeprButton(
                isUploadingPhoto ? "Uploading…" : "Take photo",
                style: count >= requiredPhotos ? .secondary : .primary,
                systemIcon: "camera.fill",
                isLoading: isUploadingPhoto
            ) {
                captureFor = phase
            }
            .disabled(isUploadingPhoto)
        }
    }

    private var startCleanCard: some View {
        stepShell(icon: "play.fill", title: "Start cleaning") {
            Text("Starting the clean releases any entry codes and starts the service clock.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton("Start cleaning", systemIcon: "play.fill", isLoading: isActing) {
                Task { await startClean() }
            }
            .disabled(isActing)
        }
    }

    private var guideCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack {
                    Text("Your working guide").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text("\(Int(guideProgress * 100))%")
                        .font(SweeprFont.caption().weight(.semibold)).foregroundColor(SweeprColor.brand)
                }
                Text("A local checklist built from this home's scope — for your own pacing. Checkout is gated by photos, not this list.")
                    .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                SweeprProgressBar(value: guideProgress)
                ForEach($guide) { $room in
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
            }
        }
    }

    private var guideProgress: Double {
        let total = guide.reduce(0) { $0 + $1.items.count }
        guard total > 0 else { return 0 }
        let done = guide.reduce(0) { $0 + $1.items.filter(\.done).count }
        return Double(done) / Double(total)
    }

    private var finishCleanCard: some View {
        stepShell(icon: "flag.checkered", title: "Finish cleaning") {
            Text("Done with the clean? This moves you to checkout — after photos and the door check happen there.")
                .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
            SweeprButton("Finish cleaning", systemIcon: "flag.checkered", isLoading: isActing) {
                Task { await finishClean() }
            }
            .disabled(isActing)
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
        }
    }

    private var checkoutCard: some View {
        stepShell(icon: "checkmark.seal.fill", title: "Checkout") {
            if beforeCount < requiredPhotos || afterCount < requiredPhotos {
                HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundColor(SweeprColor.amber)
                    Text("You still need \(max(0, requiredPhotos - beforeCount)) before and \(max(0, requiredPhotos - afterCount)) after photos to check out.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                photoBackfillButtons
            }
            if checkoutPhotoKey == nil {
                Text("Last step: one checkout photo of the secured door / entry area.")
                    .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                SweeprButton(
                    isUploadingPhoto ? "Uploading…" : "Take checkout photo",
                    style: .secondary, systemIcon: "camera.fill", isLoading: isUploadingPhoto
                ) {
                    captureFor = .checkout
                }
                .disabled(isUploadingPhoto)
            } else {
                HStack(spacing: SweeprSpacing.sm) {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(SweeprColor.brand)
                    Text("Checkout photo captured").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                }
            }
            if let payout = job.payoutMoney {
                HStack {
                    Text("Your payout").font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                    Spacer()
                    Text(payout.dollarsString).font(SweeprFont.heading()).foregroundColor(SweeprColor.brand)
                }
            }
            SweeprButton("Complete job", systemIcon: "checkmark.seal.fill", isLoading: isActing) {
                Task { await completeJob() }
            }
            .disabled(isActing || checkoutPhotoKey == nil)
        }
    }

    private var photoBackfillButtons: some View {
        HStack(spacing: SweeprSpacing.sm) {
            if beforeCount < requiredPhotos {
                SweeprButton("Add before", style: .secondary, systemIcon: "camera") {
                    captureFor = .before
                }
            }
            if afterCount < requiredPhotos {
                SweeprButton("Add after", style: .secondary, systemIcon: "camera") {
                    captureFor = .after
                }
            }
        }
    }

    private var doneCard: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundColor(SweeprColor.brand)
                Text("Job complete").font(SweeprFont.heading()).foregroundColor(SweeprColor.textPrimary)
                Text("Nice work. Your payout processes after the platform review window.")
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

    // MARK: - Server actions (authoritative — failures never advance the UI)

    private func refresh() async {
        do {
            live = try await env.cleanerAPI.liveStatus(bookingId: job.id)
            loadFailed = false
            if let codes = live?.booking.accessCodes, !codes.isEmpty {
                accessCodes = codes
            }
            if guide.isEmpty {
                guide = CleaningGuide.build(
                    bedrooms: job.bedrooms,
                    bathrooms: job.bathrooms,
                    deepClean: live?.booking.deepCleanApplied ?? false
                )
            }
            if dayStatus == .en_route { startArrivalPinging() }
        } catch {
            loadFailed = true
        }
        isLoading = false
    }

    private func startRoute() async {
        isActing = true
        defer { isActing = false }
        SweeprHaptics.impact(.medium)
        do {
            let fix = await currentDeviceFix()
            let resp = try await env.cleanerAPI.startRoute(
                bookingId: job.id, lat: fix?.latitude, lng: fix?.longitude
            )
            revealedAddress = resp.address
            SweeprHaptics.notify(.success)
            await refresh()
            startArrivalPinging()
        } catch {
            surfaceServerDenial(error, fallback: "Couldn't start the route — try again closer to the appointment window.")
        }
    }

    /// Pings the server with the device position; within 150 m the SERVER
    /// flips day_status to arrived.
    private func pingLocation(manual: Bool) async {
        if manual { isActing = true }
        defer { if manual { isActing = false } }
        guard let fix = await currentDeviceFix() else {
            if manual {
                env.toasts.show("Turn on location access so we can check you in.", kind: .warning)
            }
            return
        }
        do {
            let resp = try await env.cleanerAPI.sendLocation(
                bookingId: job.id, lat: fix.latitude, lng: fix.longitude,
                accuracyMeters: fix.accuracyMeters
            )
            if resp.arrivalVerified == true {
                pingTask?.cancel()
                SweeprHaptics.notify(.success)
                env.toasts.show("Checked in — you're on site.", kind: .success)
                lastPingDistanceHint = nil
                await refresh()
            } else if manual {
                lastPingDistanceHint = "Not quite there yet — check-in unlocks within 150 m of the property."
                SweeprHaptics.notify(.warning)
            }
        } catch {
            if manual {
                surfaceServerDenial(error, fallback: "Couldn't send your location — try again.")
            }
        }
    }

    private func startArrivalPinging() {
        guard pingTask == nil || pingTask?.isCancelled == true else { return }
        pingTask = Task {
            while !Task.isCancelled {
                await pingLocation(manual: false)
                if dayStatus != .en_route { return }
                try? await Task.sleep(nanoseconds: 25_000_000_000) // 25s
            }
        }
    }

    private func startClean() async {
        isActing = true
        defer { isActing = false }
        SweeprHaptics.impact(.medium)
        do {
            let resp = try await env.cleanerAPI.startClean(bookingId: job.id)
            accessCodes = resp.accessCodes ?? accessCodes
            SweeprHaptics.notify(.success)
            await refresh()
        } catch {
            surfaceServerDenial(error, fallback: "Couldn't start — make sure you're checked in at the property.")
        }
    }

    private func finishClean() async {
        isActing = true
        defer { isActing = false }
        SweeprHaptics.impact(.medium)
        do {
            _ = try await env.cleanerAPI.finishClean(bookingId: job.id)
            SweeprHaptics.notify(.success)
            await refresh()
        } catch {
            surfaceServerDenial(error, fallback: "Couldn't finish the clean — try again.")
        }
    }

    private func completeJob() async {
        guard let key = checkoutPhotoKey else { return }
        isActing = true
        defer { isActing = false }
        SweeprHaptics.impact(.heavy)
        do {
            _ = try await env.cleanerAPI.completeJob(bookingId: job.id, checkoutPhotoKey: key)
            SweeprHaptics.notify(.success)
            env.activeJob = nil
            await refresh()
        } catch {
            surfaceServerDenial(error, fallback: "Couldn't complete — check the photo requirements above.")
        }
    }

    // MARK: - Photos

    private enum PhotoPhase: String { case before, after, checkout }

    private func uploadPhoto(_ data: Data, phase: PhotoPhase) async {
        captureFor = nil
        isUploadingPhoto = true
        defer { isUploadingPhoto = false }
        do {
            let signed = try await env.cleanerAPI.signPhotoUpload(
                bookingId: job.id,
                fileName: "\(phase.rawValue)-\(Int(Date().timeIntervalSince1970)).jpg",
                contentType: "image/jpeg",
                sizeBytes: data.count
            )
            try await env.cleanerAPI.uploadPhotoData(data, to: signed)
            try await env.cleanerAPI.recordPhoto(
                bookingId: job.id, photoType: phase.rawValue, storageKey: signed.storageKey
            )
            if phase == .checkout { checkoutPhotoKey = signed.storageKey }
            SweeprHaptics.notify(.success)
            await refresh()
        } catch {
            SweeprHaptics.notify(.error)
            surfaceServerDenial(error, fallback: "Photo upload failed — try again.")
        }
    }

    // MARK: - Smart Entry actions

    private func smartEntryLocation(reauthenticated: Bool) async -> CleanerAPI.SmartEntryLocation {
        let fix = await currentDeviceFix()
        let lat = fix?.latitude ?? live?.booking.address?.lat ?? 0
        let lng = fix?.longitude ?? live?.booking.address?.lng ?? 0
        return .now(
            latitude: lat,
            longitude: lng,
            accuracyMeters: fix?.accuracyMeters ?? 50,
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
                let location = await smartEntryLocation(reauthenticated: true)
                let cred = try await env.cleanerAPI.revealAccessCredential(
                    bookingId: job.id, location: location
                )
                credential = cred
                credentialRevealed = true
                SweeprHaptics.notify(.success)
                startAutoHideTimer(seconds: cred.displaySeconds)
            } catch {
                // The server said no (not checked in, no credential, out of
                // reveals). NEVER substitute a credential from anywhere else.
                surfaceServerDenial(error, fallback: "Access isn't available yet — confirm you're checked in at the property.")
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

    private func performUnlock() async -> Bool {
        do {
            let location = await smartEntryLocation(reauthenticated: true)
            let result = try await env.cleanerAPI.unlockDoor(bookingId: job.id, location: location)
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
                let location = await smartEntryLocation(reauthenticated: false)
                let result = try await env.cleanerAPI.lockDoor(bookingId: job.id, location: location)
                if result.succeeded {
                    isDoorSecured = true
                    env.toasts.show("Door secured", kind: .success)
                } else {
                    // Provider failure — the cleaner confirms the physical
                    // door instead; don't block checkout on a Seam blip.
                    isDoorSecured = true
                    env.toasts.show(result.message ?? "Couldn't confirm remotely — please check the door by hand.", kind: .warning)
                }
            } catch {
                env.toasts.show("Lock command not authorized.", kind: .error)
            }
            isSecuringDoor = false
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

    // MARK: - Error surfacing

    /// Show the server's own denial message when it sent one; the machine's
    /// guards are the product truth, not something to paper over.
    private func surfaceServerDenial(_ error: Error, fallback: String) {
        SweeprHaptics.notify(.error)
        if let apiError = error as? SweeprAPIError {
            if case let .http(_, body) = apiError {
                struct E: Decodable { let error: String?; let message: String? }
                if let parsed = try? JSONDecoder().decode(E.self, from: Data(body.utf8)),
                   let message = parsed.message ?? parsed.error {
                    env.toasts.show(message.replacingOccurrences(of: "_", with: " "), kind: .warning)
                    return
                }
            }
            if case .unauthorized = apiError {
                env.toasts.show("Not authorized for that yet — check your step.", kind: .warning)
                return
            }
        }
        env.toasts.show(fallback, kind: .error)
    }
}

#if DEBUG
struct JobDetailScreen_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            JobDetailScreen(job: CleanerMock.job()).environmentObject(AppEnvironment.preview)
        }
    }
}
#endif
