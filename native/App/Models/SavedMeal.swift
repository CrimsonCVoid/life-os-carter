import Foundation
import SwiftData

/// User-saved meal — the MyFitnessPal-style favorite. Lets the user
/// log "Breakfast smoothie" with one tap instead of re-typing macros
/// every day. Tracks usage count + lastUsedAt so we can surface the
/// most-used saved meals first.
@Model
final class SavedMeal {
    @Attribute(.unique) var id: UUID
    var name: String
    var icon: String                  // SF Symbol — falls back to "fork.knife"
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    var usageCount: Int = 0
    var lastUsedAt: Date?
    var createdAt: Date

    init(
        name: String,
        icon: String = "fork.knife",
        calories: Double,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0
    ) {
        self.id = UUID()
        self.name = name
        self.icon = icon
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.createdAt = Date()
    }
}
