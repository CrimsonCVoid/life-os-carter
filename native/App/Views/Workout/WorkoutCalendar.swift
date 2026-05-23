import SwiftUI
import SwiftData

/// Replaces the old vertical "Recent sessions" list with a month grid
/// that shows a colored dot under every day a workout was logged. Tap
/// a day to see its sessions stacked below; tap a session to open the
/// detail view. Deleting a workout lives inside the detail view (see
/// SlideToDeleteBar in WorkoutDetailView) — the row is a pure
/// navigation surface, no inline destructive affordance.
struct WorkoutCalendarSection: View {
    let sessions: [LiftSessionEntry]
    let onOpen: (LiftSessionEntry) -> Void

    @State private var visibleMonth: Date = WorkoutCalendarSection.startOfMonth(.now)
    @State private var selectedDate: Date = Calendar.current.startOfDay(for: .now)

    private var calendar: Calendar { Calendar.current }

    private var sessionsByDay: [Date: [LiftSessionEntry]] {
        Dictionary(grouping: sessions) { calendar.startOfDay(for: $0.startedAt) }
    }

    var body: some View {
        VStack(spacing: 10) {
            SectionLabel("Recent sessions")
            Card {
                VStack(spacing: 14) {
                    monthHeader
                    weekdayHeader
                    monthGrid
                }
            }
            selectedDayList
        }
    }

    // MARK: - Calendar chrome

    private var monthHeader: some View {
        HStack {
            Text(monthLabel)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
            HStack(spacing: 6) {
                navButton("chevron.left") { shiftMonth(-1) }
                navButton("chevron.right") { shiftMonth(1) }
            }
        }
    }

    private func navButton(_ system: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) { action() }
            Haptics.tick()
        } label: {
            Image(systemName: system)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(width: 30, height: 30)
                .background(Circle().fill(LifeOSColor.elevated))
        }
        .buttonStyle(.plain)
    }

    private var weekdayHeader: some View {
        HStack(spacing: 0) {
            ForEach(weekdaySymbols, id: \.self) { sym in
                Text(sym)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var monthGrid: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
            spacing: 4
        ) {
            ForEach(Array(gridCells.enumerated()), id: \.offset) { _, day in
                dayCell(day)
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ day: Date?) -> some View {
        if let day {
            let hasSession = sessionsByDay[day] != nil
            let isSelected = calendar.isDate(day, inSameDayAs: selectedDate)
            let isToday = calendar.isDateInToday(day)
            Button {
                selectedDate = day
                Haptics.tick()
            } label: {
                VStack(spacing: 4) {
                    Text("\(calendar.component(.day, from: day))")
                        .font(.system(size: 13, weight: isToday ? .bold : .medium).monospacedDigit())
                        .foregroundStyle(dayNumberColor(isSelected: isSelected, hasSession: hasSession))
                    Circle()
                        .fill(hasSession ? LifeOSColor.Metric.peak : Color.clear)
                        .frame(width: 4, height: 4)
                }
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isSelected ? LifeOSColor.accentStrong : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(
                            isToday && !isSelected ? LifeOSColor.accent.opacity(0.55) : Color.clear,
                            lineWidth: 1
                        )
                )
            }
            .buttonStyle(.plain)
        } else {
            Color.clear.frame(minHeight: 40)
        }
    }

    private func dayNumberColor(isSelected: Bool, hasSession: Bool) -> Color {
        if isSelected { return .white }
        if hasSession { return LifeOSColor.fg }
        return LifeOSColor.fg3
    }

    // MARK: - Selected-day stack

    @ViewBuilder
    private var selectedDayList: some View {
        let day = calendar.startOfDay(for: selectedDate)
        let entries = (sessionsByDay[day] ?? []).sorted { $0.startedAt > $1.startedAt }
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Rectangle().fill(LifeOSColor.stroke).frame(height: 1)
                Text(selectedDayLabel)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                    .fixedSize()
                Rectangle().fill(LifeOSColor.stroke).frame(height: 1)
            }
            .padding(.horizontal, 4)

            if entries.isEmpty {
                Text("No sessions on this day.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            } else {
                ForEach(entries) { s in
                    sessionRow(s)
                }
            }
        }
    }

    private func sessionRow(_ s: LiftSessionEntry) -> some View {
        Button {
            Haptics.tap()
            onOpen(s)
        } label: {
            Card {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.workoutType)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg)
                        Text("\(s.setCount) sets · \(Int(s.totalVolumeLb)) lb volume")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    Text(s.startedAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
    }

    // MARK: - Derived

    private var monthLabel: String {
        visibleMonth.formatted(.dateTime.month(.wide).year())
    }

    private var selectedDayLabel: String {
        selectedDate
            .formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
            .uppercased()
    }

    private var weekdaySymbols: [String] {
        let syms = calendar.veryShortWeekdaySymbols
        let first = calendar.firstWeekday - 1
        return Array(syms[first...] + syms[..<first])
    }

    private var gridCells: [Date?] {
        guard
            let range = calendar.range(of: .day, in: .month, for: visibleMonth),
            let firstOfMonth = calendar.date(
                from: calendar.dateComponents([.year, .month], from: visibleMonth)
            )
        else {
            return Array(repeating: nil, count: 42)
        }
        let firstWeekday = calendar.component(.weekday, from: firstOfMonth)
        let leading = (firstWeekday - calendar.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for d in range {
            if let date = calendar.date(byAdding: .day, value: d - 1, to: firstOfMonth) {
                cells.append(date)
            }
        }
        while cells.count < 42 { cells.append(nil) }
        return cells
    }

    private static func startOfMonth(_ d: Date) -> Date {
        let cal = Calendar.current
        return cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? d
    }

    private func shiftMonth(_ delta: Int) {
        if let next = calendar.date(byAdding: .month, value: delta, to: visibleMonth) {
            visibleMonth = next
        }
    }
}

