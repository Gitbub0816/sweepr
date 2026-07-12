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

// Booking-flow STUB. The full wizard (package → level → add-ons → schedule →
// pay) mirrors the web `apps/customer/src/booking/`. Pricing is always fetched
// server-side; this stub only sketches the step scaffold + a native progress bar.
public struct BookFlowScreen: View {
    @State private var step = 0
    private let steps = ["Package", "Level", "Add-ons", "Schedule", "Review"]

    public init() {}

    public var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: SweeprSpacing.lg) {
                ProgressView(value: Double(step + 1), total: Double(steps.count))
                    .tint(SweeprColor.brand)
                Text(steps[step]).font(SweeprFont.title()).foregroundColor(SweeprColor.textPrimary)

                SweeprCard {
                    Text("TODO: port \(steps[step]) step from apps/customer/src/booking/. "
                         + "Quote comes from the server — never compute totals on device.")
                        .font(SweeprFont.body()).foregroundColor(SweeprColor.textSecondary)
                }

                Spacer()

                HStack(spacing: SweeprSpacing.md) {
                    if step > 0 {
                        SweeprButton("Back", style: .secondary) { step -= 1 }
                    }
                    SweeprButton(step == steps.count - 1 ? "Confirm & pay" : "Continue") {
                        if step < steps.count - 1 { step += 1 }
                    }
                }
            }
            .padding(SweeprSpacing.md)
            .background(SweeprColor.background.ignoresSafeArea())
            .navigationTitle("Book")
        }
    }
}
