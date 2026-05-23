import Foundation
import Observation

// MARK: - Domain types

struct WorkoutSet: Identifiable, Codable, Hashable {
    let id: UUID
    var weight: Double
    var reps: Int
    var rpe: Double?
    var completed: Bool
    /// Drop set — visually marked with a ↓ and contributes to "drop set"
    /// counts in workout summary.
    var isDropSet: Bool

    init(weight: Double, reps: Int, completed: Bool = false, isDropSet: Bool = false, rpe: Double? = nil) {
        self.id = UUID()
        self.weight = weight
        self.reps = reps
        self.rpe = rpe
        self.completed = completed
        self.isDropSet = isDropSet
    }
}

struct WorkoutExercise: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var sets: [WorkoutSet]
    /// Set of exercise IDs this one is supersetted with. When two or
    /// more exercises share the same supersetGroup UUID, they form an
    /// A/B/C group rendered with shared chrome.
    var supersetGroup: UUID?
    var notes: String?

    init(name: String, sets: [WorkoutSet] = []) {
        self.id = UUID()
        self.name = name
        self.sets = sets
    }
}

// MARK: - Active workout store

/// Single source of truth for the in-flight workout. Inject via
/// `@Environment(ActiveWorkoutStore.self)` so every screen sees the
/// same instance. Holds exercises, rest target, last-set timestamp,
/// and pushes updates to the Live Activity on every meaningful change.
@MainActor
@Observable
final class ActiveWorkoutStore {
    var workoutType: String?
    var startedAt: Date?
    var exercises: [WorkoutExercise] = []
    var restTargetSeconds: Int = 120
    var lastSetAt: Date?
    var restDismissedAt: Date?

    var isActive: Bool { startedAt != nil }

    var completedSetCount: Int {
        exercises.reduce(0) { $0 + $1.sets.filter(\.completed).count }
    }

    var totalVolume: Double {
        exercises.reduce(0) { acc, ex in
            acc + ex.sets
                .filter(\.completed)
                .reduce(0) { $0 + $1.weight * Double($1.reps) }
        }
    }

    var lastCompletedSetSummary: (exercise: String, summary: String)? {
        for ex in exercises.reversed() {
            if let last = ex.sets.last(where: \.completed) {
                let w = last.weight > 0 ? "\(Int(last.weight))" : "BW"
                return (ex.name, "\(w) × \(last.reps)")
            }
        }
        return nil
    }

    var restEndsAt: Date? {
        guard let lastSetAt, restTargetSeconds > 0, restDismissedAt == nil else { return nil }
        return lastSetAt.addingTimeInterval(TimeInterval(restTargetSeconds))
    }

    // MARK: - Mutations

    func start(workoutType: String) {
        self.workoutType = workoutType
        self.startedAt = Date()
        self.exercises = []
        self.lastSetAt = nil
        self.restDismissedAt = nil
        Haptics.success()
        LiveActivityManager.shared.start(workoutType: workoutType)
    }

    /// Start a workout pre-populated from a WorkoutTemplate. Each
    /// template exercise contributes an exercise with `targetSets`
    /// empty sets (weight 0, target reps). Rest target is taken from
    /// the first exercise so the Live Activity timer behaves
    /// sensibly out of the gate; per-set rest can still be tuned
    /// inside the active view.
    func start(template: WorkoutTemplate) {
        self.workoutType = template.name
        self.startedAt = Date()
        self.exercises = template.exercises.map { tx in
            WorkoutExercise(
                name: tx.name,
                sets: (0..<max(1, tx.sets)).map { _ in
                    WorkoutSet(weight: 0, reps: tx.reps)
                }
            )
        }
        if let firstRest = template.exercises.first?.restSec, firstRest > 0 {
            self.restTargetSeconds = firstRest
        }
        self.lastSetAt = nil
        self.restDismissedAt = nil
        Haptics.success()
        LiveActivityManager.shared.start(workoutType: template.name)
        pushLiveActivity()
    }

