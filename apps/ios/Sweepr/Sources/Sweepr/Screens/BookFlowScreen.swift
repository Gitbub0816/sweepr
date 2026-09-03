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

// The booking wizard, mirroring apps/customer/src/booking/. Steps:
// address → home details → package/level → add-ons → schedule → access method
// → review (server quote) → pay. The quote and the final charge always come
// from the server — the client NEVER computes totals. Premium chrome: a labeled
// progress bar, per-step validation, animated step transitions, and a sticky
// summary/total on the footer once a quote lands.
public struct BookFlowScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0
    @State private var draft = BookingDraft()
    @State private var quote: QuoteResponse?
    @State private var quoteError: String?
    @State private var smartEntry: SmartEntryStatus?
    @State private var isWorking = false

    // Address selection (server-side rule: bookings should carry an addressId
    // the cleaner can be routed to).
    @State private var savedAddresses: [CustomerAddress] = []
    @State private var selectedAddressId: String?

    // Payment hand-off: after the booking is created, the hosted pay page
    // (Stripe Elements, Apple Pay in Safari) confirms the manual-capture
    // intent while we poll /payments/intent-status.
    @State private var payingBookingId: String?
    @State private var paymentConfirmed = false
    @State private var paymentPollTask: Task<Void, Never>?

    private let stepTitles = [
        "Address", "Your home", "Package", "Add-ons", "Schedule", "Access", "Review"
    ]
    private let stepSubtitles = [
        "Where are we cleaning?",
        "Tell us about the space.",
        "Pick a package and level.",
        "Add any extra scope.",
        "Choose a date and time.",
        "How should we get in?",
        "Review your server-priced quote.",
    ]

    public init() {}

    private var isLastStep: Bool { step == stepTitles.count - 1 }

    public var body: some View {
        VStack(spacing: 0) {
            progressHeader
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
                        Text(stepTitles[step]).font(SweeprFont.title())
                            .foregroundColor(SweeprColor.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        Text(stepSubtitles[step]).font(SweeprFont.body())
                            .foregroundColor(SweeprColor.textSecondary)
                    }
                    stepContent
                        .transition(.asymmetric(
                            insertion: .move(edge: .trailing).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        ))
                        .id(step)
                }
                .padding(SweeprSpacing.md)
            }
            .scrollIndicators(.hidden)
            footer
        }
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Book")
        .navigationBarTitleDisplayMode(.inline)
        .task { smartEntry = try? await env.api.smartEntryStatus() }
        .onDisappear { paymentPollTask?.cancel() }
    }

    // MARK: - Progress

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
            HStack {
                Text("Step \(step + 1) of \(stepTitles.count)")
                    .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                Spacer()
                Text(stepTitles[step].uppercased())
                    .font(SweeprFont.footnote()).foregroundColor(SweeprColor.brand)
            }
            SweeprProgressBar(value: Double(step + 1) / Double(stepTitles.count), height: 6)
        }
        .padding(.horizontal, SweeprSpacing.md)
        .padding(.top, SweeprSpacing.sm)
        .padding(.bottom, SweeprSpacing.sm)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(step + 1) of \(stepTitles.count), \(stepTitles[step])")
    }

    // MARK: - Step content

    @ViewBuilder private var stepContent: some View {
        switch step {
        case 0: addressStep
        case 1: homeStep
        case 2: packageStep
        case 3: addOnsStep
        case 4: scheduleStep
        case 5: accessStep
        default: reviewStep
        }
    }

    private var addressStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            if !savedAddresses.isEmpty {
                SweeprSectionTitle("Saved addresses")
                ForEach(savedAddresses) { addr in
                    SweeprChoiceRow(
                        title: addr.label ?? addr.line1,
                        subtitle: addr.oneLine,
                        systemIcon: "house.fill",
                        isSelected: selectedAddressId == addr.id
                    ) {
                        selectedAddressId = selectedAddressId == addr.id ? nil : addr.id
                    }
                }
                SweeprSectionTitle(selectedAddressId == nil ? "Or add a new address" : "New address")
            }
            if selectedAddressId == nil {
                fieldCard("Street address", text: $draft.street, placeholder: "1200 Market St")
                fieldCard("Unit (optional)", text: $draft.unit, placeholder: "Apt 4B")
                HStack(spacing: SweeprSpacing.md) {
                    fieldCard("City", text: $draft.city, placeholder: "Denver")
                    fieldCard("State", text: $draft.state, placeholder: "CO")
                }
                fieldCard("ZIP", text: $draft.zip, placeholder: "80202")
            }
        }
        .task { savedAddresses = (try? await env.api.addresses()) ?? [] }
    }

    private var homeStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            stepperCard("Bedrooms", value: $draft.bedrooms, range: 0...10)
            stepperCard("Bathrooms", value: $draft.bathrooms, range: 0...10)
            stepperCard("Square feet (×100)", value: $draft.sqftHundreds, range: 1...200, step: 1, format: { "\($0 * 100)" })
            SweeprSectionTitle("Home type")
            ForEach(HomeType.allCases, id: \.self) { type in
                SweeprChoiceRow(title: type.displayName, isSelected: draft.homeType == type) {
                    draft.homeType = type
                }
            }
            toggleCard("Pets in the home", isOn: $draft.hasPets)
            toggleCard("Heavier mess than usual", isOn: $draft.heavyMess)
            toggleCard("Bring cleaning supplies", isOn: $draft.suppliesNeeded)
        }
    }

    private var packageStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            SweeprSectionTitle("Package")
            ForEach(ServicePackage.allCases, id: \.self) { pkg in
                SweeprChoiceRow(
                    title: pkg.displayName, subtitle: pkg.blurb,
                    systemIcon: pkg.systemIcon, isSelected: draft.serviceType == pkg
                ) { draft.serviceType = pkg }
            }
            SweeprSectionTitle("Cleaning level")
            ForEach([CleaningLevel.refresh, .extra_attention, .significant_attention], id: \.self) { level in
                SweeprChoiceRow(
                    title: level.displayLabel,
                    subtitle: levelBlurb(level),
                    isSelected: draft.cleaningLevel == level
                ) { draft.cleaningLevel = level }
            }
        }
    }

    private var addOnsStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            Text("Add extra scope. Package-included items are handled automatically.")
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            ForEach(BookingDraft.addOnCatalogue, id: \.key) { item in
                SweeprChoiceRow(
                    title: item.label, systemIcon: "plus.circle",
                    isSelected: draft.addOnKeys.contains(item.key)
                ) {
                    if draft.addOnKeys.contains(item.key) {
                        draft.addOnKeys.removeAll { $0 == item.key }
                    } else {
                        draft.addOnKeys.append(item.key)
                    }
                }
            }
        }
    }

    private var scheduleStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            SweeprCard {
                DatePicker(
                    "When",
                    selection: $draft.scheduledAt,
                    in: Date()...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .datePickerStyle(.graphical)
                .tint(SweeprColor.brand)
            }
        }
    }

    private var accessStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            Text("How should your cleaner get in?")
                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            ForEach(AccessMethod.allCases, id: \.self) { method in
                SweeprChoiceRow(
                    title: method.displayName,
                    subtitle: method == .smart_entry ? smartEntrySubtitle : nil,
                    systemIcon: method.systemIcon,
                    trailing: method == .smart_entry ? (smartEntry?.feeLabel) : nil,
                    isSelected: draft.accessMethod == method
                ) { draft.accessMethod = method }
            }
            if draft.accessMethod == .smart_entry {
                SweeprCard {
                    HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                        Image(systemName: "lock.open.rotation").foregroundColor(SweeprColor.brand)
                        Text("Smart Entry provisions a one-time, time-boxed unlock through "
                             + "Seam — your code or smart lock is never shared directly. "
                             + (smartEntry?.includedWithMembership == true
                                ? "Included with your Sweepr+ membership."
                                : "A \(smartEntry?.fee.dollarsString ?? "$5") fee applies, or it's free with Sweepr+."))
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                }
            }
        }
    }

    @ViewBuilder private var reviewStep: some View {
        if let bookingId = payingBookingId {
            paymentPendingCard(bookingId)
        } else {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                summaryCard
                quoteCard
                paymentInfoCard
            }
        }
    }

    /// Shown after the booking is created while the hosted pay page confirms.
    private func paymentPendingCard(_ bookingId: String) -> some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                if paymentConfirmed {
                    HStack(spacing: SweeprSpacing.sm) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 28)).foregroundColor(SweeprColor.brand)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("You're booked!").font(SweeprFont.heading())
                                .foregroundColor(SweeprColor.textPrimary)
                            Text("Payment authorized — you're charged after the cleaning.")
                                .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        }
                    }
                    SweeprButton("Done", systemIcon: "checkmark") {
                        finishAndClose()
                    }
                } else {
                    HStack(spacing: SweeprSpacing.sm) {
                        ProgressView()
                        Text("Finish paying in the secure Stripe window…")
                            .font(SweeprFont.body().weight(.semibold))
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                    Text("We opened your browser to confirm payment (Apple Pay works there too). This screen updates the moment it's done.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    SweeprButton("Reopen payment page", style: .secondary, systemIcon: "safari") {
                        Task { await openPaymentPage(bookingId: bookingId) }
                    }
                }
            }
        }
    }

    private var paymentInfoCard: some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 17, weight: .semibold)).foregroundColor(SweeprColor.brand)
                    .frame(width: 36, height: 36)
                    .background(SweeprColor.seafoam100)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pay securely with Stripe").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("Card or Apple Pay. Authorized now, charged after service.")
                        .font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var summaryCard: some View {
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                SweeprSectionTitle("Summary")
                reviewRow("Package", draft.serviceType.displayName)
                reviewRow("Level", draft.cleaningLevel.displayLabel)
                reviewRow("Home", "\(draft.bedrooms) bd · \(draft.bathrooms) ba · \(draft.sqftHundreds * 100) sqft")
                reviewRow("When", draft.scheduledAt.formatted(date: .abbreviated, time: .shortened))
                reviewRow("Access", draft.accessMethod.displayName)
                if !draft.addOnKeys.isEmpty {
                    reviewRow("Add-ons", "\(draft.addOnKeys.count) selected")
                }
            }
        }
    }

    @ViewBuilder private var quoteCard: some View {
        SweeprCard(elevation: .medium) {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                SweeprSectionTitle("Price")
                if let q = quote {
                    ForEach(q.price.lineItems) { item in
                        HStack {
                            Text(item.label).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                            Spacer()
                            Text(item.money.dollarsString).font(SweeprFont.body())
                                .foregroundColor(SweeprColor.textPrimary)
                        }
                    }
                    SweeprDivider()
                    HStack {
                        Text("Total").font(SweeprFont.body().weight(.semibold))
                        Spacer()
                        Text(q.totalMoney.dollarsString).font(SweeprFont.heading())
                    }
                    .foregroundColor(SweeprColor.textPrimary)
                    Text("Authorized now, charged after your cleaning.")
                        .font(SweeprFont.footnote()).foregroundColor(SweeprColor.textSecondary)
                } else if let quoteError {
                    HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(SweeprColor.amber)
                        Text(quoteError)
                            .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                    }
                    SweeprButton("Try pricing again", style: .secondary, systemIcon: "arrow.clockwise") {
                        Task { await fetchQuote() }
                    }
                } else {
                    SkeletonBlock(height: 18)
                    SkeletonBlock(height: 18)
                    SkeletonBlock(height: 18)
                    SkeletonBlock(height: 28)
                }
            }
        }
    }

    // MARK: - Footer

    @ViewBuilder private var footer: some View {
        if payingBookingId == nil {
            VStack(spacing: SweeprSpacing.sm) {
                if isLastStep, let q = quote {
                    HStack {
                        Text("Total due").font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                        Spacer()
                        Text(q.totalMoney.dollarsString).font(SweeprFont.heading())
                            .foregroundColor(SweeprColor.textPrimary)
                    }
                }
                HStack(spacing: SweeprSpacing.md) {
                    if step > 0 {
                        SweeprButton("Back", style: .secondary) {
                            SweeprHaptics.selection()
                            withAnimation(SweeprMotion.snappy) { step -= 1 }
                        }
                    }
                    SweeprButton(isLastStep ? "Confirm & pay" : "Continue", isLoading: isWorking) {
                        Task { await advance() }
                    }
                    .disabled(isWorking || !canContinue || (isLastStep && quote == nil))
                }
            }
            .padding(SweeprSpacing.md)
            .background(SweeprColor.surface.ignoresSafeArea(edges: .bottom))
        }
    }

    // MARK: - Validation

    private var canContinue: Bool {
        switch step {
        case 0:
            if selectedAddressId != nil { return true }
            return !draft.street.trimmed.isEmpty && !draft.city.trimmed.isEmpty
                && draft.state.trimmed.count == 2 && draft.zip.trimmed.count >= 5
        default:
            return true
        }
    }

    // MARK: - Flow

    private func advance() async {
        SweeprHaptics.impact(.medium)
        if isLastStep {
            await submit()
            return
        }
        withAnimation(SweeprMotion.snappy) { step += 1 }
        if step == stepTitles.count - 1 {
            await fetchQuote()
        }
    }

    /// Server-authoritative pricing. NEVER a fabricated fallback: a failure
    /// shows a retryable error and blocks confirm (the button needs a quote).
    private func fetchQuote() async {
        quote = nil
        quoteError = nil
        do {
            quote = try await env.api.quote(draft.toQuoteRequest())
        } catch {
            let code = (error as? SweeprAPIError)?.serverCode
            quoteError = code == "date_unavailable"
                ? "That date isn't available — pick another time."
                : "We couldn't price this clean. Check your connection and try again."
        }
    }

    /// Create (or reuse) the address → create the booking → hand off to the
    /// hosted Stripe page → poll until the manual-capture intent is authorized.
    private func submit() async {
        guard quote != nil else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            var request = draft.toQuoteRequest()
            if let selected = selectedAddressId {
                request.addressId = selected
            } else {
                request.addressId = try await env.api.createAddress(CreateAddressRequest(
                    street: draft.street.trimmed,
                    unit: draft.unit.trimmed.isEmpty ? nil : draft.unit.trimmed,
                    city: draft.city.trimmed,
                    state: draft.state.trimmed.uppercased(),
                    zip: draft.zip.trimmed,
                    makeDefault: savedAddresses.isEmpty ? true : nil
                ))
            }
            let booking = try await env.api.createBooking(request)
            withAnimation(SweeprMotion.smooth) { payingBookingId = booking.id }
            await openPaymentPage(bookingId: booking.id)
            startPaymentPolling(bookingId: booking.id)
        } catch {
            SweeprHaptics.notify(.error)
            let code = (error as? SweeprAPIError)?.serverCode
            switch code {
            case "address_unavailable":
                env.toast.show("We can't service that address yet.", kind: .warning)
            case "date_unavailable":
                env.toast.show("That date isn't available — pick another.", kind: .warning)
            case "manual_review_required":
                env.toast.show("This clean needs a custom quote — we'll reach out.", kind: .info)
            default:
                env.toast.show("Couldn't complete booking — try again", kind: .error)
            }
        }
    }

    private func openPaymentPage(bookingId: String) async {
        do {
            let grant = try await env.api.createBookingPaymentIntent(bookingId: bookingId)
            guard let secret = grant.clientSecret,
                  let url = PayPage.url(clientSecret: secret, kind: .booking,
                                        amountCents: grant.resolvedAmountCents) else {
                env.toast.show("Couldn't start payment — tap Reopen to retry.", kind: .error)
                return
            }
            SweeprExternal.open(url)
        } catch {
            env.toast.show("Couldn't start payment — tap Reopen to retry.", kind: .error)
        }
    }

    private func startPaymentPolling(bookingId: String) {
        paymentPollTask?.cancel()
        paymentPollTask = Task {
            for _ in 0..<100 { // ~5 minutes
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if Task.isCancelled { return }
                if let status = try? await env.api.bookingPaymentStatus(bookingId: bookingId), status.paid {
                    SweeprHaptics.notify(.success)
                    withAnimation(SweeprMotion.smooth) { paymentConfirmed = true }
                    await env.bookingStore.refresh()
                    return
                }
            }
        }
    }

    private func finishAndClose() {
        paymentPollTask?.cancel()
        env.toast.show("Booked! We're finding your cleaner.", kind: .success)
        dismiss()
    }

    // MARK: - Small builders

    private var smartEntrySubtitle: String {
        smartEntry?.includedWithMembership == true
            ? "Included with Sweepr+"
            : "Remote unlock via Seam"
    }

    private func levelBlurb(_ level: CleaningLevel) -> String {
        switch level {
        case .refresh: return "Standard labor, no surcharge."
        case .extra_attention: return "More time on high-use areas."
        case .significant_attention: return "Maximum effort for tough jobs."
        }
    }

    private func fieldCard(_ label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.xs) {
            Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            TextField(placeholder, text: text)
                .padding(SweeprSpacing.md)
                .background(SweeprColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                        .stroke(SweeprColor.separator, lineWidth: 1)
                )
        }
    }

    private func stepperCard(
        _ label: String, value: Binding<Int>, range: ClosedRange<Int>,
        step: Int = 1, format: ((Int) -> String)? = nil
    ) -> some View {
        SweeprCard {
            HStack {
                Text(label).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                Spacer()
                Stepper(
                    format?(value.wrappedValue) ?? "\(value.wrappedValue)",
                    value: value, in: range, step: step
                )
                .fixedSize()
            }
        }
    }

    private func toggleCard(_ label: String, isOn: Binding<Bool>) -> some View {
        SweeprCard {
            Toggle(label, isOn: isOn)
                .tint(SweeprColor.brand)
                .font(SweeprFont.body())
                .foregroundColor(SweeprColor.textPrimary)
        }
    }

    private func reviewRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
            Spacer(minLength: SweeprSpacing.md)
            Text(value).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                .multilineTextAlignment(.trailing)
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

