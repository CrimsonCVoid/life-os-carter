import Foundation
import SwiftData

/// Pre-built routine the user can launch with one tap instead of
/// freeforming a fresh workout. The template pre-populates the active
/// workout's exercise list with empty sets sized to the targets here —
/// the user adjusts weight/reps as they go like normal.
///
/// `exercisesJSON` is a small JSON blob: `[{name, sets, reps, rest}]`.
/// Keeping it as a string column avoids a separate
/// WorkoutTemplateExercise @Model + relationship, which is a heavier
/// SwiftData migration than this app needs at v1.
@Model
final class WorkoutTemplate {
    @Attribute(.unique) var id: UUID
    var name: String
    var icon: String                  // SF Symbol
    /// "push" | "pull" | "legs" | "upper" | "lower" | "full_body" |
    /// "custom" — drives the section grouping in the template picker.
    var category: String
    var exercisesJSON: String         // [{name,sets,reps,rest}]
    var notes: String                 // optional one-line description
    var createdAt: Date
    var isBuiltIn: Bool

    init(
        name: String,
        icon: String,
        category: String,
        exercises: [TemplateExercise],
        notes: String = "",
        isBuiltIn: Bool = false
    ) {
        self.id = UUID()
        self.name = name
        self.icon = icon
        self.category = category
        self.notes = notes
        self.createdAt = Date()
        self.isBuiltIn = isBuiltIn
        if let data = try? JSONEncoder().encode(exercises),
           let str = String(data: data, encoding: .utf8) {
            self.exercisesJSON = str
        } else {
            self.exercisesJSON = "[]"
        }
    }

    var exercises: [TemplateExercise] {
        guard let data = exercisesJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([TemplateExercise].self, from: data)
        else { return [] }
        return decoded
    }
}

struct TemplateExercise: Codable, Hashable {
    let name: String
    let sets: Int
    let reps: Int
    let restSec: Int

    init(_ name: String, sets: Int = 3, reps: Int = 8, restSec: Int = 90) {
        self.name = name
        self.sets = sets
        self.reps = reps
        self.restSec = restSec
    }
}

/// Built-in template catalog. Seeded into SwiftData on first app launch
/// (see WorkoutTemplate.seedBuiltInsIfNeeded). Keep this short — six
/// well-chosen templates is better than thirty unfocused ones.
enum WorkoutTemplateSeeds {
    static let all: [WorkoutTemplate] = [
        WorkoutTemplate(
            name: "Push Day",
            icon: "figure.strengthtraining.traditional",
            category: "push",
            exercises: [
                TemplateExercise("Bench Press", sets: 4, reps: 6, restSec: 150),
                TemplateExercise("Overhead Press", sets: 3, reps: 8),
                TemplateExercise("Incline Dumbbell Press", sets: 3, reps: 10),
                TemplateExercise("Lateral Raise", sets: 3, reps: 12, restSec: 60),
                TemplateExercise("Tricep Pushdown", sets: 3, reps: 12, restSec: 60),
            ],
            notes: "Chest, shoulders, triceps",
            isBuiltIn: true
        ),
        WorkoutTemplate(
            name: "Pull Day",
            icon: "figure.strengthtraining.functional",
            category: "pull",
            exercises: [
                TemplateExercise("Deadlift", sets: 3, reps: 5, restSec: 180),
                TemplateExercise("Pull-ups", sets: 4, reps: 8),
                TemplateExercise("Barbell Row", sets: 3, reps: 8),
                TemplateExercise("Face Pull", sets: 3, reps: 15, restSec: 60),
                TemplateExercise("Barbell Curl", sets: 3, reps: 10, restSec: 60),
            ],
            notes: "Back, rear delts, biceps",
            isBuiltIn: true
        ),
        WorkoutTemplate(
            name: "Leg Day",
            icon: "figure.run",
            category: "legs",
            exercises: [
                TemplateExercise("Back Squat", sets: 4, reps: 6, restSec: 180),
                TemplateExercise("Romanian Deadlift", sets: 3, reps: 8),
                TemplateExercise("Leg Press", sets: 3, reps: 10),
                TemplateExercise("Leg Curl", sets: 3, reps: 12, restSec: 60),
                TemplateExercise("Calf Raise", sets: 4, reps: 15, restSec: 45),
            ],
            notes: "Quads, hamstrings, glutes, calves",
            isBuiltIn: true
        ),
        WorkoutTemplate(
            name: "Upper Body",
            icon: "figure.arms.open",
            category: "upper",
            exercises: [
                TemplateExercise("Bench Press", sets: 4, reps: 6, restSec: 150),
                TemplateExercise("Barbell Row", sets: 4, reps: 6, restSec: 120),
                TemplateExercise("Overhead Press", sets: 3, reps: 8),
                TemplateExercise("Pull-ups", sets: 3, reps: 8),
                TemplateExercise("Barbell Curl", sets: 3, reps: 10, restSec: 60),
                TemplateExercise("Tricep Pushdown", sets: 3, reps: 10, restSec: 60),
            ],
            notes: "Full upper body",
            isBuiltIn: true
        ),
        WorkoutTemplate(
            name: "Lower Body",
            icon: "figure.cooldown",
            category: "lower",
            exercises: [
                TemplateExercise("Back Squat", sets: 4, reps: 6, restSec: 180),
                TemplateExercise("Romanian Deadlift", sets: 3, reps: 8),
                TemplateExercise("Lunges", sets: 3, reps: 10),
                TemplateExercise("Leg Extension", sets: 3, reps: 12, restSec: 60),
                TemplateExercise("Calf Raise", sets: 4, reps: 15, restSec: 45),
            ],
            notes: "Full lower body",
            isBuiltIn: true
        ),
        WorkoutTemplate(
            name: "Full Body",
            icon: "figure.mixed.cardio",
            category: "full_body",
            exercises: [
                TemplateExercise("Back Squat", sets: 3, reps: 6, restSec: 180),
                TemplateExercise("Bench Press", sets: 3, reps: 6, restSec: 150),
                TemplateExercise("Barbell Row", sets: 3, reps: 6),
                TemplateExercise("Overhead Press", sets: 2, reps: 10),
                TemplateExercise("Romanian Deadlift", sets: 2, reps: 10),
            ],
            notes: "One push, one pull, one squat, one hinge",
            isBuiltIn: true
        ),
    ]

    /// Inserts the built-ins if the SwiftData store has zero
    /// WorkoutTemplate rows. Idempotent — safe to call on every app
    /// launch. Skips when the user already has templates (built-in or
    /// custom), so re-installs won't duplicate.
    static func seedIfNeeded(in ctx: ModelContext) {
        let descriptor = FetchDescriptor<WorkoutTemplate>()
        let existing = (try? ctx.fetch(descriptor)) ?? []
        guard existing.isEmpty else { return }
        for tpl in all { ctx.insert(tpl) }
        try? ctx.save()
    }
}
