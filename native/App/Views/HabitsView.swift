import SwiftUI
import SwiftData

/// Habits tab — top-down redesign. Hero progress card driven by
/// today's due habits, category filter pills, due-today / later /
/// archived sections, per-row heatmap, count-based habits with
/// inline +/- controls. Tap a row to push the detail view; long-
/// press for quick actions; tap the toolbar + to create.
struct HabitsView: View {
    @Query(
        filter: #Predicate<HabitEntry> { $0.archived == false },
        sort: \HabitEntry.order
    ) private var habits: [HabitEntry]
    @Query(
        filter: #Predicate<HabitEntry> { $0.archived == true },
        sort: \HabitEntry.order
    ) private var archived: [HabitEntry]

    @Environment(\.modelContext) private var modelContext
    @State private var revealed = false
    @State private var filter: HabitCategory? = nil
    @State private var creating = false
    @State private var showArchived = false

    private let cal = Calendar.current

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    if habits.isEmpty {
                        seedState.cascadeReveal(index: 0, visible: revealed)
                    } else {
                        heroCard.cascadeReveal(index: 0, visible: revealed)
                        if !categoriesInUse.isEmpty {
                            categoryFilter.cascadeReveal(index: 1, visible: revealed)
                        }
                        dueTodaySection.cascadeReveal(index: 2, visible: revealed)
                        notDueSection.cascadeReveal(index: 3, visible: revealed)
                        if !archived.isEmpty {
                            archivedToggle.cascadeReveal(index: 4, visible: revealed)
                            if showArchived {
                                archivedSection.cascadeReveal(index: 5, visible: revealed)
                            }
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .onAppear { if !revealed { revealed = true } }
            .navigationTitle("Habits")
            .toolbar {
                if !habits.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Haptics.tap()
                            creating = true
                        } label: {
                            Image(systemName: "plus")
                                .foregroundStyle(LifeOSColor.accent)
                        }
                    }
                }
            }
            .sheet(isPresented: $creating) {
                HabitEditorSheet()
                    .presentationDetents([.large])
            }
        }
    }

    // MARK: - Hero progress

    private var heroCard: some View {
        let todayKey = HabitDateFmt.ymd(Date())
        let todayWeekday = cal.component(.weekday, from: Date())
        let due = habits.filter { $0.cadence.isDueOn(weekday: todayWeekday) }
        let done = due.filter { $0.isCompleted(on: todayKey) }.count
        let total = due.count
        let pct = total == 0 ? 0.0 : Double(done) / Double(total)
        let bestStreakNow = habits.map { $0.currentStreak() }.max() ?? 0
        return Card(tint: LifeOSColor.accent) {
            HStack(spacing: 18) {
                progressRing(pct: pct, label: "\(Int(pct * 100))%")
                VStack(alignment: .leading, spacing: 4) {
                    Text(total == 0 ? "Rest day" : "\(done) of \(total) today")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                    Text(subline(done: done, total: total))
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                    HStack(spacing: 6) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(LifeOSColor.warning)
                        Text(bestStreakNow > 0 ? "\(bestStreakNow)-day streak running" : "Start a streak today")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    .padding(.top, 2)
                }
                Spacer()
            }
        }
    }

    private func subline(done: Int, total: Int) -> String {
        if total == 0 { return "Nothing's due today — relax." }
        if done == total { return "Everything done. Beautiful." }
        if done == 0 { return "Tap a habit below to start." }
        return "\(total - done) left to close out the day."
    }

    private func progressRing(pct: Double, label: String) -> some View {
        ZStack {
            Circle()
                .stroke(LifeOSColor.accent.opacity(0.18), lineWidth: 7)
            Circle()
                .trim(from: 0, to: max(0.01, pct))
                .stroke(
                    LinearGradient(
                        colors: [LifeOSColor.accent, LifeOSColor.Metric.peak],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: 7, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text(label)
                .font(.system(size: 14, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
        }
        .frame(width: 68, height: 68)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: pct)
    }

    // MARK: - Category filter

    private var categoriesInUse: [HabitCategory] {
        let used = Set(habits.map { $0.categoryEnum })
        return HabitCategory.allCases.filter { used.contains($0) }
    }

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterPill(label: "All", icon: "circle.grid.2x2.fill", active: filter == nil) {
                    filter = nil
                }
                ForEach(categoriesInUse) { c in
                    filterPill(label: c.label, icon: c.icon, active: filter == c) {
                        filter = c
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func filterPill(label: String, icon: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            Haptics.tick()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 10, weight: .semibold))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(active ? .white : LifeOSColor.fg2)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(active ? LifeOSColor.accent : LifeOSColor.elevated)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Filtered slices

    private var visibleHabits: [HabitEntry] {
        guard let f = filter else { return habits }
        return habits.filter { $0.categoryEnum == f }
    }

    private var dueToday: [HabitEntry] {
        let weekday = cal.component(.weekday, from: Date())
        return visibleHabits.filter { $0.cadence.isDueOn(weekday: weekday) }
    }

    private var notDueToday: [HabitEntry] {
        let weekday = cal.component(.weekday, from: Date())
        return visibleHabits.filter { !$0.cadence.isDueOn(weekday: weekday) }
    }

    // MARK: - Sections

    @ViewBuilder
    private var dueTodaySection: some View {
        if dueToday.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                sectionLabel("Today")
                ForEach(dueToday) { h in
                    rowLink(h)
                }
            }
        }
    }

    @ViewBuilder
    private var notDueSection: some View {
        if notDueToday.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                sectionLabel("Not due today")
                ForEach(notDueToday) { h in
                    rowLink(h)
                }
            }
        }
    }

    private var archivedToggle: some View {
        Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
                showArchived.toggle()
            }
            Haptics.tick()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: showArchived ? "chevron.down" : "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                Text("\(archived.count) archived")
                    .font(.system(size: 11, weight: .semibold)).tracking(0.4)
                Spacer()
            }
            .foregroundStyle(LifeOSColor.fg3)
            .padding(.horizontal, 6)
            .padding(.top, 12)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var archivedSection: some View {
        VStack(spacing: 10) {
            ForEach(archived) { h in
                rowLink(h, archived: true)
            }
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(1.4)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
    }

    // MARK: - Row

    private func rowLink(_ habit: HabitEntry, archived: Bool = false) -> some View {
        NavigationLink {
            HabitDetailView(habit: habit)
        } label: {
            habitRow(habit, archived: archived)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                habit.archived.toggle()
                habit.needsSync = true
                try? modelContext.save()
                Haptics.tick()
            } label: {
                Label(habit.archived ? "Unarchive" : "Archive",
                      systemImage: habit.archived ? "tray.and.arrow.up.fill" : "tray.and.arrow.down.fill")
            }
            Button(role: .destructive) {
                modelContext.delete(habit)
                try? modelContext.save()
                Haptics.warning()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func habitRow(_ habit: HabitEntry, archived: Bool) -> some View {
        let todayKey = HabitDateFmt.ymd(Date())
        let done = habit.isCompleted(on: todayKey)
        let streak = habit.currentStreak()
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    iconBubble(habit, done: done)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(habit.name)
                            .font(.system(size: 14, weight: .semibold))
                            .strikethrough(archived, color: LifeOSColor.fg3)
                            .foregroundStyle(archived ? LifeOSColor.fg3 : .white)
                        HStack(spacing: 6) {
                            Text(habit.cadence.label)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(LifeOSColor.fg3)
                            if streak >= 2 {
                                streakChip(streak)
                            }
                        }
                    }
                    Spacer()
                    trailingControl(habit, done: done, archived: archived)
                }
                if !archived {
                    HabitHeatmapStrip(habit: habit, days: 30, squareSize: 8, spacing: 3)
                }
            }
        }
        .opacity(archived ? 0.6 : 1)
    }

    private func iconBubble(_ habit: HabitEntry, done: Bool) -> some View {
        ZStack {
            Circle()
                .fill(done ? habit.color : habit.color.opacity(0.16))
            Image(systemName: habit.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(done ? .white : habit.color)
        }
        .frame(width: 40, height: 40)
        .overlay(
            Circle().strokeBorder(habit.color.opacity(done ? 0.0 : 0.35), lineWidth: 1)
        )
    }

    private func streakChip(_ n: Int) -> some View {
        HStack(spacing: 3) {
            Image(systemName: "flame.fill")
                .font(.system(size: 9, weight: .bold))
            Text("\(n)")
                .font(.system(size: 10, weight: .heavy)).monospacedDigit()
        }
        .foregroundStyle(LifeOSColor.warning)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(Capsule().fill(LifeOSColor.warning.opacity(0.14)))
    }

    @ViewBuilder
    private func trailingControl(_ habit: HabitEntry, done: Bool, archived: Bool) -> some View {
        if archived {
            EmptyView()
        } else if habit.isCountBased {
            countTrailing(habit)
        } else {
            booleanTrailing(habit, done: done)
        }
    }

    private func booleanTrailing(_ habit: HabitEntry, done: Bool) -> some View {
        Button {
            let key = HabitDateFmt.ymd(Date())
            habit.toggle(on: key)
            try? modelContext.save()
            Task { await SyncService.shared.drainPending() }
            done ? Haptics.tick() : Haptics.success()
        } label: {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 28))
                .foregroundStyle(done ? habit.color : LifeOSColor.fg3)
        }
        .buttonStyle(.plain)
    }

    private func countTrailing(_ habit: HabitEntry) -> some View {
        let key = HabitDateFmt.ymd(Date())
        let current = habit.count(on: key)
        return HStack(spacing: 6) {
            Button {
                habit.setCount(max(0, current - 1), on: key)
                try? modelContext.save()
                Task { await SyncService.shared.drainPending() }
                Haptics.tick()
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)
            .disabled(current == 0)
            .opacity(current == 0 ? 0.4 : 1)
            VStack(spacing: 0) {
                Text("\(current)")
                    .font(.system(size: 13, weight: .heavy).monospacedDigit())
                    .foregroundStyle(habit.color)
                Text("/ \(habit.dailyTarget)")
                    .font(.system(size: 9, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(minWidth: 36)
            Button {
                habit.setCount(current + 1, on: key)
                try? modelContext.save()
                Task { await SyncService.shared.drainPending() }
                current + 1 >= habit.dailyTarget ? Haptics.success() : Haptics.tick()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(habit.color))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Seed empty state

    private var seedState: some View {
        VStack(spacing: 14) {
            Card {
                VStack(spacing: 10) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 28))
                        .foregroundStyle(LifeOSColor.accent)
                    Text("Build your daily stack")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                    Text("Start with one of these themed packs, or tap below to create a custom habit.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
            }
            VStack(spacing: 10) {
                ForEach(HabitSeedPack.all) { pack in
                    seedPackRow(pack)
                }
            }
            Button {
                Haptics.tap()
                creating = true
            } label: {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("Create a custom habit")
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(LifeOSColor.accent.opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(LifeOSColor.accent.opacity(0.35), lineWidth: 1)
                        )
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func seedPackRow(_ pack: HabitSeedPack) -> some View {
        Button {
            Haptics.tap()
            seed(pack)
        } label: {
            Card(tint: pack.tint.color) {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(pack.tint.color.opacity(0.22))
                        Image(systemName: pack.icon)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(pack.tint.color)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(pack.title)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                        Text(pack.subtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                        Text(pack.seeds.map(\.name).joined(separator: " · "))
                            .font(.system(size: 10))
                            .foregroundStyle(LifeOSColor.fg3)
                            .lineLimit(2)
                            .padding(.top, 2)
                    }
                    Spacer()
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(pack.tint.color))
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
    }

    private func seed(_ pack: HabitSeedPack) {
        let descriptor = FetchDescriptor<HabitEntry>(
            sortBy: [SortDescriptor(\.order, order: .reverse)]
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var nextOrder = (existing.first?.order ?? -1) + 1
        for seed in pack.seeds {
            modelContext.insert(seed.make(order: nextOrder))
            nextOrder += 1
        }
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
    }
}

extension ISO8601DateFormatter {
    static let dateOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        f.timeZone = .current
        return f
    }()
}
