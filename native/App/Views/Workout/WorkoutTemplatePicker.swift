import SwiftUI
import SwiftData

/// Sheet of saved workout templates (built-ins + user customs). Tap
/// to start a workout pre-populated with the template's exercises +
/// target sets. "Blank workout" stays as the top option for the
/// freeform path GymView already supported.
struct WorkoutTemplatePicker: View {
    @Query(sort: \WorkoutTemplate.createdAt) private var templates: [WorkoutTemplate]
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(ActiveWorkoutStore.self) private var workoutStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    blankRow
                    if !builtIns.isEmpty {
                        sectionLabel("Programs")
                        ForEach(builtIns) { tpl in
                            templateRow(tpl)
                        }
                    }
                    if !customs.isEmpty {
                        sectionLabel("Your templates")
                        ForEach(customs) { tpl in
                            templateRow(tpl)
                        }
                    }
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Start a workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
            }
        }
    }

    private var builtIns: [WorkoutTemplate] {
        templates.filter(\.isBuiltIn)
    }
    private var customs: [WorkoutTemplate] {
        templates.filter { !$0.isBuiltIn }
    }

    private func sectionLabel(_ text: String) -> some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private var blankRow: some View {
        Button {
            Haptics.success()
            workoutStore.start(workoutType: "Workout")
            dismiss()
        } label: {
            Card(tint: LifeOSColor.accent) {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.accent.opacity(0.22))
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(LifeOSColor.accent)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Blank workout")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Pick exercises by muscle as you go.")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(LifeOSColor.accent))
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
    }

    private func templateRow(_ tpl: WorkoutTemplate) -> some View {
        Button {
            Haptics.success()
            workoutStore.start(template: tpl)
            dismiss()
        } label: {
            Card {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.Metric.strain.opacity(0.18))
                        Image(systemName: tpl.icon)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(LifeOSColor.Metric.strain)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tpl.name)
                            .font(.system(size: 14, weight: .semibold))
                        Text(subtitle(tpl))
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(totalSets(tpl)) sets")
                            .font(.system(size: 11, weight: .semibold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.Metric.strain)
                        Text("\(tpl.exercises.count) exercises")
                            .font(.system(size: 10))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
        .contextMenu {
            if !tpl.isBuiltIn {
                Button(role: .destructive) {
                    modelContext.delete(tpl)
                    try? modelContext.save()
                    Haptics.warning()
                } label: {
                    Label("Delete template", systemImage: "trash")
                }
            }
        }
    }

    private func subtitle(_ tpl: WorkoutTemplate) -> String {
        if !tpl.notes.isEmpty { return tpl.notes }
        return tpl.exercises.prefix(3).map(\.name).joined(separator: " · ")
    }

    private func totalSets(_ tpl: WorkoutTemplate) -> Int {
        tpl.exercises.reduce(0) { $0 + $1.sets }
    }
}
