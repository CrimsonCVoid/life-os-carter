import SwiftUI
import SwiftData

struct HabitsView: View {
    @Query(sort: \HabitEntry.order) private var habits: [HabitEntry]
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if habits.isEmpty {
                        seedState
                    } else {
                        ForEach(habits) { habit in
                            habitRow(habit)
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Habits")
        }
    }

    private var seedState: some View {
        Card {
            VStack(spacing: 12) {
                Image(systemName: "checkmark.circle")
                    .font(.system(size: 32))
                    .foregroundStyle(LifeOSColor.accent)
                Text("Start with a few defaults")
                    .font(.system(size: 14, weight: .semibold))
                Text("Tap below to seed Read 20 min, Meditate, No phone after 10pm, Cold shower, Stretch.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .multilineTextAlignment(.center)
                Button("Seed defaults") {
                    Haptics.tap()
                    seedDefaults()
                }
                .buttonStyle(.borderedProminent)
                .tint(LifeOSColor.accent)
            }
        }
    }

    private func seedDefaults() {
        let seeds: [(String, String)] = [
            ("Read 20 minutes", "book.fill"),
            ("Meditate", "brain"),
            ("No phone after 10pm", "moon.fill"),
            ("Cold shower", "snowflake"),
            ("Stretch", "figure.flexibility"),
        ]
        for (i, (name, icon)) in seeds.enumerated() {
            let h = HabitEntry(name: name, icon: icon, order: i)
            modelContext.insert(h)
        }
        try? modelContext.save()
    }

    private func habitRow(_ habit: HabitEntry) -> some View {
        let todayStr = ISO8601DateFormatter.dateOnly.string(from: Date())
        let done = habit.completedDates.contains(todayStr)
        return Card {
            HStack(spacing: 12) {
                Image(systemName: habit.icon)
                    .font(.system(size: 18))
                    .foregroundStyle(done ? LifeOSColor.success : LifeOSColor.accent)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle().fill(
                            (done ? LifeOSColor.success : LifeOSColor.accent).opacity(0.14)
                        )
                    )
                Text(habit.name)
                    .font(.system(size: 15, weight: .medium))
                    .strikethrough(done, color: LifeOSColor.fg3)
                    .foregroundStyle(done ? LifeOSColor.fg3 : .white)
                Spacer()
                Button {
                    Haptics.tick()
                    toggle(habit, todayStr: todayStr, done: done)
                } label: {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 26))
                        .foregroundStyle(done ? LifeOSColor.success : LifeOSColor.fg3)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func toggle(_ habit: HabitEntry, todayStr: String, done: Bool) {
        if done {
            habit.completedDates.removeAll { $0 == todayStr }
        } else {
            habit.completedDates.append(todayStr)
        }
        try? modelContext.save()
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
