import Foundation
import SwiftData

/// One row per (exercise, PR kind) — the best result the user has hit.
/// Promoted by `PersonalRecordsService` after each finished workout.
@Model
final class PersonalRecord {
    @Attribute(.unique) var id: UUID
    /// Normalized exercise name (lowercased, trimmed).
    var exerciseKey: String
    /// Original display name as it was logged.
    var exerciseDisplayName: String
    /// PR category — "1rm", "reps_at_5", "reps_at_10", "max_volume", "max_sets_session", etc.
    var kind: String
    var value: Double
    var achievedAt: Date
    var seasonYear: Int

    init(exerciseDisplayName: String, kind: PRKind, value: Double, achievedAt: Date = Date()) {
        self.id = UUID()
        self.exerciseDisplayName = exerciseDisplayName
        self.exerciseKey = exerciseDisplayName.trimmingCharacters(in: .whitespaces).lowercased()
        self.kind = kind.rawValue
        self.value = value
        self.achievedAt = achievedAt
        self.seasonYear = Calendar.current.component(.year, from: achievedAt)
    }

    var prKind: PRKind { PRKind(rawValue: kind) ?? .oneRepMax }
}

enum PRKind: String, CaseIterable {
    case oneRepMax          = "1rm"
    case heaviestWeight     = "heaviest_weight"
    case mostReps           = "most_reps"
    case maxVolumeSession   = "max_volume_session"
    case maxSetsSession     = "max_sets_session"
    case maxRepsSession     = "max_reps_session"

    var label: String {
        switch self {
        case .oneRepMax:        return "Estimated 1RM"
        case .heaviestWeight:   return "Heaviest weight"
        case .mostReps:         return "Most reps"
        case .maxVolumeSession: return "Max session volume"
        case .maxSetsSession:   return "Max sets in a session"
        case .maxRepsSession:   return "Max reps in a session"
        }
    }
}

/// Brzycki 1RM estimate. Conservative (better than Epley for reps > 5).
func estimate1RM(weight: Double, reps: Int) -> Double {
    guard weight > 0, reps > 0, reps < 37 else { return 0 }
    if reps == 1 { return weight }
    return weight * 36.0 / (37.0 - Double(reps))
}
