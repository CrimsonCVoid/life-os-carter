import SwiftUI
import SwiftData

/// Lands here after a barcode lookup, photo scan, or voice clip. The
/// values are pre-filled from the capture path but every field stays
/// editable — AI is an estimate, the user is the source of truth.
/// On save, writes a `MealLog` and kicks the SyncService.
struct MealReviewSheet: View {
    let source: MealCaptureSource
    let initial: PrefilledMeal

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    // Used by the servings-centric (barcode) flow only. Defaults to
    // 1.0 and steps by 0.5 since fractional servings are common
    // ("had half a sleeve of Pringles").
    @State private var servings: Double

    init(source: MealCaptureSource, initial: PrefilledMeal) {
        self.source = source
        self.initial = initial
        _name     = State(initialValue: initial.name)
        _calories = State(initialValue: initial.calories  > 0 ? String(Int(initial.calories.rounded())) : "")
        _protein  = State(initialValue: initial.proteinG  > 0 ? String(Int(initial.proteinG.rounded())) : "")
        _carbs    = State(initialValue: initial.carbsG    > 0 ? String(Int(initial.carbsG.rounded()))   : "")
        _fat      = State(initialValue: initial.fatG      > 0 ? String(Int(initial.fatG.rounded()))     : "")
        _servings = State(initialValue: initial.defaultServings)
    }

    // Per-serving macros — for barcode this is the OpenFoodFacts panel.
    // For other sources, equals the total estimate (so multiplying by
    // servings=1 keeps the displayed values identical to the estimate).
    private var perServing: (kcal: Double, p: Double, c: Double, f: Double) {
        (initial.calories, initial.proteinG, initial.carbsG, initial.fatG)
    }

    // What ends up saved. Barcode-sourced: per-serving × servings.
    // Other sources: whatever the user typed in the editable fields.
    private var computedKcal: Double    { perServing.kcal * servings }
    private var computedProtein: Double { perServing.p    * servings }
    private var computedCarbs: Double   { perServing.c    * servings }
    private var computedFat: Double     { perServing.f    * servings }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: source.icon)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(source.tint)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(source.tint.opacity(0.16)))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(source.title)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                            Text(initial.subtitle ?? "Tweak before saving")
                                .font(.system(size: 11))
                                .foregroundStyle(LifeOSColor.fg3)
                                .lineLimit(2)
                        }
                        Spacer()
                        confidenceBadge
                    }
                }
                .listRowBackground(LifeOSColor.card)

                if initial.isServingsCentric {
                    servingsSection
                        .listRowBackground(LifeOSColor.card)
                    computedMacrosSection
                        .listRowBackground(LifeOSColor.card)
                } else {
                    editableMealSection
                        .listRowBackground(LifeOSColor.card)
                }

                if !initial.itemBreakdown.isEmpty {
                    Section("Breakdown (AI estimate)") {
                        ForEach(initial.itemBreakdown, id: \.name) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(item.name)
                                        .font(.system(size: 13, weight: .medium))
                                    if item.grams > 0 {
                                        Text("≈ \(Int(item.grams))g")
                                            .font(.system(size: 10))
                                            .foregroundStyle(LifeOSColor.fg3)
                                    }
                                }
                                Spacer()
                                Text("\(Int(item.calories)) kcal")
                                    .font(.system(size: 12).monospacedDigit())
                                    .foregroundStyle(LifeOSColor.Metric.calories)
                            }
                        }
                    }
                    .listRowBackground(LifeOSColor.card)
                }

                if let notes = initial.notes, !notes.isEmpty {
                    Section("Notes") {
                        Text(notes)
                            .font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                    .listRowBackground(LifeOSColor.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Review meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .foregroundStyle(canSave ? LifeOSColor.accent : LifeOSColor.fg3)
                        .disabled(!canSave)
                }
            }
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        (Double(calories) ?? 0) > 0
    }

    @ViewBuilder
    private var confidenceBadge: some View {
        if let conf = initial.confidence {
            let tint: Color = conf == "high"
                ? LifeOSColor.success
                : conf == "medium"
                    ? LifeOSColor.warning
                    : LifeOSColor.danger
            Text(conf.uppercased())
                .font(.system(size: 9, weight: .heavy)).tracking(0.8)
                .foregroundStyle(tint)
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(Capsule().fill(tint.opacity(0.16)))
                .overlay(Capsule().stroke(tint.opacity(0.4), lineWidth: 0.5))
        }
    }

    private func save() {
        guard canSave else { return }
        let date = ISO8601DateFormatter.dateOnly.string(from: Date())
        let meal = MealLog(
            date: date,
            name: name.trimmingCharacters(in: .whitespaces),
            calories: Double(calories) ?? 0,
            proteinG: Double(protein) ?? 0,
            carbsG: Double(carbs) ?? 0,
            fatG: Double(fat) ?? 0,
            source: source.persistedSource
        )
        modelContext.insert(meal)
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
        Haptics.success()
        dismiss()
    }
}