    func cancel() {
        Haptics.warning()
        LiveActivityManager.shared.end()
        reset()
    }

    func finish() -> WorkoutSummary? {
        guard let startedAt else { return nil }
        let summary = WorkoutSummary(
            workoutType: workoutType ?? "Workout",
            startedAt: startedAt,
            endedAt: Date(),
            exercises: exercises,
            totalVolume: totalVolume,
            setCount: completedSetCount
        )
        Haptics.success()
        LiveActivityManager.shared.end()
        reset()
        return summary
    }

    private func reset() {
        workoutType = nil
        startedAt = nil
        exercises = []
        lastSetAt = nil
        restDismissedAt = nil
    }

    func addExercise(named name: String) {
        exercises.append(WorkoutExercise(name: name))
        Haptics.tick()
        pushLiveActivity()
    }

    func removeExercise(_ exerciseID: UUID) {
        exercises.removeAll { $0.id == exerciseID }
        Haptics.warning()
        pushLiveActivity()
    }

    /// Prefill cascade for a new set's weight + reps:
    ///   1. last completed set in this session
    ///   2. last set in this session (even if incomplete)
    ///   3. `historyTopSet` — top set from the most recent prior session
    ///      of this exercise (view layer fetches this from SwiftData)
    ///   4. 45 lb × 8 reps fallback
    /// Drop sets auto-decay the resulting weight to 80%, rounded to 5 lb.
    func addSet(
        toExercise exerciseID: UUID,
        isDropSet: Bool = false,
        historyTopSet: WorkoutSet? = nil
    ) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
        let lastCompleted = exercises[idx].sets.last(where: \.completed)
        let lastAny = exercises[idx].sets.last
        let seedSet = lastCompleted ?? lastAny ?? historyTopSet
        var seedWeight = seedSet?.weight ?? 45
        let seedReps = seedSet?.reps ?? 8
        if isDropSet, seedWeight > 0 {
            seedWeight = (seedWeight * 0.8 / 5).rounded() * 5
        }
        var s = WorkoutSet(weight: seedWeight, reps: seedReps, completed: false, isDropSet: isDropSet)
        s.rpe = nil
        exercises[idx].sets.append(s)
        Haptics.tap()
    }

    func updateSet(exerciseID: UUID, setID: UUID, transform: (inout WorkoutSet) -> Void) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseID }),
              let setIdx = exercises[exIdx].sets.firstIndex(where: { $0.id == setID }) else { return }
        transform(&exercises[exIdx].sets[setIdx])
        pushLiveActivity()
    }

    func toggleSetComplete(exerciseID: UUID, setID: UUID) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseID }),
              let setIdx = exercises[exIdx].sets.firstIndex(where: { $0.id == setID }) else { return }
        let wasComplete = exercises[exIdx].sets[setIdx].completed
        exercises[exIdx].sets[setIdx].completed.toggle()
        if !wasComplete {
            lastSetAt = Date()
            restDismissedAt = nil
            Haptics.success()
        } else {
            Haptics.tick()
        }
        pushLiveActivity()
    }

    func removeSet(exerciseID: UUID, setID: UUID) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseID }) else { return }
        exercises[exIdx].sets.removeAll { $0.id == setID }
        Haptics.warning()
        pushLiveActivity()
    }

    func toggleSuperset(_ aID: UUID, with bID: UUID) {
        guard let aIdx = exercises.firstIndex(where: { $0.id == aID }),
              let bIdx = exercises.firstIndex(where: { $0.id == bID }) else { return }
        // If they already share a group, break; otherwise unify both onto
        // a single new group ID.
        let groupA = exercises[aIdx].supersetGroup
        let groupB = exercises[bIdx].supersetGroup
        if let g = groupA, g == groupB {
            exercises[aIdx].supersetGroup = nil
            exercises[bIdx].supersetGroup = nil
        } else {
            let newGroup = groupA ?? groupB ?? UUID()
            exercises[aIdx].supersetGroup = newGroup
            exercises[bIdx].supersetGroup = newGroup
        }
        Haptics.tick()
    }

    func setRestTarget(_ seconds: Int) {
        restTargetSeconds = max(0, seconds)
        restDismissedAt = nil
        pushLiveActivity()
    }

    func skipRest() {
        restDismissedAt = Date()
        Haptics.tick()
        pushLiveActivity()
    }

    // MARK: - Live Activity push

    /// Pull the most recently completed set's 1RM estimate + PR flag
    /// from in-memory state — when the consumer wants to flag a PR
    /// in the Live Activity, this is the surface.
    private var lastSetMeta: (oneRM: Double?, isPR: Bool) {
        for ex in exercises.reversed() {
            if let last = ex.sets.last(where: \.completed) {
                let oneRM = estimate1RM(weight: last.weight, reps: last.reps)
                return (oneRM > 0 ? oneRM : nil, false)
            }
        }
        return (nil, false)
    }

    /// Find the first not-fully-completed exercise after the most-recent
    /// one — used as the "Next" hint in the Live Activity.
    private var nextExercise: WorkoutExercise? {
        // If no sets have been completed yet, "next" is the first exercise.
        guard let lastCompletedExIdx = exercises.lastIndex(where: { $0.sets.contains(where: \.completed) }) else {
            return exercises.first
        }
        // Look forward; if everything ahead is done, fall back to the
        // first incomplete exercise from the top.
        if let forward = exercises[(lastCompletedExIdx + 1)...].first(where: { ex in
            ex.sets.isEmpty || ex.sets.contains(where: { !$0.completed })
        }) {
            return forward
        }
        return exercises.first(where: { ex in
            ex.sets.isEmpty || ex.sets.contains(where: { !$0.completed })
        })
    }

    private var completedExerciseCount: Int {
        exercises.filter { ex in
            !ex.sets.isEmpty && ex.sets.allSatisfy(\.completed)
        }.count
    }

    func pushLiveActivity() {
        guard isActive else { return }
        let last = lastCompletedSetSummary
        let meta = lastSetMeta
        // Rough strength kcal — 0.05 kcal per lb of volume. Better than
        // showing zero, conservative enough to not over-promise.
        let kcal = totalVolume * 0.05
        let next = nextExercise
        let state = WorkoutActivityAttributes.ContentState(
            setsCompleted: completedSetCount,
            totalVolume: totalVolume,
            exerciseCount: exercises.count,
            completedExerciseCount: completedExerciseCount,
            lastExerciseName: last?.exercise,
            lastSetSummary: last?.summary,
            lastSetEstOneRM: meta.oneRM,
            lastSetIsPR: meta.isPR,
            restEndsAt: restEndsAt,
            restTargetSeconds: restTargetSeconds,
            nextExerciseName: next?.name,
            nextExerciseSetCount: next?.sets.count,
            estimatedKcal: kcal > 0 ? kcal : nil
        )
        LiveActivityManager.shared.update(state)
    }

    // MARK: - Command consumer hookup

    func apply(_ command: WorkoutCommandConsumer.Command) {
        switch command {
        case .completeSet:
            // Find next un-completed set in the most-recently-used exercise.
            for exIdx in (0..<exercises.count).reversed() {
                if let pending = exercises[exIdx].sets.firstIndex(where: { !$0.completed }) {
                    let exID = exercises[exIdx].id
                    let setID = exercises[exIdx].sets[pending].id
                    toggleSetComplete(exerciseID: exID, setID: setID)
                    return
                }
            }
        case .addRest(let seconds):
            setRestTarget(restTargetSeconds + Int(seconds))
        case .skipRest:
            skipRest()
        case .finish:
            _ = finish()
        }
    }
}

struct WorkoutSummary {
    let workoutType: String
    let startedAt: Date
    let endedAt: Date
    let exercises: [WorkoutExercise]
    let totalVolume: Double
    let setCount: Int
}
