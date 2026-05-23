import SwiftUI
import SwiftData

/// Push-target detail screen for a single habit. Hero stats, 90-day
/// calendar of completions, notes, and Edit / Archive / Delete
/// destructives via a SlideToDeleteBar at the bottom (same pattern
/// as the workout detail view — delete lives where the user has
/// already committed to looking at the thing).
struct HabitDetailView: View {
    let habit: HabitEntry
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var editing = false

    private let cal = Calendar.current

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                hero
                statsGrid
                heatmapCard
                calendarCard
                if !habit.notes.isEmpty {
                    notesCard
                }
                actionRow
                SlideToDeleteBar(label: "Slide to delete habit") {
                    modelContext.delete(habit)
                    try? modelContext.save()
                    Haptics.warning()
                    dismiss()
                }
                .padding(.top, 8)
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle(habit.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) {
            HabitEditorSheet(editing: habit, onDelete: {
                modelContext.delete(habit)
                try? modelContext.save()
                dismiss()
            })
            .presentationDetents([.large])
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.tap()
                    editing = true
                } label: {
                    Image(systemName: "square.and.pencil")
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
        }
    }

    // MARK: - Hero

    private var hero: some View {
        Card(tint: habit.color) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(habit.color.opacity(0.22))
                        Image(systemName: habit.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(habit.color)
                    }
                    .frame(width: 60, height: 60)
                    .overlay(Circle().strokeBorder(habit.color.opacity(0.4), lineWidth: 1))
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            categoryChip
                            cadenceChip
                        }
                        Text(habit.name)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    Spacer()
                }
                if habit.isCountBased {
                    countControl
                } else {
                    booleanControl
                }
            }
        }
    }

    private var categoryChip: some View {
        HStack(spacing: 4) {
            Image(systemName: habit.categoryEnum.icon)
                .font(.system(size: 9, weight: .semibold))
            Text(habit.categoryEnum.label.uppercased())
                .font(.system(size: 9, weight: .heavy))
                .tracking(0.6)
        }
        .foregroundStyle(LifeOSColor.fg2)
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Capsule().fill(LifeOSColor.elevated))
    }

    private var cadenceChip: some View {
        Text(habit.cadence.label.uppercased())
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.6)
            .foregroundStyle(LifeOSColor.fg3)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(Capsule().fill(LifeOSColor.elevated))
    }

    private var booleanControl: some View {
        let key = HabitDateFmt.ymd(Date())
        let done = habit.isCompleted(on: key)
        return Button {
            habit.toggle(on: key)
            try? modelContext.save()
            Task { await SyncService.shared.drainPending() }
            done ? Haptics.tick() : Haptics.success()
        } label: {
            HStack {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                Text(done ? "Completed today" : "Mark complete for today")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(done ? .white : habit.color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(done ? habit.color : habit.color.opacity(0.14))
            )
        }
        .buttonStyle(.plain)
    }

    private var countControl: some View {
        let key = HabitDateFmt.ymd(Date())
        let current = habit.count(on: key)
        let progress = min(1, Double(current) / Double(max(1, habit.dailyTarget)))
        return VStack(spacing: 10) {
            HStack(spacing: 14) {
                Button {
                    habit.setCount(max(0, current - 1), on: key)
                    try? modelContext.save()
                    Task { await SyncService.shared.drainPending() }
                    Haptics.tick()
                } label: {
                    Image(systemName: "minus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(LifeOSColor.elevated))
                }
                .buttonStyle(.plain)
                .disabled(current == 0)
                .opacity(current == 0 ? 0.4 : 1)
                VStack(spacing: 2) {
                    Text("\(current) / \(habit.dailyTarget)")
                        .font(.system(size: 22, weight: .bold).monospacedDigit())
                        .foregroundStyle(habit.color)
                    Text(current >= habit.dailyTarget ? "Target hit" : "Today")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                .frame(minWidth: 120)
                Button {
                    habit.setCount(current + 1, on: key)
                    try? modelContext.save()
                    Task { await SyncService.shared.drainPending() }
                    current + 1 >= habit.dailyTarget ? Haptics.success() : Haptics.tick()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(habit.color))
                }
                .buttonStyle(.plain)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(habit.color.opacity(0.18))
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(habit.color)
                        .frame(width: max(8, geo.size.width * progress))
                }
            }
            .frame(height: 10)
        }
    }

    // MARK: - Stats grid

    private var statsGrid: some View {
        let cur = habit.currentStreak()
        let best = habit.bestStreak()
        let rate30 = Int((habit.completionRate(days: 30) * 100).rounded())
        let total = habit.completedDates.count
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            statTile("CURRENT STREAK", "\(cur)", suffix: streakSuffix(cur), tint: habit.color)
            statTile("BEST STREAK", "\(best)", suffix: streakSuffix(best), tint: LifeOSColor.warning)
            statTile("LAST 30 DAYS", "\(rate30)", suffix: "%", tint: LifeOSColor.Metric.peak)
            statTile("ALL-TIME", "\(total)", suffix: total == 1 ? "day" : "days", tint: LifeOSColor.fg2)
        }
    }

    private func statTile(_ label: String, _ value: String, suffix: String, tint: Color) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(value)
                        .font(.system(size: 22, weight: .bold).monospacedDigit())
                        .foregroundStyle(tint)
                    Text(suffix)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private func streakSuffix(_ n: Int) -> String {
        n == 1 ? "day" : "days"
    }

    // MARK: - Heatmap

    private var heatmapCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("LAST 30 DAYS")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                HabitHeatmapStrip(habit: habit, days: 30, squareSize: 10, spacing: 4)
            }
        }
    }

    // MARK: - Full calendar

    private var calendarCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("HISTORY")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                HabitHistoryCalendar(habit: habit)
            }
        }
    }

    // MARK: - Notes

    private var notesCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                Text("NOTES")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                Text(habit.notes)
                    .font(.system(size: 13))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Action row

    private var actionRow: some View {
        HStack(spacing: 10) {
            actionButton(
                label: habit.archived ? "Unarchive" : "Archive",
                icon: habit.archived ? "tray.and.arrow.up.fill" : "tray.and.arrow.down.fill",
                tint: LifeOSColor.fg2
            ) {
                habit.archived.toggle()
                habit.needsSync = true
                try? modelContext.save()
                Haptics.tick()
                if habit.archived { dismiss() }
            }
            actionButton(
                label: "Edit",
                icon: "square.and.pencil",
                tint: LifeOSColor.accent
            ) {
                editing = true
                Haptics.tap()
            }
        }
    }

    private func actionButton(label: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                Text(label).font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LifeOSColor.elevated)
            )
        }
        .buttonStyle(.plain)
    }
}