// MARK: - Source + prefill DTOs

enum MealCaptureSource {
    case manual
    case barcode
    case photo
    case voice

    var title: String {
        switch self {
        case .manual:  return "Manual entry"
        case .barcode: return "Scanned barcode"
        case .photo:   return "Photo · Gemini estimate"
        case .voice:   return "Voice · Gemini estimate"
        }
    }
    var icon: String {
        switch self {
        case .manual:  return "square.and.pencil"
        case .barcode: return "barcode.viewfinder"
        case .photo:   return "camera.fill"
        case .voice:   return "mic.fill"
        }
    }
    var tint: Color {
        switch self {
        case .manual:  return LifeOSColor.accent
        case .barcode: return LifeOSColor.Metric.carbs
        case .photo:   return LifeOSColor.Metric.fat
        case .voice:   return LifeOSColor.Metric.protein
        }
    }
    var persistedSource: String {
        switch self {
        case .manual:  return "manual"
        case .barcode: return "barcode"
        case .photo:   return "photo"
        case .voice:   return "voice"
        }
    }
}

/// What the review sheet renders. Two capture paths (Gemini + barcode)
/// converge on this. Manual entry skips this struct and goes straight
/// to AddMealSheet.
struct PrefilledMeal {
    let name: String
    let calories: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    var confidence: String?
    var subtitle: String?
    var notes: String?
    var itemBreakdown: [Item] = []

    struct Item {
        let name: String
        let grams: Double
        let calories: Double
    }

    static func fromCapture(_ payload: MealCapturePayload) -> PrefilledMeal {
        PrefilledMeal(
            name: payload.suggestedMealName,
            calories: payload.totals.calories,
            proteinG: payload.totals.proteinG,
            carbsG: payload.totals.carbsG,
            fatG: payload.totals.fatG,
            confidence: payload.overallConfidence,
            subtitle: payload.isFood ? nil : "Gemini didn't detect food — please review",
            notes: payload.notes.isEmpty ? nil : payload.notes,
            itemBreakdown: payload.identifiedItems.map { i in
                Item(name: i.name, grams: i.estimatedGrams, calories: i.calories)
            }
        )
    }

    static func fromBarcode(_ product: BarcodeProduct) -> PrefilledMeal {
        var subtitleParts: [String] = []
        if let brand = product.brand, !brand.isEmpty { subtitleParts.append(brand) }
        if let serving = product.servingSize, !serving.isEmpty { subtitleParts.append("per \(serving)") }
        return PrefilledMeal(
            name: product.name,
            calories: product.calories,
            proteinG: product.proteinG,
            carbsG: product.carbsG,
            fatG: product.fatG,
            confidence: nil,
            subtitle: subtitleParts.isEmpty ? "From OpenFoodFacts" : subtitleParts.joined(separator: " · "),
            notes: nil
        )
    }
}
