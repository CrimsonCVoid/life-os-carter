import Foundation

/// Decoded row from the /api/food-search USDA proxy. Macros are per-100g (the
/// consistent FDC basis); the UI scales by the logged portion.
struct FoodSearchItem: Identifiable, Decodable, Hashable {
    let fdcId: Int
    let name: String
    let brand: String?
    let dataType: String
    let per100g: Macros
    let serving: Serving

    var id: Int { fdcId }

    struct Macros: Decodable, Hashable {
        let calories: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
    }
    struct Serving: Decodable, Hashable {
        let size: Double?
        let unit: String?
        let household: String?
    }

    /// Macros scaled to `grams` of this food.
    func scaled(toGrams grams: Double) -> Macros {
        let k = grams / 100
        return Macros(
            calories: per100g.calories * k,
            proteinG: per100g.proteinG * k,
            carbsG: per100g.carbsG * k,
            fatG: per100g.fatG * k)
    }
}

/// Client for the server-side USDA food-search proxy. POSTs the query (the
/// shared APIClient mangles query strings via appendingPathComponent, so we use
/// the JSON-body POST the route also accepts) and returns normalized items.
enum FoodSearchClient {
    private struct Request: Encodable { let query: String; let pageSize: Int }
    private struct Response: Decodable { let query: String; let items: [FoodSearchItem] }

    @MainActor
    static func search(_ query: String, pageSize: Int = 25) async throws -> [FoodSearchItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let res = try await APIClient.shared.post(
            "/api/food-search",
            body: Request(query: trimmed, pageSize: pageSize),
            as: Response.self)
        return res.items
    }
}
