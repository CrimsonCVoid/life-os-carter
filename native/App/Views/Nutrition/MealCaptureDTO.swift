import Foundation

/// Shape returned by both `/api/food-photo` and `/api/voice-meal`.
/// One DTO so the pre-fill / review sheet doesn't care which capture
/// path produced the estimate. Matches the backend exactly.
struct MealCapturePayload: Decodable {
    let isFood: Bool
    let suggestedMealName: String
    let overallConfidence: String       // "high" | "medium" | "low"
    let identifiedItems: [Item]
    let totals: Totals
    let notes: String

    struct Item: Decodable, Identifiable {
        var id: String { name }
        let name: String
        let estimatedGrams: Double
        let calories: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }

    struct Totals: Decodable {
        let calories: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }
}

/// Shape an OpenFoodFacts lookup resolves into — same per-meal fields
/// the AI capture path resolves to so the review sheet handles both.
struct BarcodeProduct {
    let name: String
    let brand: String?
    let servingSize: String?
    let calories: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
}
