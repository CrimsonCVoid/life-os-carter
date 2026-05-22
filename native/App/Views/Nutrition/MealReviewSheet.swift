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
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return false }
        if initial.isServingsCentric {
            return servings > 0 && computedKcal > 0
        }
        return (Double(calories) ?? 0) > 0
    }

    // MARK: - Servings flow (barcode)

    /// The central question for a scanned barcode: how many servings?
    /// Big +/- stepper, fractional half-step (0.5 → 1 → 1.5 → 2 …),
    /// label underneath shows the per-serving unit from OpenFoodFacts.
    private var servingsSection: some View {
        Section("How many servings?") {
            VStack(alignment: .center, spacing: 12) {
                Text(initial.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .center)
                HStack(spacing: 18) {
                    Button {
                        servings = max(0.5, servings - 0.5)
                        Haptics.tick()
                    } label: {
                        Image(systemName: "minus")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(LifeOSColor.elevated))
                    }
                    .buttonStyle(.plain)
                    .disabled(servings <= 0.5)

                    Text(servingsLabel)
                        .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(LifeOSColor.accent)
                        .frame(minWidth: 80)

                    Button {
                        servings += 0.5
                        Haptics.tick()
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(LifeOSColor.accent))
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)

                if let unit = initial.servingUnit, !unit.isEmpty {
                    Text("1 serving = \(unit)")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.vertical, 6)
        }
    }

    /// Read-only macro readout that updates live as servings change.
    /// Macros aren't text-editable here — the per-serving panel is the
    /// source of truth. The user wants to adjust amount eaten, not
    /// fight the macros.
    private var computedMacrosSection: some View {
        Section("Macros (this meal)") {
            macroReadoutRow(label: "Calories", value: computedKcal, unit: "kcal", tint: LifeOSColor.Metric.calories)
            macroReadoutRow(label: "Protein", value: computedProtein, unit: "g", tint: LifeOSColor.Metric.protein)
            macroReadoutRow(label: "Carbs",   value: computedCarbs,   unit: "g", tint: LifeOSColor.Metric.carbs)
            macroReadoutRow(label: "Fat",     value: computedFat,     unit: "g", tint: LifeOSColor.Metric.fat)
        }
    }

    private func macroReadoutRow(label: String, value: Double, unit: String, tint: Color) -> some View {
        HStack {
            Text(label).foregroundStyle(LifeOSColor.fg2)
            Spacer()
            Text("\(Int(value.rounded())) \(unit)")
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(tint)
        }
    }

    // MARK: - Editable flow (photo, voice, manual)

    /// Editable text fields used for photo / voice / any other source
    /// where the macros came from an AI estimate and the user is the
    /// final arbiter of what to log.
    private var editableMealSection: some View {
        Section("Meal") {
            TextField("Meal name", text: $name)
            HStack {
                Text("Calories").foregroundStyle(LifeOSColor.fg2)
                Spacer()
                TextField("0", text: $calories)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
            }
            HStack {
                Text("Protein (g)").foregroundStyle(LifeOSColor.fg2)
                Spacer()
                TextField("0", text: $protein)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
            }
            HStack {
                Text("Carbs (g)").foregroundStyle(LifeOSColor.fg2)
                Spacer()
                TextField("0", text: $carbs)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
            }
            HStack {
                Text("Fat (g)").foregroundStyle(LifeOSColor.fg2)
                Spacer()
                TextField("0", text: $fat)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
            }
        }
    }

    private var servingsLabel: String {
        servings.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", servings)
            : String(format: "%.1f", servings)
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
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let finalName: String
        let kcal: Double
        let p: Double
        let c: Double
        let f: Double
        if initial.isServingsCentric {
            // Append "× 2", "× 1.5" etc. when the user ate more or less
            // than one serving so the meal row is self-explanatory in
            // the log without re-opening it.
            finalName = servings == 1
                ? trimmed
                : "\(trimmed) × \(servingsLabel)"
            kcal = computedKcal
            p    = computedProtein
            c    = computedCarbs
            f    = computedFat
        } else {
            finalName = trimmed
            kcal = Double(calories) ?? 0
            p    = Double(protein)  ?? 0
            c    = Double(carbs)    ?? 0
            f    = Double(fat)      ?? 0
        }
        let meal = MealLog(
            date: date,
            name: finalName,
            calories: kcal,
            proteinG: p,
            carbsG: c,
            fatG: f,
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
        case .photo:   return "Photo · AI estimate"
        case .voice:   return "Voice · AI estimate"
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
    /// For barcode-sourced meals: per-serving macros (multiplied by
    /// `defaultServings` to get what the user actually ate). For other
    /// sources: the full estimate — `defaultServings` stays 1 so the
    /// math collapses to the original values.
    let calories: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    /// Initial servings value. 1 for everything except barcode flows
    /// where we still ask the user to confirm the count.
    var defaultServings: Double = 1
    /// True for barcode flows. The review sheet renders a big servings
    /// stepper + read-only macro readouts instead of editable text
    /// fields, so the central question is "how many servings did you
    /// eat?" not "what are the macros?". The per-serving panel from
    /// OpenFoodFacts is authoritative for the macros.
    var isServingsCentric: Bool = false
    /// Servings dropdown unit label, e.g. "30g", "1 cup".
    /// Surfaced under the stepper so the user knows what one serving is.
    var servingUnit: String?
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
            isServingsCentric: false,
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
            defaultServings: 1,
            isServingsCentric: true,
            servingUnit: product.servingSize,
            confidence: nil,
            subtitle: subtitleParts.isEmpty ? "Pulled from the label" : subtitleParts.joined(separator: " · "),
            notes: nil
        )
    }
}
