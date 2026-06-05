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
    @Query private var userSettingsRows: [UserSettings]
    @Query private var dailyRows: [DailyEntry]
    @Environment(\.modelContext) private var modelContext

    // Capture sheet selection — only one open at a time. `nil` = none.
    @State private var activeCapture: CaptureFlow?
    // Result waiting to be reviewed. Identifiable so we can use sheet(item:).
    @State private var pendingReview: PendingReview?
    @State private var manualOpen = false
    @State private var quickAddOpen = false
    @State private var savingFavorite: MealLog?
    @State private var editingMeal: MealLog?
    @State private var lookupError: String?

    private var userSettings: UserSettings {
        userSettingsRows.first ?? UserSettings.loadOrCreate(in: modelContext)
    }

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
                    if loggingStreak >= 2 {
                        streakChip
                    }
                    quickCaptureStrip
                    SavedMealsBar()
                    NutritionInsightsCard(
                        todayMeals: todayMeals,
                        last7Meals: last7Meals,
                        targets: NutritionTargetsIn(
                            calories: userSettings.caloriesGoal,
                            protein: userSettings.proteinGoal,
                            carbs: userSettings.carbsGoal,
                            fat: userSettings.fatGoal
                        )
                    )
                    NutritionIntelligenceCard()
                    if let err = lookupError {
                        lookupErrorCard(err)
                    }
                    SectionLabel("Today's meals")
                    if todayMeals.isEmpty {
                        emptyState
                    } else {
                        ForEach(MealType.allCases) { type in
                            mealSection(type)
                        }
                        dayTotalFooter
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            }
            .navigationTitle("Nutrition")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        WeeklyNutritionSummary()
                    } label: {
                        Image(systemName: "chart.bar.xaxis")
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            Haptics.tap()
                            manualOpen = true
                        } label: {
                            Label("Full entry", systemImage: "square.and.pencil")
                        }
                        Button {
                            Haptics.tap()
                            quickAddOpen = true
                        } label: {
                            Label("Quick add calories", systemImage: "bolt.fill")
                        }
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
            .sheet(isPresented: $quickAddOpen) {
                QuickAddCaloriesSheet()
                    .presentationDetents([.medium, .large])
            }
            .sheet(item: $savingFavorite) { meal in
                SaveAsFavoriteSheet(meal: meal)
                    .presentationDetents([.medium])
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

    /// Consecutive days walking back from today with at least one meal
    /// logged. Stops the moment a gap day appears.
    private var loggingStreak: Int {
        let cal = Calendar.current
        let dateSet = Set(meals.map(\.date))
        var count = 0
        var cursor = cal.startOfDay(for: Date())
        let fmt = ISO8601DateFormatter.dateOnly
        var safety = 0
        while safety < 365 {
            safety += 1
            if dateSet.contains(fmt.string(from: cursor)) {
                count += 1
            } else {
                break
            }
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return count
    }

    private var streakChip: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle().fill(LifeOSColor.warning.opacity(0.16))
                Image(systemName: "flame.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(LifeOSColor.warning)
            }
            .frame(width: 26, height: 26)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(loggingStreak)-day logging streak")
                    .font(.system(size: 12, weight: .semibold))
                Text("Don't break the chain.")
                    .font(.system(size: 10))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(LifeOSColor.warning.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(LifeOSColor.warning.opacity(0.25), lineWidth: 0.5)
                )
        )
    }

    private var todayKcal: Double    { todayMeals.reduce(0) { $0 + $1.calories } }
    private var todayProtein: Double { todayMeals.reduce(0) { $0 + $1.proteinG } }
    private var todayCarbs: Double   { todayMeals.reduce(0) { $0 + $1.carbsG   } }
    private var todayFat: Double     { todayMeals.reduce(0) { $0 + $1.fatG     } }

    /// Active (exercise) energy today — the only burn eligible for eat-back.
    private var todayActiveBurnedKcal: Double? {
        let key = ISO8601DateFormatter.dateOnly.string(from: Date())
        return dailyRows.first { $0.date == key }?.activeEnergyKcal
    }
    /// Total expenditure (active + BMR) today — shown as context only.
    private var todayTotalBurnedKcal: Double? {
        let key = ISO8601DateFormatter.dateOnly.string(from: Date())
        return dailyRows.first { $0.date == key }?.totalCaloriesKcal
    }

    private var macroSummary: some View {
        MacroRingsCard(
            proteinG: todayProtein, proteinGoalG: Double(userSettings.proteinGoal),
            carbsG: todayCarbs, carbsGoalG: Double(userSettings.carbsGoal),
            fatG: todayFat, fatGoalG: Double(userSettings.fatGoal),
            caloriesEaten: todayKcal,
            caloriesGoal: Double(userSettings.caloriesGoal),
            activeBurnedKcal: todayActiveBurnedKcal,
            totalBurnedKcal: todayTotalBurnedKcal,
            eatBackExercise: userSettings.eatBackExerciseCalories
        )
    }

    /// Slim daily total under the meal list so the day's sum is visible
    /// without scrolling back up to the rings.
    private var dayTotalFooter: some View {
        HStack {
            Text("DAY TOTAL")
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            Text("\(Int(todayKcal)) kcal · \(Int(todayProtein))P / \(Int(todayCarbs))C / \(Int(todayFat))F")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg2)
        }
        .padding(.horizontal, 8).padding(.top, 4)
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
            quickButton(icon: "bolt.fill", label: "Quick add", tint: LifeOSColor.Metric.calories) {
                quickAddOpen = true
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
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
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
            Button {
                savingFavorite = meal
                Haptics.tap()
            } label: {
                Label("Save as favorite", systemImage: "star")
            }
            Menu {
                ForEach(MealType.allCases) { type in
                    Button {
                        meal.mealType = type.rawValue
                        meal.needsSync = true
                        try? modelContext.save()
                        Haptics.tick()
                    } label: {
                        Label(type.label, systemImage: type.icon)
                    }
                }
            } label: {
                Label("Move to…", systemImage: "tray.full")
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
    private func mealSection(_ type: MealType) -> some View {
        let bucket = todayMeals.filter { resolvedType($0) == type }
        if !bucket.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                bucketHeader(type, meals: bucket)
                ForEach(bucket) { meal in
                    mealRow(meal)
                }
            }
            .padding(.top, 6)
        }
    }

    /// Resolved meal type honoring the explicit override when set,
    /// otherwise re-deriving from loggedAt so older rows (pre-mealType
    /// schema migration) still bucket sensibly.
    private func resolvedType(_ meal: MealLog) -> MealType {
        if !meal.mealType.isEmpty, let parsed = MealType(rawValue: meal.mealType) {
            return parsed
        }
        return MealType(rawValue: MealLog.deriveMealType(at: meal.loggedAt)) ?? .snack
    }

    private func bucketHeader(_ type: MealType, meals: [MealLog]) -> some View {
        let kcal = Int(meals.reduce(0) { $0 + $1.calories })
        let p = Int(meals.reduce(0) { $0 + $1.proteinG })
        return HStack(spacing: 6) {
            Image(systemName: type.icon)
                .font(.system(size: 9, weight: .heavy))
                .foregroundStyle(LifeOSColor.fg3)
            Text(type.label.uppercased())
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            Text("\(kcal) kcal · \(p)g protein")
                .font(.system(size: 10, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg3)
        }
        .padding(.horizontal, 4)
    }
}

enum MealType: String, CaseIterable, Identifiable {
    case breakfast, lunch, dinner, snack
    var id: String { rawValue }
    var label: String {
        switch self {
        case .breakfast: return "Breakfast"
        case .lunch:     return "Lunch"
        case .dinner:    return "Dinner"
        case .snack:     return "Snack"
        }
    }
    var icon: String {
        switch self {
        case .breakfast: return "sunrise.fill"
        case .lunch:     return "sun.max.fill"
        case .dinner:    return "moon.fill"
        case .snack:     return "leaf.fill"
        }
    }
}

extension NutritionView {
    @ViewBuilder
    fileprivate func sourceBadge(_ source: String) -> some View {
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

    fileprivate func macroChip(_ name: String, value: Double, tint: Color) -> some View {
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
