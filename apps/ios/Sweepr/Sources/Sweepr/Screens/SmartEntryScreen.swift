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

// Smart Entry access-method picker for a specific booking. Setting Smart Entry
// carries the $5 fee (or free with Sweepr+) and requires explicit authorization
// before we provision a time-boxed unlock through Seam.
public struct SmartEntryScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    private let bookingId: String

    @State private var selected: AccessMethod
    @State private var status: SmartEntryStatus?
    @State private var authorized = false
    @State private var isWorking = false

    public init(bookingId: String, initialAccess: BookingAccessAuthorization?) {
        self.bookingId = bookingId
        _selected = State(initialValue: initialAccess?.method ?? .home)
        _authorized = State(initialValue: initialAccess?.isSmartEntryProvisioned ?? false)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SweeprSpacing.md) {
                Text("Choose how your cleaner gets in for this cleaning.")
                    .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)

                ForEach(AccessMethod.allCases, id: \.self) { method in
                    SweeprChoiceRow(
                        title: method.displayName,
                        subtitle: method == .smart_entry ? "Remote unlock via Seam" : nil,
                        systemIcon: method.systemIcon,
                        trailing: method == .smart_entry ? status?.feeLabel : nil,
                        isSelected: selected == method
                    ) { selected = method }
                }

                if selected == .smart_entry {
                    smartEntryDetail
                }

                SweeprButton(isWorking ? "Saving…" : "Save access method") {
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
        SweeprCard {
            VStack(alignment: .leading, spacing: SweeprSpacing.sm) {
                HStack(alignment: .top, spacing: SweeprSpacing.sm) {
                    Image(systemName: "lock.open.rotation").foregroundColor(SweeprColor.brand)
                    Text("We provision a one-time, time-boxed unlock through Seam. Your "
                         + "permanent code or smart-lock credentials are never shared with "
                         + "the cleaner.")
                        .font(SweeprFont.caption()).foregroundColor(SweeprColor.textSecondary)
                }
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

    private func save() async {
        isWorking = true
        defer { isWorking = false }
        let req = SetBookingAccessRequest(
            method: selected,
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
