import Foundation
import SwiftData

/// One ingredient line inside a Recipe. Macros are absolute (already scaled to
/// `grams`), so a recipe total is a plain sum. Stored as a JSON blob on Recipe
/// rather than a separate table — same lightweight approach as
/// LiftSessionEntry.detailsJSON.
struct RecipeIngredient: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var grams: Double
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
}

/// A saved multi-ingredient recipe. Total macros = sum of ingredients;
/// per-serving = total / servings. Logging a recipe inserts a MealLog scaled to
/// the chosen number of servings. Shaped for sync like other user content.
@Model
final class Recipe {
    @Attribute(.unique) var id: UUID
    var name: String
    /// JSON-encoded [RecipeIngredient]. Decoded lazily via `ingredients`.
    var ingredientsJSON: String
    var servings: Int
    var createdAt: Date
    var needsSync: Bool = true
    var serverID: String?

    init(name: String, servings: Int = 1) {
        self.id = UUID()
        self.name = name
        self.ingredientsJSON = "[]"
        self.servings = max(1, servings)
        self.createdAt = Date()
    }

    var ingredients: [RecipeIngredient] {
        get {
            guard let data = ingredientsJSON.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode([RecipeIngredient].self, from: data)
            else { return [] }
            return decoded
        }
        set {
            ingredientsJSON = (try? JSONEncoder().encode(newValue))
                .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
            needsSync = true
        }
    }

    struct Macros: Hashable {
        var calories: Double = 0
        var proteinG: Double = 0
        var carbsG: Double = 0
        var fatG: Double = 0
    }

    var total: Macros {
        ingredients.reduce(into: Macros()) { acc, i in
            acc.calories += i.calories
            acc.proteinG += i.proteinG
            acc.carbsG += i.carbsG
            acc.fatG += i.fatG
        }
    }

    var perServing: Macros {
        let n = Double(max(1, servings))
        let t = total
        return Macros(calories: t.calories / n, proteinG: t.proteinG / n, carbsG: t.carbsG / n, fatG: t.fatG / n)
    }
}
