import SwiftUI

// MARK: - 30-day heatmap strip

/// One-row heatmap of the last 30 days. Filled square = habit was
/// completed that day, faded square = due but missed, hairline square
/// = not due (cadence didn't include it). Today is on the right edge.
struct HabitHeatmapStrip: View {
    let habit: HabitEntry
    var days: Int = 30
    var squareSize: CGFloat = 8
    var spacing: CGFloat = 3

    private let cal = Calendar.current

    var body: some View {
        HStack(spacing: spacing) {
            ForEach(cells, id: \.date) { c in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(fill(for: c))
                    .frame(width: squareSize, height: squareSize)
            }
        }
    }

    private struct Cell {
        let date: String
        let done: Bool
        let due: Bool
    }

    private var cells: [Cell] {
        let done = Set(habit.completedDates)
        let cad = habit.cadence
        let today = cal.startOfDay(for: .now)
        return (0..<days).reversed().compactMap { offset -> Cell? in
            guard let d = cal.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let weekday = cal.component(.weekday, from: d)
            let key = HabitDateFmt.ymd(d)
            return Cell(date: key, done: done.contains(key), due: cad.isDueOn(weekday: weekday))
        }
    }

    private func fill(for c: Cell) -> Color {
        if c.done { return habit.color }
        if c.due  { return habit.color.opacity(0.18) }
        return LifeOSColor.stroke.opacity(0.5)
    }
}

// MARK: - 90-day month grid (3 months)

/// Full calendar grid for the detail view — three months stacked,
/// most-recent on top, with workout-style dots under each day.
struct HabitHistoryCalendar: View {
    let habit: HabitEntry
    private let cal = Calendar.current

    var body: some View {
        VStack(spacing: 18) {
            ForEach(monthsToShow, id: \.self) { anchor in
                monthBlock(anchor: anchor)
            }
        }
    }

    private var monthsToShow: [Date] {
        let today = cal.startOfDay(for: .now)
        let thisMonth = cal.date(from: cal.dateComponents([.year, .month], from: today)) ?? today
        return [0, -1, -2].compactMap { delta in
            cal.date(byAdding: .month, value: delta, to: thisMonth)
        }
    }

