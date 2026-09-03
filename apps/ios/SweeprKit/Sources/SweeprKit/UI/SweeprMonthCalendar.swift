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

// A native month-grid date picker that can show a date as UNAVAILABLE before
// the customer ever taps it — mirroring apps/customer's SweeprCalendar (web),
// which greys out `blocked` dates from GET /calendar/availability instead of
// only failing at booking/quote time. Advisory (the server still re-checks at
// quote and create), but it moves the "sorry, that's blocked" moment as early
// as possible instead of as late as possible.

public struct SweeprMonthCalendar: View {
    /// One calendar day's advisory info, keyed by "YYYY-MM-DD" local date.
    public struct DayMarker: Sendable, Equatable {
        public let blocked: Bool
        /// Short label (surge/promo) shown under an unblocked day.
        public let label: String?
        public init(blocked: Bool, label: String? = nil) {
            self.blocked = blocked
            self.label = label
        }
    }

    @Binding private var selectedDate: Date?
    private let markers: [String: DayMarker]
    private let onMonthChange: (Date) -> Void

    @State private var displayedMonth: Date

    private let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        return cal
    }()
    private static let weekdaySymbols = ["S", "M", "T", "W", "T", "F", "S"]

    public init(
        selectedDate: Binding<Date?>,
        markers: [String: DayMarker] = [:],
        onMonthChange: @escaping (Date) -> Void = { _ in }
    ) {
        self._selectedDate = selectedDate
        self.markers = markers
        self.onMonthChange = onMonthChange
        self._displayedMonth = State(initialValue: selectedDate.wrappedValue ?? Date())
    }

    public var body: some View {
        VStack(spacing: SweeprSpacing.md) {
            header
            weekdayRow
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 6) {
                ForEach(Array(leadingBlanks.indices), id: \.self) { _ in
                    Color.clear.frame(height: 40)
                }
                ForEach(daysInMonth, id: \.self) { day in
                    dayCell(day)
                }
            }
        }
        .task { onMonthChange(displayedMonth) }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text(monthTitle).font(SweeprFont.body().weight(.semibold))
                .foregroundColor(SweeprColor.textPrimary)
            Spacer()
            Button {
                SweeprHaptics.selection()
                shiftMonth(-1)
            } label: {
                Image(systemName: "chevron.left").foregroundColor(SweeprColor.brand)
            }
            .disabled(isCurrentCalendarMonth)
            .opacity(isCurrentCalendarMonth ? 0.3 : 1)
            Button {
                SweeprHaptics.selection()
                shiftMonth(1)
            } label: {
                Image(systemName: "chevron.right").foregroundColor(SweeprColor.brand)
            }
        }
    }

    private var weekdayRow: some View {
        HStack {
            ForEach(Array(Self.weekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                Text(symbol)
                    .font(SweeprFont.footnote())
                    .foregroundColor(SweeprColor.textSecondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Day cell

    private func dayCell(_ day: Date) -> some View {
        let key = Self.key(day)
        let marker = markers[key]
        let blocked = marker?.blocked ?? false
        let past = calendar.startOfDay(for: day) < calendar.startOfDay(for: Date())
        let disabled = blocked || past
        let isSelected = selectedDate.map { calendar.isDate($0, inSameDayAs: day) } ?? false
        let isToday = calendar.isDateInToday(day)

        return Button {
            guard !disabled else { return }
            SweeprHaptics.selection()
            selectedDate = day
        } label: {
            VStack(spacing: 2) {
                Text("\(calendar.component(.day, from: day))")
                    .font(SweeprFont.body().weight(isSelected ? .bold : .regular))
                    .foregroundColor(dayTextColor(disabled: disabled, isSelected: isSelected))
                    .frame(width: 34, height: 34)
                    .background(isSelected ? SweeprColor.brand : Color.clear)
                    .clipShape(Circle())
                    .overlay(
                        Circle()
                            .stroke(isToday && !isSelected ? SweeprColor.brand : Color.clear, lineWidth: 1.5)
                    )
                // Reserve the row whether or not a marker exists so every
                // week stays the same height.
                Circle()
                    .fill(marker?.label != nil && !blocked ? SweeprColor.amber : Color.clear)
                    .frame(width: 4, height: 4)
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel(accessibilityLabel(for: day, blocked: blocked))
    }

    private func dayTextColor(disabled: Bool, isSelected: Bool) -> Color {
        if isSelected { return .white }
        if disabled { return SweeprColor.separator }
        return SweeprColor.textPrimary
    }

    private func accessibilityLabel(for day: Date, blocked: Bool) -> String {
        let formatted = day.formatted(date: .complete, time: .omitted)
        return blocked ? "\(formatted), unavailable" : formatted
    }

    // MARK: - Month math

    private var monthTitle: String {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f.string(from: displayedMonth)
    }

    private var isCurrentCalendarMonth: Bool {
        calendar.isDate(displayedMonth, equalTo: Date(), toGranularity: .month)
    }

    private func shiftMonth(_ delta: Int) {
        guard let next = calendar.date(byAdding: .month, value: delta, to: displayedMonth) else { return }
        // Never let the customer navigate before the current month.
        if delta < 0 && calendar.compare(next, to: Date(), toGranularity: .month) == .orderedAscending { return }
        withAnimation(SweeprMotion.gentle) { displayedMonth = next }
        onMonthChange(next)
    }

    private var monthInterval: DateInterval {
        calendar.dateInterval(of: .month, for: displayedMonth) ?? DateInterval(start: displayedMonth, duration: 0)
    }

    private var daysInMonth: [Date] {
        guard let range = calendar.range(of: .day, in: .month, for: displayedMonth) else { return [] }
        return range.compactMap { day -> Date? in
            calendar.date(byAdding: .day, value: day - 1, to: monthInterval.start)
        }
    }

    /// Leading empty cells so day 1 lands under its real weekday column.
    private var leadingBlanks: [Int] {
        let weekday = calendar.component(.weekday, from: monthInterval.start) // 1 = Sunday
        return Array(0..<(weekday - 1))
    }

    /// Local "YYYY-MM-DD" — matches the web calendar's `dateKey`, NOT the UTC
    /// date of the instant (which rolls forward for evening times).
    public static func key(_ date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        let c = cal.dateComponents([.year, .month, .day], from: date)
        func pad2(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }
        return "\(c.year ?? 0)-\(pad2(c.month ?? 0))-\(pad2(c.day ?? 0))"
    }
}
