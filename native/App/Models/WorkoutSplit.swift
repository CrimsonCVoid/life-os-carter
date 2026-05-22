import Foundation
import SwiftData

/// User's currently-selected training split. A single row exists at a
/// time (we delete + insert on switch). Each split has a fixed array
/// of day templates referenced by index.
@Model
final class WorkoutSplit {
    @Attribute(.unique) var id: UUID
    var kind: String          // SplitKind.rawValue
    var customName: String?
    var createdAt: Date

    @Relationship(deleteRule: .cascade, inverse: \WorkoutTemplate.split)
    var days: [WorkoutTemplate] = []

    init(kind: SplitKind, customName: String? = nil) {
        self.id = UUID()
        self.kind = kind.rawValue
        self.customName = customName
        self.createdAt = Date()
    }

    var splitKind: SplitKind { SplitKind(rawValue: kind) ?? .custom }
    var displayName: String { customName ?? splitKind.displayName }
}

/// One day inside a split. "Push Day" / "Pull Day" / etc. Stores the
/// ordered exercise list — sets/weights default seed from the previous
/// session of the same exercise.
@Model
final class WorkoutTemplate {
    @Attribute(.unique) var id: UUID
    var name: String
    var order: Int
    /// JSON-encoded array of exercise names (kept simple — no need for
    /// a separate entity at this scale).
    var exerciseNamesJSON: String
    /// Default rest target in seconds when this day's workout starts.
    var defaultRestSeconds: Int

    var split: WorkoutSplit?

    init(name: String, order: Int, exerciseNames: [String] = [], defaultRestSeconds: Int = 120) {
        self.id = UUID()
        self.name = name
        self.order = order
        self.exerciseNamesJSON = encode(exerciseNames)
        self.defaultRestSeconds = defaultRestSeconds
    }

    var exerciseNames: [String] {
        get { (try? JSONDecoder().decode([String].self, from: Data(exerciseNamesJSON.utf8))) ?? [] }
        set { exerciseNamesJSON = encode(newValue) }
    }
}

private func encode(_ names: [String]) -> String {
    (try? String(data: JSONEncoder().encode(names), encoding: .utf8)) ?? "[]"
}

// MARK: - Split catalog

enum SplitKind: String, CaseIterable, Identifiable {
    case upperLower    = "upper-lower"
    case ppl           = "ppl"
    case broSplit      = "bro-split"
    case arnoldSplit   = "arnold-split"
    case fullBody      = "full-body"
    case custom        = "custom"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .upperLower:  return "Upper / Lower"
        case .ppl:         return "Push · Pull · Legs"
        case .broSplit:    return "Bro Split"
        case .arnoldSplit: return "Arnold Split"
        case .fullBody:    return "Full Body"
        case .custom:      return "Custom"
        }
    }

    var subtitle: String {
        switch self {
        case .upperLower:  return "2-day · alternate"
        case .ppl:         return "3-day · classic hypertrophy"
        case .broSplit:    return "5-day · isolation focus"
        case .arnoldSplit: return "3-day · antagonist pairing"
        case .fullBody:    return "3-day · compound focus"
        case .custom:      return "Roll your own days"
        }
    }

    var icon: String {
        switch self {
        case .upperLower:  return "rectangle.split.1x2"
        case .ppl:         return "circle.grid.3x1"
        case .broSplit:    return "square.grid.3x2.fill"
        case .arnoldSplit: return "figure.strengthtraining.traditional"
        case .fullBody:    return "figure.mixed.cardio"
        case .custom:      return "slider.horizontal.3"
        }
    }

    /// Pre-built day templates for each split. Custom returns an empty
    /// list — the user builds it from scratch.
    var defaultDays: [(name: String, exercises: [String])] {
        switch self {
        case .upperLower:
            return [
                ("Upper",
                 ["Bench Press", "Barbell Row", "Overhead Press", "Pull-ups", "Dumbbell Curl", "Tricep Pushdown"]),
                ("Lower",
                 ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise"]),
            ]
        case .ppl:
            return [
                ("Push Day",
                 ["Bench Press", "Overhead Press", "Incline Dumbbell Press", "Lateral Raise", "Tricep Pushdown", "Cable Fly"]),
                ("Pull Day",
                 ["Deadlift", "Pull-ups", "Barbell Row", "Lat Pulldown", "Face Pull", "Dumbbell Curl"]),
                ("Leg Day",
                 ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Leg Extension", "Calf Raise"]),
            ]
        case .broSplit:
            return [
                ("Chest",
                 ["Bench Press", "Incline Dumbbell Press", "Dips", "Cable Fly", "Pec Deck"]),
                ("Back",
                 ["Deadlift", "Pull-ups", "Barbell Row", "Seated Cable Row", "Lat Pulldown"]),
                ("Shoulders",
                 ["Overhead Press", "Lateral Raise", "Rear Delt Fly", "Arnold Press", "Face Pull"]),
                ("Arms",
                 ["Barbell Curl", "Hammer Curl", "Skull Crushers", "Tricep Pushdown", "Preacher Curl", "Cable Curl"]),
                ("Legs",
                 ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Leg Extension", "Calf Raise"]),
            ]
        case .arnoldSplit:
            return [
                ("Chest & Back",
                 ["Bench Press", "Pull-ups", "Incline Dumbbell Press", "Barbell Row", "Cable Fly", "Lat Pulldown"]),
                ("Legs",
                 ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise"]),
                ("Arms & Shoulders",
                 ["Overhead Press", "Barbell Curl", "Skull Crushers", "Lateral Raise", "Hammer Curl", "Tricep Pushdown"]),
            ]
        case .fullBody:
            return [
                ("Day A",
                 ["Back Squat", "Bench Press", "Barbell Row", "Overhead Press", "Plank"]),
                ("Day B",
                 ["Deadlift", "Incline Dumbbell Press", "Pull-ups", "Lateral Raise", "Hanging Leg Raise"]),
                ("Day C",
                 ["Front Squat", "Dips", "Seated Cable Row", "Arnold Press", "Calf Raise"]),
            ]
        case .custom:
            return []
        }
    }

    func makeTemplates() -> [WorkoutTemplate] {
        defaultDays.enumerated().map { idx, day in
            WorkoutTemplate(name: day.name, order: idx, exerciseNames: day.exercises)
        }
    }
}

// MARK: - Personal records

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
