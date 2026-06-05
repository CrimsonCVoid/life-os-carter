import Foundation
import SwiftUI

/// Resolves a freeform exercise name (logged in a LiftSessionEntry) to
/// one of ExerciseCatalogItem.Muscle.* by checking the curated catalog
/// first, then falling back to a coarse keyword match. Anything that
/// can't be classified lands in `.other` so it still appears in
/// volume-by-muscle totals as a residual.
enum MuscleResolver {
    static func resolve(_ name: String) -> ExerciseCatalogItem.Muscle? {
        let needle = name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if let exact = ExerciseLibrary.all.first(where: { $0.name.lowercased() == needle }) {
            return exact.muscle
        }
        // Loose contains match — catches "incline DB press" → "incline dumbbell press"
        if let loose = ExerciseLibrary.all.first(where: {
            needle.contains($0.name.lowercased()) || $0.name.lowercased().contains(needle)
        }) {
            return loose.muscle
        }
        // Keyword heuristics for custom freeform names.
        for (keywords, muscle) in keywordMap {
            if keywords.contains(where: { needle.contains($0) }) { return muscle }
        }
        return nil
    }

    private static let keywordMap: [(Set<String>, ExerciseCatalogItem.Muscle)] = [
        (["bench", "fly", "pec", "chest", "push"], .chest),
        (["row", "pulldown", "pull-up", "pullup", "deadlift", "lat", "back"], .back),
        (["press", "lateral", "delt", "shoulder", "shrug"], .shoulders),
        (["curl", "tricep", "skull", "extension"], .arms),
        (["squat", "lunge", "leg", "calf", "quad", "hamstring", "split"], .legs),
        (["glute", "hip thrust", "bridge", "kickback"], .glutes),
        (["plank", "crunch", "sit-up", "situp", "ab", "core", "russian"], .core),
        (["run", "bike", "row", "elliptical", "treadmill", "swim"], .cardio),
    ]
}

/// 7-day per-muscle volume rollup from completed LiftSessionEntry rows.
/// `volume` is the lb×reps total summed across every completed set
/// whose exercise resolves to that muscle. Unclassified exercises land
/// under `.cardio` only when their name suggests cardio; otherwise
/// they're omitted from the bars (rather than dumped into a misleading
/// catch-all).
struct MuscleVolumeRollup {
    struct Entry: Identifiable {
        var id: String { muscle.rawValue }
        let muscle: ExerciseCatalogItem.Muscle
        let volume: Double
        let setCount: Int
    }

    let entries: [Entry]
    let totalVolume: Double
    let totalSets: Int
    let windowDays: Int

    @MainActor
    static func compute(
        sessions: [LiftSessionEntry],
        windowDays: Int = 7
    ) -> MuscleVolumeRollup {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let cutoff = cal.date(byAdding: .day, value: -windowDays + 1, to: today) ?? today

        var byMuscle: [ExerciseCatalogItem.Muscle: (vol: Double, sets: Int)] = [:]
        for s in sessions where s.startedAt >= cutoff {
            let decoded = CSVExporter.decodeExercises(s.detailsJSON)
            for ex in decoded {
                guard let m = MuscleResolver.resolve(ex.name) else { continue }
                let completed = ex.sets.filter(\.completed)
                let vol = completed.reduce(0.0) { $0 + $1.weight * Double($1.reps) }
                let current = byMuscle[m] ?? (0, 0)
                byMuscle[m] = (current.vol + vol, current.sets + completed.count)
            }
        }
        let entries = byMuscle
            .map { Entry(muscle: $0.key, volume: $0.value.vol, setCount: $0.value.sets) }
            .sorted { $0.volume > $1.volume }
        let totalVol = entries.reduce(0.0) { $0 + $1.volume }
        let totalSets = entries.reduce(0) { $0 + $1.setCount }
        return MuscleVolumeRollup(
            entries: entries,
            totalVolume: totalVol,
            totalSets: totalSets,
            windowDays: windowDays
        )
    }
}

extension ExerciseCatalogItem.Muscle {
    var displayName: String {
        switch self {
        case .chest:     return "Chest"
        case .back:      return "Back"
        case .shoulders: return "Shoulders"
        case .arms:      return "Arms"
        case .legs:      return "Legs"
        case .glutes:    return "Glutes"
        case .core:      return "Core"
        case .cardio:    return "Cardio"
        }
    }

    /// Single source of truth for the per-muscle chart color, shared by
    /// MuscleVolumeCard and the periodization weekly-volume chart.
    var chartTint: Color {
        switch self {
        case .chest:     return LifeOSColor.Metric.protein
        case .back:      return LifeOSColor.Metric.sleep
        case .shoulders: return LifeOSColor.warning
        case .arms:      return LifeOSColor.Metric.peak
        case .legs:      return LifeOSColor.success
        case .glutes:    return LifeOSColor.Metric.calories
        case .core:      return LifeOSColor.Metric.water
        case .cardio:    return LifeOSColor.danger
        }
    }

    var icon: String {
        switch self {
        case .chest:     return "figure.strengthtraining.traditional"
        case .back:      return "figure.strengthtraining.functional"
        case .shoulders: return "figure.arms.open"
        case .arms:      return "dumbbell.fill"
        case .legs:      return "figure.run"
        case .glutes:    return "figure.walk"
        case .core:      return "figure.core.training"
        case .cardio:    return "heart.fill"
        }
    }
}
