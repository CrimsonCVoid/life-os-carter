import Foundation
import SwiftData

/// Computes and persists PRs from a completed workout. Called once
/// after every workout finishes; reads existing PRs for the exercise +
/// promotes any newly-broken records.
@MainActor
enum PersonalRecordsService {
    static func ingest(
        session: LiftSessionEntry,
        exercises: [WorkoutExercise],
        modelContext: ModelContext
    ) {
        // Session-level aggregates
        let totalVol = exercises.reduce(0) { acc, ex in
            acc + ex.sets.filter(\.completed).reduce(0) { $0 + $1.weight * Double($1.reps) }
        }
        let setCount = exercises.reduce(0) { $0 + $1.sets.filter(\.completed).count }
        let repCount = exercises.reduce(0) { $0 + $1.sets.filter(\.completed).reduce(0) { $0 + $1.reps } }

        promoteIfBeats("__session__", "Session", .maxVolumeSession, totalVol, session.startedAt, modelContext)
        promoteIfBeats("__session__", "Session", .maxSetsSession, Double(setCount), session.startedAt, modelContext)
        promoteIfBeats("__session__", "Session", .maxRepsSession, Double(repCount), session.startedAt, modelContext)

        // Per-exercise PRs
        for ex in exercises {
            let key = ex.name.lowercased().trimmingCharacters(in: .whitespaces)
            for set in ex.sets where set.completed && set.weight > 0 {
                let oneRM = estimate1RM(weight: set.weight, reps: set.reps)
                promoteIfBeats(key, ex.name, .oneRepMax,        oneRM,                  session.startedAt, modelContext)
                promoteIfBeats(key, ex.name, .heaviestWeight,   set.weight,             session.startedAt, modelContext)
                promoteIfBeats(key, ex.name, .mostReps,         Double(set.reps),       session.startedAt, modelContext)
            }
        }
    }

    private static func promoteIfBeats(
        _ exerciseKey: String,
        _ exerciseDisplayName: String,
        _ kind: PRKind,
        _ value: Double,
        _ at: Date,
        _ modelContext: ModelContext
    ) {
        guard value > 0 else { return }
        // Bind raw values into locals — SwiftData's #Predicate macro
        // can't always infer types through enum.rawValue calls.
        let key = exerciseKey
        let kindRaw = kind.rawValue
        let predicate = #Predicate<PersonalRecord> { pr in
            pr.exerciseKey == key && pr.kind == kindRaw
        }
        let descriptor = FetchDescriptor<PersonalRecord>(predicate: predicate)
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        let allTimeBest = existing.max(by: { $0.value < $1.value })
        if let allTimeBest, allTimeBest.value >= value { return }
        let pr = PersonalRecord(
            exerciseDisplayName: exerciseDisplayName,
            kind: kind,
            value: value,
            achievedAt: at
        )
        modelContext.insert(pr)
    }

    /// Quick fetch — current all-time best per kind for an exercise.
    static func best(
        forExercise name: String,
        kind: PRKind,
        modelContext: ModelContext
    ) -> PersonalRecord? {
        let key = name.lowercased().trimmingCharacters(in: .whitespaces)
        let kindRaw = kind.rawValue
        let predicate = #Predicate<PersonalRecord> { pr in
            pr.exerciseKey == key && pr.kind == kindRaw
        }
        let descriptor = FetchDescriptor<PersonalRecord>(predicate: predicate)
        let rows = (try? modelContext.fetch(descriptor)) ?? []
        return rows.max(by: { $0.value < $1.value })
    }
}
