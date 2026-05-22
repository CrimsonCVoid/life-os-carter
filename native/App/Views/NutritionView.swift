import SwiftUI
import SwiftData

struct NutritionView: View {
    @Query(
        filter: #Predicate<MealLog> { _ in true },
        sort: \MealLog.loggedAt,
        order: .reverse
    ) private var meals: [MealLog]
    @Environment(\.modelContext) private var modelContext
    @State private var addOpen = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    macroSummary
                    quickCaptureStrip
                    SectionLabel("Today's meals") {
                        Button {
                            Haptics.tap()
                            addOpen = true
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(LifeOSColor.accent)
                        }
                    }
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
                        addOpen = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(LifeOSColor.accent)
                    }
                }
            }
            .sheet(isPresented: $addOpen) {
                AddMealSheet()
                    .presentationDetents([.large])
            }
        }
    }

    private var todayMeals: [MealLog] {
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        return meals.filter { $0.date == today }
    }

    private var todayKcal: Double {
        todayMeals.reduce(0) { $0 + $1.calories }
    }
    private var todayProtein: Double {
        todayMeals.reduce(0) { $0 + $1.proteinG }
    }
    private var todayCarbs: Double {
        todayMeals.reduce(0) { $0 + $1.carbsG }
    }
    private var todayFat: Double {
        todayMeals.reduce(0) { $0 + $1.fatG }
    }

    private var macroSummary: some View {
        // TODO: pull these goals from a Settings @Model entity once we
        // wire user-configurable targets.
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
            quickButton(icon: "barcode.viewfinder", label: "Barcode", tint: LifeOSColor.Metric.carbs)
            quickButton(icon: "camera.fill", label: "Photo", tint: LifeOSColor.Metric.fat)
            quickButton(icon: "mic.fill", label: "Voice", tint: LifeOSColor.Metric.protein)
        }
    }

    private func quickButton(icon: String, label: String, tint: Color) -> some View {
        Button {
            Haptics.tap()
            addOpen = true
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
        }
        .buttonStyle(.plain)
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
                Text("Tap + or use a quick capture above.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    private func mealRow(_ meal: MealLog) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.name).font(.system(size: 15, weight: .semibold))
                        Text(meal.loggedAt.formatted(date: .omitted, time: .shortened))
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
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
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                modelContext.delete(meal)
                try? modelContext.save()
                Haptics.warning()
            } label: {
                Label("Delete", systemImage: "trash")
            }
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
