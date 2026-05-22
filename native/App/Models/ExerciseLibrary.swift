import Foundation

/// Curated catalog of common lifts grouped by muscle. Mirrors the web
/// app's exercise picker. Users can also type a freeform name to add
/// custom exercises — those don't need to live here.
struct ExerciseCatalogItem: Identifiable, Hashable {
    let id: String
    let name: String
    let muscle: Muscle
    let equipment: Equipment

    enum Muscle: String, CaseIterable {
        case chest, back, shoulders, arms, legs, glutes, core, cardio
    }

    enum Equipment: String, CaseIterable {
        case barbell, dumbbell, machine, cable, bodyweight, other
    }
}

enum ExerciseLibrary {
    static let all: [ExerciseCatalogItem] = [
        // Chest
        .init(id: "bench-press",       name: "Bench Press",            muscle: .chest,     equipment: .barbell),
        .init(id: "incline-bench",     name: "Incline Bench Press",    muscle: .chest,     equipment: .barbell),
        .init(id: "db-bench",          name: "Dumbbell Bench Press",   muscle: .chest,     equipment: .dumbbell),
        .init(id: "incline-db",        name: "Incline Dumbbell Press", muscle: .chest,     equipment: .dumbbell),
        .init(id: "push-ups",          name: "Push-ups",               muscle: .chest,     equipment: .bodyweight),
        .init(id: "dips",              name: "Dips",                   muscle: .chest,     equipment: .bodyweight),
        .init(id: "cable-fly",         name: "Cable Fly",              muscle: .chest,     equipment: .cable),
        .init(id: "pec-deck",          name: "Pec Deck",               muscle: .chest,     equipment: .machine),

        // Back
        .init(id: "deadlift",          name: "Deadlift",               muscle: .back,      equipment: .barbell),
        .init(id: "barbell-row",       name: "Barbell Row",            muscle: .back,      equipment: .barbell),
        .init(id: "pendlay-row",       name: "Pendlay Row",            muscle: .back,      equipment: .barbell),
        .init(id: "pull-ups",          name: "Pull-ups",               muscle: .back,      equipment: .bodyweight),
        .init(id: "chin-ups",          name: "Chin-ups",               muscle: .back,      equipment: .bodyweight),
        .init(id: "lat-pulldown",      name: "Lat Pulldown",           muscle: .back,      equipment: .cable),
        .init(id: "seated-row",        name: "Seated Cable Row",       muscle: .back,      equipment: .cable),
        .init(id: "db-row",            name: "Dumbbell Row",           muscle: .back,      equipment: .dumbbell),
        .init(id: "face-pull",         name: "Face Pull",              muscle: .back,      equipment: .cable),

        // Shoulders
        .init(id: "ohp",               name: "Overhead Press",         muscle: .shoulders, equipment: .barbell),
        .init(id: "db-shoulder-press", name: "Dumbbell Shoulder Press", muscle: .shoulders, equipment: .dumbbell),
        .init(id: "lateral-raise",     name: "Lateral Raise",          muscle: .shoulders, equipment: .dumbbell),
        .init(id: "rear-delt-fly",     name: "Rear Delt Fly",          muscle: .shoulders, equipment: .dumbbell),
        .init(id: "cable-lateral",     name: "Cable Lateral Raise",    muscle: .shoulders, equipment: .cable),
        .init(id: "arnold-press",      name: "Arnold Press",           muscle: .shoulders, equipment: .dumbbell),

        // Arms
        .init(id: "barbell-curl",      name: "Barbell Curl",           muscle: .arms,      equipment: .barbell),
        .init(id: "db-curl",           name: "Dumbbell Curl",          muscle: .arms,      equipment: .dumbbell),
        .init(id: "hammer-curl",       name: "Hammer Curl",            muscle: .arms,      equipment: .dumbbell),
        .init(id: "preacher-curl",     name: "Preacher Curl",          muscle: .arms,      equipment: .barbell),
        .init(id: "tricep-pushdown",   name: "Tricep Pushdown",        muscle: .arms,      equipment: .cable),
        .init(id: "overhead-tri",      name: "Overhead Tricep Ext",    muscle: .arms,      equipment: .dumbbell),
        .init(id: "skull-crushers",    name: "Skull Crushers",         muscle: .arms,      equipment: .barbell),
        .init(id: "cable-curl",        name: "Cable Curl",             muscle: .arms,      equipment: .cable),

        // Legs
        .init(id: "back-squat",        name: "Back Squat",             muscle: .legs,      equipment: .barbell),
        .init(id: "front-squat",       name: "Front Squat",            muscle: .legs,      equipment: .barbell),
        .init(id: "romanian-dl",       name: "Romanian Deadlift",      muscle: .legs,      equipment: .barbell),
        .init(id: "leg-press",         name: "Leg Press",              muscle: .legs,      equipment: .machine),
        .init(id: "lunges",            name: "Lunges",                 muscle: .legs,      equipment: .dumbbell),
        .init(id: "bulgarian-split",   name: "Bulgarian Split Squat",  muscle: .legs,      equipment: .dumbbell),
        .init(id: "leg-extension",     name: "Leg Extension",          muscle: .legs,      equipment: .machine),
        .init(id: "leg-curl",          name: "Leg Curl",               muscle: .legs,      equipment: .machine),
        .init(id: "calf-raise",        name: "Calf Raise",             muscle: .legs,      equipment: .machine),

        // Glutes
        .init(id: "hip-thrust",        name: "Hip Thrust",             muscle: .glutes,    equipment: .barbell),
        .init(id: "glute-bridge",      name: "Glute Bridge",           muscle: .glutes,    equipment: .bodyweight),
        .init(id: "cable-kickback",    name: "Cable Kickback",         muscle: .glutes,    equipment: .cable),

        // Core
        .init(id: "plank",             name: "Plank",                  muscle: .core,      equipment: .bodyweight),
        .init(id: "hanging-leg-raise", name: "Hanging Leg Raise",      muscle: .core,      equipment: .bodyweight),
        .init(id: "ab-wheel",          name: "Ab Wheel",               muscle: .core,      equipment: .other),
        .init(id: "cable-crunch",      name: "Cable Crunch",           muscle: .core,      equipment: .cable),
        .init(id: "russian-twist",     name: "Russian Twist",          muscle: .core,      equipment: .dumbbell),

        // Cardio
        .init(id: "treadmill",         name: "Treadmill",              muscle: .cardio,    equipment: .other),
        .init(id: "rowing",            name: "Rowing",                 muscle: .cardio,    equipment: .machine),
        .init(id: "stairmaster",       name: "Stairmaster",            muscle: .cardio,    equipment: .machine),
        .init(id: "cycling",           name: "Cycling",                muscle: .cardio,    equipment: .machine),
    ]

    static func search(_ query: String) -> [ExerciseCatalogItem] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return all }
        return all.filter { $0.name.lowercased().contains(q) }
    }

    static func grouped() -> [(ExerciseCatalogItem.Muscle, [ExerciseCatalogItem])] {
        ExerciseCatalogItem.Muscle.allCases.compactMap { muscle in
            let items = all.filter { $0.muscle == muscle }
            return items.isEmpty ? nil : (muscle, items)
        }
    }
}
