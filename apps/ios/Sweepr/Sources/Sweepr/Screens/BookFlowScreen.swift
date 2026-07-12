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
// from the server — the client never computes totals.
public struct BookFlowScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0
    @State private var draft = BookingDraft()
    @State private var quote: QuoteResponse?
    @State private var smartEntry: SmartEntryStatus?
    @State private var isWorking = false

    private let stepTitles = [
        "Address", "Your home", "Package", "Add-ons", "Schedule", "Access", "Review"
    ]

    public init() {}

    private var isLastStep: Bool { step == stepTitles.count - 1 }

    public var body: some View {
        VStack(spacing: 0) {
            progressBar
            ScrollView {
                VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                    Text(stepTitles[step]).font(SweeprFont.title())
                        .foregroundColor(SweeprColor.textPrimary)
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
        .task { smartEntry = (try? await env.api.smartEntryStatus()) ?? SweeprMock.smartEntryStatus }
    }

    // MARK: - Progress

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(SweeprColor.separator).frame(height: 6)
                Capsule().fill(SweeprColor.brand)
                    .frame(width: geo.size.width * CGFloat(step + 1) / CGFloat(stepTitles.count), height: 6)
                    .animation(.spring(response: 0.4, dampingFraction: 0.8), value: step)
            }
        }
        .frame(height: 6)
        .padding(.horizontal, SweeprSpacing.md)
        .padding(.top, SweeprSpacing.sm)
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
            fieldCard("Street address", text: $draft.street, placeholder: "1200 Market St")
            fieldCard("Unit (optional)", text: $draft.unit, placeholder: "Apt 4B")
            HStack(spacing: SweeprSpacing.md) {
                fieldCard("City", text: $draft.city, placeholder: "Denver")
                fieldCard("ZIP", text: $draft.zip, placeholder: "80202")
            }
        }
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
            Text("Add extra scope. Included items are handled automatically.")
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

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: SweeprSpacing.md) {
            summaryCard
            quoteCard
            payStub
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
        SweeprCard {
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
                    Divider().background(SweeprColor.separator)
                    HStack {
                        Text("Total").font(SweeprFont.body().weight(.semibold))
                        Spacer()
                        Text(q.totalMoney.dollarsString).font(SweeprFont.heading())
                    }
                    .foregroundColor(SweeprColor.textPrimary)
                    Text("Authorized now, charged after your cleaning.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                } else {
                    SkeletonBlock(height: 20)
                    SkeletonBlock(height: 20)
                    SkeletonBlock(height: 28)
                }
            }
        }
    }

    private var payStub: some View {
        SweeprCard {
            HStack(spacing: SweeprSpacing.md) {
                Image(systemName: "creditcard.fill").foregroundColor(SweeprColor.brand)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Visa •••• 4242").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.textPrimary)
                    Text("Manual capture — pay after service").font(SweeprFont.caption())
                        .foregroundColor(SweeprColor.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundColor(SweeprColor.textSecondary)
            }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        HStack(spacing: SweeprSpacing.md) {
            if step > 0 {
                SweeprButton("Back", style: .secondary) {
                    SweeprHaptics.selection()
                    withAnimation { step -= 1 }
                }
            }
            SweeprButton(isLastStep ? "Confirm & pay" : "Continue") {
                Task { await advance() }
            }
        }
        .padding(SweeprSpacing.md)
        .background(SweeprColor.surface.ignoresSafeArea(edges: .bottom))
        .disabled(isWorking)
    }

    // MARK: - Flow

    private func advance() async {
        SweeprHaptics.impact(.medium)
        if isLastStep {
            await submit()
            return
        }
        withAnimation { step += 1 }
        if step == stepTitles.count - 1 {
            await fetchQuote()
        }
    }

    private func fetchQuote() async {
        quote = nil
        do {
            quote = try await env.api.quote(draft.toQuoteRequest())
        } catch {
            quote = SweeprMock.quoteResponse
            env.toast.show("Showing an estimate — sign in for live pricing", kind: .warning)
        }
    }

    private func submit() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let booking = try await env.api.createBooking(draft.toQuoteRequest())
            await env.bookingStore.refresh()
            SweeprHaptics.notify(.success)
            env.toast.show("Booked! We're finding your cleaner.", kind: .success)
            _ = booking
            dismiss()
        } catch {
            SweeprHaptics.notify(.error)
            env.toast.show("Couldn't complete booking — try again", kind: .error)
        }
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
            Spacer()
            Text(value).font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                .multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - Draft model (client-side wizard state; pricing stays server-side)

struct BookingDraft {
    var street = ""
    var unit = ""
    var city = ""
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
