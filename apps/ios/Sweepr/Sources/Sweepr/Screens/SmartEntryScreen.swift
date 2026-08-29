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

// Smart Entry — the customer's access preference + consent for one booking.
// Setting Smart Entry carries the $5 fee (or free with Sweepr+) and requires an
// explicit authorization before we provision a time-boxed Seam unlock. Any code
// the customer supplies (keypad / lockbox) stays behind a deliberate reveal
// guard and is never shown by default.
public struct SmartEntryScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String

    @State private var selected: AccessMethod
    @State private var status: SmartEntryStatus?
    @State private var authorized = false
    @State private var isWorking = false
    @State private var code = ""
    @State private var codeRevealed = false

    public init(bookingId: String, initialAccess: BookingAccessAuthorization?) {
        self.bookingId = bookingId
        _selected = State(initialValue: initialAccess?.method ?? .home)
        _authorized = State(initialValue: initialAccess?.isSmartEntryProvisioned ?? false)
    }

    private var isCodeMethod: Bool { selected == .keypad_code || selected == .lockbox }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Choose how your cleaner gets in for this cleaning. You're in control — "
                     + "nothing is shared until you authorize it.")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

                ForEach(AccessMethod.allCases, id: \.self) { method in
                    SweeprChoiceRow(
                        title: method.displayName,
                        subtitle: method == .smart_entry ? "Remote unlock via Seam" : nil,
                        systemIcon: method.systemIcon,
                        trailing: method == .smart_entry ? status?.feeLabel : nil,
                        isSelected: selected == method
                    ) {
                        selected = method
                        codeRevealed = false
                    }
                }

                if selected == .smart_entry {
                    smartEntryDetail
                } else if isCodeMethod {
                    codeDetail
                }

                SweeprButton(isWorking ? "Saving…" : "Save access method", isLoading: isWorking) {
                    Task { await save() }
                }
                .disabled(isWorking || (selected == .smart_entry && !authorized))
            }
            .padding(SweeprSpacing.md)
        }
        .scrollIndicators(.hidden)
        .background(SweeprColor.background.ignoresSafeArea())
        .navigationTitle("Access")
        .navigationBarTitleDisplayMode(.inline)
        .task { status = (try? await env.api.smartEntryStatus()) ?? SweeprMock.smartEntryStatus }
    }

    private var smartEntryDetail: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                    Image(systemName: "lock.open.rotation").foregroundColor(SweeprColor.brand)
                    Text("We provision a one-time, time-boxed unlock through Seam. Your permanent "
                         + "code or smart-lock credentials are never shared with the cleaner.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                SweeprDivider()
                HStack {
                    Text(status?.includedWithMembership == true ? "Included with Sweepr+"
                         : "Fee for this cleaning")
                        .font(SweeprFont.body()).foregroundColor(SweeprColor.textPrimary)
                    Spacer()
                    Text(status?.feeLabel ?? "$5").font(SweeprFont.body().weight(.semibold))
                        .foregroundColor(SweeprColor.brand)
                }
                Toggle("I authorize Smart Entry for this cleaning", isOn: $authorized)
                    .tint(SweeprColor.brand)
                    .font(SweeprFont.caption())
                    .foregroundColor(SweeprColor.textPrimary)
            }
        }
    }

    // Deliberate reveal guard: the code field stays hidden until the customer
    // taps to reveal, mirroring the cleaner-side reveal-unlock discipline.
    private var codeDetail: some View {
        SweeprCard(elevation: .low) {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                    Image(systemName: "number").foregroundColor(SweeprColor.brand)
                    Text("Add the code your cleaner should use. It's stored securely and only "
                         + "released to the assigned cleaner near check-in.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
                if codeRevealed {
                    TextField("Entry code", text: $code)
                        .padding(SweeprSpacing.md)
                        .background(SweeprColor.background)
                        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous)
                                .stroke(SweeprColor.separator, lineWidth: 1)
                        )
                    Button(action: {
                        SweeprHaptics.selection()
                        withAnimation(SweeprMotion.snappy) { codeRevealed = false }
                    }) {
                        HStack(spacing: SweeprSpacing.sm) {
                            Image(systemName: "eye.slash")
                            Text("Hide code").font(SweeprFont.caption().weight(.semibold))
                        }
                        .foregroundColor(SweeprColor.textSecondary)
                    }
                    .buttonStyle(.plain)
                } else {
                    Button(action: {
                        SweeprHaptics.impact(.light)
                        withAnimation(SweeprMotion.snappy) { codeRevealed = true }
                    }) {
                        HStack(spacing: SweeprSpacing.sm) {
                            Image(systemName: "lock.fill")
                            Text(code.isEmpty ? "Tap to add an entry code" : "•••• — tap to edit")
                                .font(SweeprFont.body().weight(.semibold))
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
                        }
                        .foregroundColor(SweeprColor.brand)
                        .padding(SweeprSpacing.md)
                        .frame(maxWidth: .infinity)
                        .background(SweeprColor.seafoam100)
                        .clipShape(RoundedRectangle(cornerRadius: SweeprRadius.button, style: .continuous))
                    }
                    .buttonStyle(SweeprPressableButtonStyle())
                    .accessibilityLabel("Reveal entry code field")
                }
            }
        }
    }

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let req = SetBookingAccessRequest(
            method: selected,
            secretValue: (isCodeMethod && !trimmedCode.isEmpty) ? trimmedCode : nil,
            authorize: selected == .smart_entry ? authorized : nil
        )
        do {
            let resp = try await env.api.setBookingAccess(bookingId: bookingId, req)
            if let fee = resp.fee, fee.cents > 0 {
                env.toast.show("Smart Entry set — \(fee.dollarsString) added", kind: .success)
            } else {
                env.toast.show("Access method saved", kind: .success)
            }
        } catch {
            env.toast.show("Couldn't save access method", kind: .error)
        }
    }
}