// MARK: - Draft model (client-side wizard state; pricing stays server-side)

struct BookingDraft {
    var street = ""
    var unit = ""
    var city = ""
    var state = ""
    var zip = ""
    var bedrooms = 2
    var bathrooms = 1
    var sqftHundreds = 12        // 1200 sqft
    var homeType: HomeType = .apartment
    var serviceType: ServicePackage = .standard
    var cleaningLevel: CleaningLevel = .refresh
    var addOnKeys: [String] = []
    var scheduledAt = Date().addingTimeInterval(60 * 60 * 24)
    var accessMethod: AccessMethod = .home
    var hasPets = false
    var heavyMess = false
    var suppliesNeeded = false

    static let addOnCatalogue: [(key: String, label: String)] = [
        ("inside_fridge", "Inside fridge"),
        ("inside_oven", "Inside oven"),
        ("interior_windows", "Interior windows"),
        ("laundry", "Laundry & fold"),
        ("inside_cabinets", "Inside cabinets"),
    ]

    func toQuoteRequest() -> QuoteRequest {
        QuoteRequest(
            serviceType: serviceType,
            bedrooms: bedrooms,
            bathrooms: bathrooms,
            sqft: sqftHundreds * 100,
            homeType: homeType,
            hasPets: hasPets,
            heavyMess: heavyMess,
            suppliesNeeded: suppliesNeeded,
            addOnKeys: addOnKeys,
            scheduledAt: ISO8601DateFormatter().string(from: scheduledAt),
            cleaningLevel: cleaningLevel,
            addressId: nil,
            notes: nil
        )
    }
}
