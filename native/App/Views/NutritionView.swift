import SwiftUI
import SwiftData

/// Daily nutrition view. Quick-capture chips launch their respective
/// flows DIRECTLY — barcode opens the camera scanner, photo opens the
/// PhotosPicker, voice opens the press-and-hold recorder. The top-right
/// "+" button is the only path to manual entry.
///
/// After a successful capture (Gemini estimate OR barcode lookup), the
/// review sheet pre-fills with the estimate so the user can adjust
/// before saving. Every flow ends with a MealLog written to SwiftData
/// and a SyncService drain to Neon.
struct NutritionView: View {
    @Query(
        filter: #Predicate<MealLog> { _ in true },
        sort: \MealLog.loggedAt,
        order: .reverse
    ) private var meals: [MealLog]
    @Environment(\.modelContext) private var modelContext

    // Capture sheet selection — only one open at a time. `nil` = none.
    @State private var activeCapture: CaptureFlow?
    // Result waiting to be reviewed. Identifiable so we can use sheet(item:).
    @State private var pendingReview: PendingReview?
    @State private var manualOpen = false
    @State private var editingMeal: MealLog?
    @State private var lookupError: String?

    enum CaptureFlow: Identifiable {
        case barcode, photo, voice
        var id: Int {
            switch self {
            case .barcode: return 1
            case .photo:   return 2
            case .voice:   return 3
            }
        }
    }
    struct PendingReview: Identifiable {
        let id = UUID()
        let source: MealCaptureSource
        let meal: PrefilledMeal
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    macroSummary
                    quickCaptureStrip
                    NutritionInsightsCard(
                        todayMeals: todayMeals,
                        last7Meals: last7Meals,
                        targets: NutritionTargetsIn(
                            calories: 2200,
                            protein: 180,
                            carbs: 240,
                            fat: 75
                        )
                    )
                    if let err = lookupError {
                        lookupErrorCard(err)
                    }
                    SectionLabel("Today's meals")
                    if todayMeals.isEmpty {
                        emptyState
                    } else {
                        ForEach(todayMeals) { meal in
                            mealRow(meal)
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Nutrition")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Haptics.tap()
                        manualOpen = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(LifeOSColor.accent)
                    }
                }
            }
            .sheet(isPresented: $manualOpen) {
                AddMealSheet()
                    .presentationDetents([.large])
            }
            .sheet(item: $editingMeal) { meal in
                AddMealSheet(editing: meal)
                    .presentationDetents([.large])
            }
            .sheet(item: $activeCapture) { flow in
                switch flow {
                case .barcode:
                    BarcodeScannerSheet { code in
                        handleBarcode(code)
                    }
                case .photo:
                    PhotoMealSheet { payload in
                        handleCapturePayload(payload, source: .photo)
                    }
                case .voice:
                    VoiceRecorderSheet { payload in
                        handleCapturePayload(payload, source: .voice)
                    }
                }
            }
            .sheet(item: $pendingReview) { review in
                MealReviewSheet(source: review.source, initial: review.meal)
                    .presentationDetents([.large])
            }
        }
    }

    // MARK: - Capture wiring

    private func handleBarcode(_ code: String) {
        Task {
            if let product = await OpenFoodFactsClient.lookup(barcode: code) {
                pendingReview = PendingReview(
                    source: .barcode,
                    meal: .fromBarcode(product)
                )
                Haptics.success()
            } else {
                lookupError = "Barcode \(code) wasn't found in OpenFoodFacts. Tap + to enter manually."
                Haptics.warning()
                // Auto-clear after 6s.
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                lookupError = nil
            }
        }
    }

    private func handleCapturePayload(_ payload: MealCapturePayload, source: MealCaptureSource) {
        pendingReview = PendingReview(
            source: source,
            meal: .fromCapture(payload)
        )
    }

    // MARK: - Macros + meals

    private var todayMeals: [MealLog] {
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        return meals.filter { $0.date == today }
    }

    /// Meals from the last 7 calendar days (inclusive of today). Used by
    /// the insights card so the AI snapshot can call out trends without
    /// needing its own SwiftData query.
    private var last7Meals: [MealLog] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let earliest = cal.date(byAdding: .day, value: -6, to: today) ?? today
        let fmt = ISO8601DateFormatter.dateOnly
        let earliestStr = fmt.string(from: earliest)
        return meals.filter { $0.date >= earliestStr }
    }

    private var todayKcal: Double    { todayMeals.reduce(0) { $0 + $1.calories } }
    private var todayProtein: Double { todayMeals.reduce(0) { $0 + $1.proteinG } }
    private var todayCarbs: Double   { todayMeals.reduce(0) { $0 + $1.carbsG   } }
    private var todayFat: Double     { todayMeals.reduce(0) { $0 + $1.fatG     } }

    private var macroSummary: some View {
        // TODO: pull goals from a Settings @Model once user-configurable targets exist.
        MacroRingsCard(
            proteinG: todayProtein, proteinGoalG: 180,
            carbsG: todayCarbs, carbsGoalG: 240,
            fatG: todayFat, fatGoalG: 75,
            caloriesEaten: todayKcal,
            caloriesBurned: 467,
            caloriesGoal: 2200
        )
    }

    private var quickCaptureStrip: some View {
        HStack(spacing: 8) {
            quickButton(icon: "barcode.viewfinder", label: "Barcode", tint: LifeOSColor.Metric.carbs) {
                activeCapture = .barcode
            }
            quickButton(icon: "camera.fill", label: "Photo", tint: LifeOSColor.Metric.fat) {
                activeCapture = .photo
            }
            quickButton(icon: "mic.fill", label: "Voice", tint: LifeOSColor.Metric.protein) {
                activeCapture = .voice
            }
        }
    }

    private func quickButton(icon: String, label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(tint)
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .glassCard(cornerRadius: 14)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func lookupErrorCard(_ message: String) -> some View {
        Card(tint: LifeOSColor.warning) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(LifeOSColor.warning)
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.85))
                Spacer()
                Button {
                    lookupError = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var emptyState: some View {
        Card {
            VStack(spacing: 8) {
                Image(systemName: "fork.knife.circle")
                    .font(.system(size: 32))
                    .foregroundStyle(LifeOSColor.fg3)
                Text("No meals logged yet today")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(LifeOSColor.fg2)
                Text("Tap a capture chip above, or + for manual entry.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    private func mealRow(_ meal: MealLog) -> some View {
        Button {
            Haptics.tap()
            editingMeal = meal
        } label: {
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(meal.name).font(.system(size: 15, weight: .semibold))
                            HStack(spacing: 6) {
                                Text(meal.loggedAt.formatted(date: .omitted, time: .shortened))
                                    .font(.system(size: 11))
                                    .foregroundStyle(LifeOSColor.fg3)
                                sourceBadge(meal.source)
                            }
                        }
                        Spacer()
                        Text("\(Int(meal.calories)) kcal")
                            .font(.system(size: 14, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(LifeOSColor.Metric.calories)
                    }
                    HStack(spacing: 6) {
                        macroChip("P", value: meal.proteinG, tint: LifeOSColor.Metric.protein)
                        macroChip("C", value: meal.carbsG, tint: LifeOSColor.Metric.carbs)
                        macroChip("F", value: meal.fatG, tint: LifeOSColor.Metric.fat)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                editingMeal = meal
            } label: {
                Label("Edit meal", systemImage: "pencil")
            }
            Button(role: .destructive) {
                modelContext.delete(meal)
                try? modelContext.save()
                Haptics.warning()
            } label: {
                Label("Delete meal", systemImage: "trash")
            }
        }
    }

    @ViewBuilder
    private func sourceBadge(_ source: String) -> some View {
        if source != "manual" {
            let icon: String = {
                switch source {
                case "barcode": return "barcode.viewfinder"
                case "photo":   return "camera.fill"
                case "voice":   return "mic.fill"
                default:        return "square.and.pencil"
                }
            }()
            Image(systemName: icon)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(LifeOSColor.accent)
        }
    }

    private func macroChip(_ name: String, value: Double, tint: Color) -> some View {
        HStack(spacing: 3) {
            Text(name).font(.system(size: 9, weight: .bold)).foregroundStyle(tint)
            Text("\(Int(value))g")
                .font(.system(size: 10).monospacedDigit())
                .foregroundStyle(.white.opacity(0.85))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Capsule().fill(tint.opacity(0.14)))
    }
}