    private func monthBlock(anchor: Date) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(anchor.formatted(.dateTime.month(.wide).year()))
                .font(.system(size: 12, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(LifeOSColor.fg2)
                .padding(.horizontal, 2)
            HStack(spacing: 0) {
                ForEach(weekdaySymbols, id: \.self) { sym in
                    Text(sym)
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(LifeOSColor.fg3)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
                spacing: 4
            ) {
                ForEach(Array(cells(for: anchor).enumerated()), id: \.offset) { _, day in
                    dayCell(day)
                }
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ day: Date?) -> some View {
        if let day {
            let key = HabitDateFmt.ymd(day)
            let done = habit.completedDates.contains(key)
            let isToday = cal.isDateInToday(day)
            VStack(spacing: 3) {
                Text("\(cal.component(.day, from: day))")
                    .font(.system(size: 11, weight: isToday ? .bold : .regular).monospacedDigit())
                    .foregroundStyle(done ? .white : (isToday ? LifeOSColor.fg : LifeOSColor.fg3))
                Circle()
                    .fill(done ? habit.color : Color.clear)
                    .frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(done ? habit.color.opacity(0.32) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(
                        isToday && !done ? habit.color.opacity(0.55) : Color.clear,
                        lineWidth: 1
                    )
            )
        } else {
            Color.clear.frame(minHeight: 34)
        }
    }

    private var weekdaySymbols: [String] {
        let syms = cal.veryShortWeekdaySymbols
        let first = cal.firstWeekday - 1
        return Array(syms[first...] + syms[..<first])
    }

    private func cells(for monthAnchor: Date) -> [Date?] {
        guard
            let range = cal.range(of: .day, in: .month, for: monthAnchor),
            let firstOfMonth = cal.date(
                from: cal.dateComponents([.year, .month], from: monthAnchor)
            )
        else { return Array(repeating: nil, count: 42) }
        let firstWeekday = cal.component(.weekday, from: firstOfMonth)
        let leading = (firstWeekday - cal.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for d in range {
            if let date = cal.date(byAdding: .day, value: d - 1, to: firstOfMonth) {
                cells.append(date)
            }
        }
        while cells.count < 42 { cells.append(nil) }
        return cells
    }
}

// MARK: - Icon picker grid

/// Grid of SF Symbols from HabitIconCatalog. Selected icon gets the
/// habit's tint as a fill background; rest are muted.
struct HabitIconPicker: View {
    @Binding var selection: String
    var tint: Color

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 6)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(HabitIconCatalog.all, id: \.self) { icon in
                Button {
                    selection = icon
                    Haptics.tick()
                } label: {
                    Image(systemName: icon)
                        .font(.system(size: 17))
                        .foregroundStyle(selection == icon ? .white : LifeOSColor.fg2)
                        .frame(width: 44, height: 44)
                        .background(
                            Circle()
                                .fill(selection == icon ? tint : LifeOSColor.elevated)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Color picker strip

struct HabitColorPicker: View {
    @Binding var selection: HabitColor

    var body: some View {
        HStack(spacing: 12) {
            ForEach(HabitColor.allCases) { c in
                Button {
                    selection = c
                    Haptics.tick()
                } label: {
                    ZStack {
                        Circle()
                            .fill(c.color)
                            .frame(width: 30, height: 30)
                        if selection == c {
                            Circle()
                                .strokeBorder(Color.white, lineWidth: 2.5)
                                .frame(width: 36, height: 36)
                        }
                    }
                    .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Cadence picker

/// Segmented top-level + a contextual sub-row for Custom (day toggles)
/// and Weekly (stepper). Mutates a Binding<HabitCadence> so the parent
/// holds the single source of truth.
struct HabitCadencePicker: View {
    @Binding var cadence: HabitCadence

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                segment("Daily", isOn: matches(.daily)) {
                    cadence = .daily
                }
                segment("Weekdays", isOn: matches(.weekdays)) {
                    cadence = .weekdays
                }
                segment("Weekends", isOn: matches(.weekends)) {
                    cadence = .weekends
                }
            }
            HStack(spacing: 6) {
                segment("Custom days", isOn: isSpecific) {
                    if case .specific = cadence {
                        // already custom — no-op
                    } else {
                        cadence = .specific([2, 4, 6])
                    }
                }
                segment("N × per week", isOn: isWeekly) {
                    if case .weekly = cadence {
                        // already weekly — no-op
                    } else {
                        cadence = .weekly(3)
                    }
                }
            }
            if case .specific(let days) = cadence {
                dayChips(days: days)
            } else if case .weekly(let n) = cadence {
                weeklyStepper(n: n)
            }
        }
    }

    private func segment(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Haptics.tick()
        } label: {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isOn ? .white : LifeOSColor.fg2)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(isOn ? LifeOSColor.accent : LifeOSColor.elevated)
                )
        }
        .buttonStyle(.plain)
    }

    private func matches(_ other: HabitCadence) -> Bool {
        cadence.serialized == other.serialized
    }

    private var isSpecific: Bool {
        if case .specific = cadence { return true }
        return false
    }

    private var isWeekly: Bool {
        if case .weekly = cadence { return true }
        return false
    }

    private func dayChips(days: Set<Int>) -> some View {
        // 1=Sun, 2=Mon, ..., 7=Sat. Display week starting Sunday.
        let labels = [(1, "S"), (2, "M"), (3, "T"), (4, "W"), (5, "T"), (6, "F"), (7, "S")]
        return HStack(spacing: 6) {
            ForEach(labels, id: \.0) { (n, lbl) in
                Button {
                    var updated = days
                    if updated.contains(n) { updated.remove(n) } else { updated.insert(n) }
                    if updated.isEmpty { updated.insert(n) }  // can't have an empty cadence
                    cadence = .specific(updated)
                    Haptics.tick()
                } label: {
                    Text(lbl)
                        .font(.system(size: 12, weight: .heavy).monospacedDigit())
                        .foregroundStyle(days.contains(n) ? .white : LifeOSColor.fg2)
                        .frame(width: 32, height: 32)
                        .background(
                            Circle().fill(days.contains(n) ? LifeOSColor.accent : LifeOSColor.elevated)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func weeklyStepper(n: Int) -> some View {
        HStack(spacing: 12) {
            Button {
                let next = max(1, n - 1)
                cadence = .weekly(next)
                Haptics.tick()
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
            Text("\(n) × per week")
                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg)
                .frame(minWidth: 100)
            Button {
                let next = min(7, n + 1)
                cadence = .weekly(next)
                Haptics.tick()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Daily-target stepper (for count habits)

struct HabitTargetStepper: View {
    @Binding var target: Int

    var body: some View {
        HStack(spacing: 14) {
            Button {
                target = max(1, target - 1)
                Haptics.tick()
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
            VStack(spacing: 1) {
                Text("\(target)")
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg)
                Text(target == 1 ? "checkmark / day" : "per day")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(minWidth: 120)
            Button {
                target = min(50, target + 1)
                Haptics.tick()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
        }
    }
}
