import SwiftUI
import SwiftData

/// Full-screen in-progress workout. Mirrors the web's active-workout
/// page: header timer, exercise stack with sets, superset chrome, rest
/// banner, finish/cancel actions.
struct ActiveWorkoutView: View {
    @Bindable var store: ActiveWorkoutStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    /// Past sessions, most recent first. Used for two prefill features:
    /// (1) "Recent" exercises surfaced at the top of the picker,
    /// (2) seeding a new set's weight/reps from this exercise's previous
    /// top set when the current session has nothing to copy from yet.
    @Query(sort: \LiftSessionEntry.startedAt, order: .reverse) private var sessions: [LiftSessionEntry]

    @State private var pickerOpen = false
    @State private var rpeTarget: (UUID, UUID)?
    @State private var plateOpen: Double?
    @State private var confirmCancel = false
    @State private var now = Date()

    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(groupedExercises, id: \.id) { group in
                        if group.isSuperset {
                            supersetCard(for: group)
                        } else if let ex = group.exercises.first {
                            exerciseCard(ex, inSuperset: false, letter: nil)
                        }
                    }

                    addExerciseButton

                    Spacer(minLength: 120)
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)
            }
            footer
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .sheet(isPresented: $pickerOpen) {
            ExercisePickerView(recentNames: recentExerciseNames()) { name in
                store.addExercise(named: name)
            }
        }
        .sheet(item: rpeBinding) { target in
            RPEDrawer(exerciseID: target.exerciseID, setID: target.setID, store: store)
                .presentationDetents([.height(280)])
        }
        .sheet(item: $plateOpen.mapped()) { wrapper in
            PlateCalculator(totalWeight: wrapper.value)
                .presentationDetents([.height(360)])
        }
        .alert("Discard this workout?",
               isPresented: $confirmCancel) {
            Button("Keep going", role: .cancel) {}
            Button("Discard", role: .destructive) {
                store.cancel()
                dismiss()
            }
        } message: {
            Text("All logged sets will be deleted. Tap Finish on the bottom bar to save instead.")
        }
        .onReceive(tick) { _ in now = Date() }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .foregroundStyle(LifeOSColor.fg2)
                    .background(Circle().fill(LifeOSColor.elevated))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 1) {
                Text(store.workoutType ?? "Workout")
                    .font(.system(size: 15, weight: .semibold))
                Text(elapsed)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(LifeOSColor.fg2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 1) {
                Text("\(store.completedSetCount)")
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                Text("sets")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1)
                    .foregroundStyle(LifeOSColor.fg3)
            }
            VStack(alignment: .trailing, spacing: 1) {
                Text(volumeShort)
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                Text("VOL")
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(1)
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(LifeOSColor.base)
        .overlay(alignment: .bottom) {
            Divider().overlay(LifeOSColor.stroke)
        }
    }

    private var addExerciseButton: some View {
        Button {
            pickerOpen = true
            Haptics.tap()
        } label: {
            HStack {
                Image(systemName: "plus.circle.fill")
                Text("Add exercise").fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(LifeOSColor.accent)
            .glassCard(cornerRadius: 14)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Cards

    private func exerciseCard(
        _ ex: WorkoutExercise,
        inSuperset: Bool,
        letter: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let letter {
                    Text(letter)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(LifeOSColor.Metric.peak)
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(LifeOSColor.Metric.peak.opacity(0.18)))
                }
                Text(ex.name)
                    .font(.system(size: 16, weight: .semibold))
                Spacer()
                Menu {
                    Button { addSet(to: ex, isDrop: false) } label: {
                        Label("Add set", systemImage: "plus")
                    }
                    Button { addSet(to: ex, isDrop: true) } label: {
                        Label("Add drop set", systemImage: "arrow.down.right")
                    }
                    if !inSuperset, ex.sets.contains(where: \.completed) {
                        Button(role: .destructive) {
                            store.removeExercise(ex.id)
                        } label: {
                            Label("Remove exercise", systemImage: "trash")
                        }
                    } else {
                        Button(role: .destructive) {
                            store.removeExercise(ex.id)
                        } label: {
                            Label("Remove exercise", systemImage: "trash")
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 30, height: 30)
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }

            VStack(spacing: 6) {
                ForEach(Array(ex.sets.enumerated()), id: \.element.id) { idx, set in
                    SetRow(
                        index: idx + 1,
                        set: set,
                        onToggleComplete: { store.toggleSetComplete(exerciseID: ex.id, setID: set.id) },
                        onTapPlate: { plateOpen = set.weight },
                        onOpenRPE: { rpeTarget = (ex.id, set.id) },
                        onChangeWeight: { newW in
                            store.updateSet(exerciseID: ex.id, setID: set.id) { $0.weight = newW }
                        },
                        onChangeReps: { newR in
                            store.updateSet(exerciseID: ex.id, setID: set.id) { $0.reps = newR }
                        },
                        onDelete: { store.removeSet(exerciseID: ex.id, setID: set.id) }
                    )
                }

                HStack(spacing: 8) {
                    Button { addSet(to: ex, isDrop: false) } label: {
                        Label("Set", systemImage: "plus")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(LifeOSColor.elevated)
                            )
                            .foregroundStyle(LifeOSColor.fg)
                    }
                    .buttonStyle(.plain)

                    Button { addSet(to: ex, isDrop: true) } label: {
                        Label("Drop", systemImage: "arrow.down.right")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(LifeOSColor.warning.opacity(0.5), lineWidth: 1)
                            )
                            .foregroundStyle(LifeOSColor.warning)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .glassCard()
    }

    private func supersetCard(for group: ExerciseGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .font(.system(size: 11, weight: .bold))
                Text("SUPERSET")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                Spacer()
                Button {
                    if let a = group.exercises.first, let b = group.exercises.dropFirst().first {
                        store.toggleSuperset(a.id, with: b.id)
                    }
                } label: {
                    Image(systemName: "link.badge.minus")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
            .foregroundStyle(LifeOSColor.Metric.peak)

            ForEach(Array(group.exercises.enumerated()), id: \.element.id) { idx, ex in
                exerciseCard(ex, inSuperset: true, letter: letterFor(idx))
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(LifeOSColor.Metric.peak.opacity(0.35), lineWidth: 1)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LifeOSColor.Metric.peak.opacity(0.05))
                )
        )
    }

    private func letterFor(_ idx: Int) -> String {
        String(UnicodeScalar(65 + idx)!)
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: 0) {
            if let restEnds = store.restEndsAt, restEnds > now {
                restBanner(endsAt: restEnds)
            }
            HStack(spacing: 10) {
                Button(role: .destructive) {
                    confirmCancel = true
                } label: {
                    Text("Cancel")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .foregroundStyle(LifeOSColor.danger)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(LifeOSColor.danger.opacity(0.4), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)

                Button {
                    if let summary = store.finish() {
                        persistAndIngest(summary)
                    }
                    dismiss()
                } label: {
                    Text("Finish")
                        .font(.system(size: 14, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .foregroundStyle(.white)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(LifeOSColor.success)
                        )
                }
                .buttonStyle(.plain)
                .disabled(store.completedSetCount == 0)
                .opacity(store.completedSetCount == 0 ? 0.5 : 1)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 28)
            .background(.ultraThinMaterial)
        }
    }

    private func restBanner(endsAt: Date) -> some View {
        let remaining = max(0, endsAt.timeIntervalSince(now))
        let mm = Int(remaining) / 60
        let ss = Int(remaining) % 60
        return HStack {
            Image(systemName: "timer")
                .foregroundStyle(LifeOSColor.warning)
            Text(String(format: "%d:%02d", mm, ss))
                .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(LifeOSColor.warning)
            Spacer()
            Button { store.setRestTarget(store.restTargetSeconds + 30) } label: {
                Text("+30s")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().stroke(LifeOSColor.warning.opacity(0.5)))
                    .foregroundStyle(LifeOSColor.warning)
            }
            .buttonStyle(.plain)
            Button { store.skipRest() } label: {
                Text("Skip")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(LifeOSColor.warning))
                    .foregroundStyle(.black)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(LifeOSColor.warning.opacity(0.12))
        .overlay(alignment: .top) { Divider().overlay(LifeOSColor.warning.opacity(0.3)) }
    }

    /// Persist the just-finished workout to SwiftData and update PRs.
    private func persistAndIngest(_ summary: WorkoutSummary) {
        let json = (try? String(data: JSONEncoder().encode(summary.exercises), encoding: .utf8)) ?? "[]"
        let date = ISO8601DateFormatter.dateOnly.string(from: summary.startedAt)
        let entry = LiftSessionEntry(
            date: date,
            workoutType: summary.workoutType,
            startedAt: summary.startedAt,
            endedAt: summary.endedAt,
            totalVolumeLb: summary.totalVolume,
            setCount: summary.setCount,
            detailsJSON: json
        )
        modelContext.insert(entry)
        PersonalRecordsService.ingest(
            session: entry,
            exercises: summary.exercises,
            modelContext: modelContext
        )
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
    }

    // MARK: - Derived

    private var elapsed: String {
        guard let startedAt = store.startedAt else { return "0:00" }
        let seconds = Int(now.timeIntervalSince(startedAt))
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }

    private var volumeShort: String {
        let v = store.totalVolume
        if v >= 1000 { return String(format: "%.1fk", v / 1000) }
        return String(format: "%.0f", v)
    }

    /// Group exercises by supersetGroup so supersetted ones render in
    /// a single shared chrome.
    private var groupedExercises: [ExerciseGroup] {
        var groups: [ExerciseGroup] = []
        var seenGroups: Set<UUID> = []
        for ex in store.exercises {
            if let g = ex.supersetGroup {
                if seenGroups.contains(g) { continue }
                seenGroups.insert(g)
                let members = store.exercises.filter { $0.supersetGroup == g }
                groups.append(ExerciseGroup(id: g, isSuperset: true, exercises: members))
            } else {
                groups.append(ExerciseGroup(id: ex.id, isSuperset: false, exercises: [ex]))
            }
        }
        return groups
    }

    struct ExerciseGroup {
        let id: UUID
        let isSuperset: Bool
        let exercises: [WorkoutExercise]
    }

    // MARK: - History-seeded add-set

    /// Adds a set to `ex`, first looking up the top set from the user's
    /// most recent prior session of this exercise so the new set seeds
    /// with realistic weight + reps instead of the 45 × 8 fallback.
    private func addSet(to ex: WorkoutExercise, isDrop: Bool) {
        let seed = historyTopSet(for: ex.name)
        store.addSet(toExercise: ex.id, isDropSet: isDrop, historyTopSet: seed)
    }

    /// Walks past sessions (most recent first) for the first one that
    /// logged this exercise. Returns its best completed set by volume,
    /// falling back to the last logged set if no completed set exists.
    private func historyTopSet(for exerciseName: String) -> WorkoutSet? {
        let key = exerciseName.trimmingCharacters(in: .whitespaces).lowercased()
        for session in sessions {
            let decoded = CSVExporter.decodeExercises(session.detailsJSON)
            guard let match = decoded.first(where: {
                $0.name.trimmingCharacters(in: .whitespaces).lowercased() == key
            }) else { continue }
            let completed = match.sets.filter(\.completed)
            return completed.max(by: { $0.weight * Double($0.reps) < $1.weight * Double($1.reps) })
                ?? match.sets.last
        }
        return nil
    }

    /// Last `limit` unique exercise names from session history (most
    /// recent first). Surfaced in the picker's "Recent" section.
    private func recentExerciseNames(limit: Int = 6) -> [String] {
        var seen: Set<String> = []
        var out: [String] = []
        for session in sessions {
            let decoded = CSVExporter.decodeExercises(session.detailsJSON)
            for ex in decoded.reversed() {
                let key = ex.name.trimmingCharacters(in: .whitespaces).lowercased()
                if seen.insert(key).inserted {
                    out.append(ex.name)
                    if out.count >= limit { return out }
                }
            }
        }
        return out
    }

    // sheet-item helper for the RPE drawer (needs an Identifiable wrapper)
    struct RPESheetTarget: Identifiable {
        let exerciseID: UUID
        let setID: UUID
        var id: String { "\(exerciseID)-\(setID)" }
    }

    private var rpeBinding: Binding<RPESheetTarget?> {
        Binding(
            get: { rpeTarget.map { RPESheetTarget(exerciseID: $0.0, setID: $0.1) } },
            set: { rpeTarget = $0.map { ($0.exerciseID, $0.setID) } }
        )
    }
}

/// Wrap Double for `.sheet(item:)` (Double isn't Identifiable).
private struct DoubleWrapper: Identifiable {
    let value: Double
    var id: Double { value }
}

private extension Binding where Value == Double? {
    func mapped() -> Binding<DoubleWrapper?> {
        Binding<DoubleWrapper?>(
            get: { wrappedValue.map { DoubleWrapper(value: $0) } },
            set: { wrappedValue = $0?.value }
        )
    }
}
