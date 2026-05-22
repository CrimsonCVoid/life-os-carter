import Foundation

/// Public OpenFoodFacts REST API — no auth, no key, free. We hit the
/// v2 product endpoint with a barcode and pull macros from the 100g
/// nutrient panel. If the product is missing macros or the lookup
/// fails, the caller falls back to manual entry.
///
/// Endpoint: https://world.openfoodfacts.org/api/v2/product/<barcode>.json
enum OpenFoodFactsClient {
    /// Returns nil for any lookup that doesn't yield a complete product.
    /// Doesn't throw — barcode scans are best-effort, the user can
    /// always fall back to manual entry.
    static func lookup(barcode: String) async -> BarcodeProduct? {
        let trimmed = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(trimmed).json") else {
            return nil
        }
        var req = URLRequest(url: url)
        req.timeoutInterval = 10
        req.setValue("LifeOS-iOS/1.0 (carter@carolinacomfort.info)", forHTTPHeaderField: "User-Agent")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            let decoded = try JSONDecoder().decode(OFFResponse.self, from: data)
            guard decoded.status == 1, let p = decoded.product else { return nil }
            return p.toMealEstimate(barcode: trimmed)
        } catch {
            return nil
        }
    }
}

// MARK: - Wire types

private struct OFFResponse: Decodable {
    let status: Int
    let product: Product?

    struct Product: Decodable {
        let productName: String?
        let brands: String?
        let servingSize: String?
        let servingQuantity: Double?
        let nutriments: Nutriments?

        enum CodingKeys: String, CodingKey {
            case productName    = "product_name"
            case brands
            case servingSize    = "serving_size"
            case servingQuantity = "serving_quantity"
            case nutriments
        }

        struct Nutriments: Decodable {
            let energyKcalServing:  Double?
            let energyKcal100g:     Double?
            let proteinsServing:    Double?
            let proteins100g:       Double?
            let carbsServing:       Double?
            let carbs100g:          Double?
            let fatServing:         Double?
            let fat100g:            Double?

            enum CodingKeys: String, CodingKey {
                case energyKcalServing  = "energy-kcal_serving"
                case energyKcal100g     = "energy-kcal_100g"
                case proteinsServing    = "proteins_serving"
                case proteins100g       = "proteins_100g"
                case carbsServing       = "carbohydrates_serving"
                case carbs100g          = "carbohydrates_100g"
                case fatServing         = "fat_serving"
                case fat100g            = "fat_100g"
            }
        }

        /// Prefer per-serving macros when present (more useful for the
        /// user). Fall back to per-100g — almost always populated.
        func toMealEstimate(barcode: String) -> BarcodeProduct? {
            let name = (productName?.isEmpty == false ? productName : nil) ?? "Product \(barcode)"
            guard let n = nutriments else { return nil }
            let kcal    = n.energyKcalServing ?? n.energyKcal100g ?? 0
            let protein = n.proteinsServing   ?? n.proteins100g   ?? 0
            let carbs   = n.carbsServing      ?? n.carbs100g      ?? 0
            let fat     = n.fatServing        ?? n.fat100g        ?? 0
            guard kcal > 0 else { return nil }
            return BarcodeProduct(
                name: name,
                brand: brands?.split(separator: ",").first.map { String($0).trimmingCharacters(in: .whitespaces) },
                servingSize: servingSize,
                calories: kcal,
                proteinG: protein,
                carbsG: carbs,
                fatG: fat
            )
        }
    }
}
