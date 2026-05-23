import SwiftUI
import SwiftData

/// Replaces the old vertical "Recent sessions" list with a month grid
/// that shows a colored dot under every day a workout was logged. Tap
/// a day to see its sessions stacked below.
///
/// Delete gesture is intentionally two-step: tap a session to arm it
/// (the row enters a red-bordered state with a chevron-marked drag
/// handle), then drag left past the commit threshold to delete. Tap
/// the row again to disarm without deleting. An explicit "Open" button
/// on the armed row navigates to the detail view, so tap-to-navigate
/// isn't surprised by the arm-first model.
struct WorkoutCalendarSection: View {
    let sessions: [LiftSessionEntry]
    let onOpen: (LiftSessionEntry) -> Void
    let onDelete: (LiftSessionEntry) -> Void

    @State private var visibleMonth: Date = WorkoutCalendarSection.startOfMonth(.now)
    @State private var selectedDate: Date = Calendar.current.startOfDay(for: .now)
    @State private var armedID: PersistentIdentifier? = nil

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
                armedID = nil
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
                    ArmableSessionRow(
                        session: s,
                        armed: armedID == s.persistentModelID,
                        onArm: {
                            armedID = s.persistentModelID
                            Haptics.tick()
                        },
                        onDisarm: { armedID = nil },
                        onOpen: { onOpen(s) },
                        onDelete: {
                            armedID = nil
                            onDelete(s)
                        }
                    )
                }
            }
        }
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

// MARK: - Armable row

/// Single session row with a two-step delete: tap to arm, then drag
/// left past the commit threshold to delete. Tap again to disarm. An
/// explicit "Open" button on the armed row navigates to detail so the
/// arm-first model doesn't bury the primary action.
private struct ArmableSessionRow: View {
    let session: LiftSessionEntry
    let armed: Bool
    let onArm: () -> Void
    let onDisarm: () -> Void
    let onOpen: () -> Void
    let onDelete: () -> Void

    @State private var dragOffset: CGFloat = 0
    @State private var didHapticAtThreshold = false

    /// Past this offset (in points, leftward) a release commits the
    /// delete. Drag past it for a brief hinge with resistance so it
    /// feels like crossing into a "release to delete" zone.
    private let commitThreshold: CGFloat = -140
    private let maxOffset: CGFloat = -220

    private var progress: CGFloat {
        min(1, max(0, abs(dragOffset) / abs(commitThreshold)))
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            destructiveBackground
            rowSurface
                .offset(x: dragOffset)
                .gesture(armed ? dragGesture : nil)
                .onTapGesture(perform: handleTap)
        }
        .onChange(of: armed) { _, isArmed in
            if !isArmed { snapBack() }
        }
    }

    private func handleTap() {
        if armed {
            onDisarm()
            snapBack()
        } else {
            onArm()
        }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                // Ignore vertical-dominant drags so the outer ScrollView
                // still scrolls cleanly past an armed row.
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                let raw = value.translation.width
                if raw < commitThreshold {
                    if !didHapticAtThreshold {
                        Haptics.rigid()
                        didHapticAtThreshold = true
                    }
                    let extra = raw - commitThreshold
                    dragOffset = max(maxOffset, commitThreshold + extra * 0.4)
                } else {
                    if didHapticAtThreshold && raw > commitThreshold + 8 {
                        didHapticAtThreshold = false
                    }
                    dragOffset = min(0, raw)
                }
            }
            .onEnded { value in
                didHapticAtThreshold = false
                if value.translation.width < commitThreshold {
                    Haptics.warning()
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        dragOffset = -500
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                        onDelete()
                    }
                } else {
                    snapBack()
                }
            }
    }

    private func snapBack() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
            dragOffset = 0
        }
    }

    // MARK: - Visuals

    private var destructiveBackground: some View {
        HStack {
            Spacer()
            HStack(spacing: 8) {
                Image(systemName: progress >= 1 ? "checkmark.circle.fill" : "trash.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text(progress >= 1 ? "RELEASE" : "DRAG TO DELETE")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.6)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .frame(maxHeight: .infinity)
        }
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(LifeOSColor.danger.opacity(0.6 + 0.35 * Double(progress)))
        )
        .opacity(dragOffset < -2 ? 1 : 0)
    }

    private var rowSurface: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.workoutType)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text("\(session.setCount) sets · \(Int(session.totalVolumeLb)) lb volume")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
            if armed {
                armedTrailing
            } else {
                idleTrailing
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
                if armed {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(LifeOSColor.danger.opacity(0.08))
                }
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(rowStroke, lineWidth: armed ? 1 : 0.5)
        )
        .shadow(color: Color.black.opacity(0.4), radius: 16, x: 0, y: 8)
    }

    private var rowStroke: LinearGradient {
        if armed {
            return LinearGradient(
                colors: [LifeOSColor.danger.opacity(0.55), LifeOSColor.danger.opacity(0.15)],
                startPoint: .top, endPoint: .bottom
            )
        }
        return LinearGradient(
            colors: [Color.white.opacity(0.14), Color.white.opacity(0.0)],
            startPoint: .top, endPoint: .bottom
        )
    }

    private var idleTrailing: some View {
        HStack(spacing: 6) {
            Text(session.startedAt.formatted(date: .abbreviated, time: .omitted))
                .font(.system(size: 11))
                .foregroundStyle(LifeOSColor.fg3)
            Image(systemName: "chevron.right")
                .font(.system(size: 10))
                .foregroundStyle(LifeOSColor.fg3)
        }
    }

    private var armedTrailing: some View {
        HStack(spacing: 10) {
            Button(action: onOpen) {
                Text("Open")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
            HStack(spacing: 1) {
                Image(systemName: "chevron.compact.left")
                Image(systemName: "chevron.compact.left")
                Image(systemName: "chevron.compact.left")
            }
            .font(.system(size: 14, weight: .heavy))
            .foregroundStyle(LifeOSColor.danger)
        }
    }
}
