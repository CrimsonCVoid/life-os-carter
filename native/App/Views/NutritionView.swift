import SwiftUI
import SwiftData

struct NutritionView: View {
    @Query private var meals: [MealLog]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    macroRings
                    SectionLabel("Today's meals")
                    if meals.isEmpty {
                        emptyState
                    } else {
                        ForEach(meals) { meal in
                            mealRow(meal)
                        }
                    }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Nutrition")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Haptics.tap()
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(LifeOSColor.accent)
                    }
                }
            }
        }
    }

    private var macroRings: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("1,840")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                    + Text(" / 2,200")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(LifeOSColor.fg3)
                    Spacer()
                    Text("kcal")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(LifeOSColor.Metric.calories)
                }
                HStack(spacing: 12) {
                    macroPill("Protein", "142", "/ 180g", LifeOSColor.Metric.protein)
                    macroPill("Carbs", "188", "/ 240g", LifeOSColor.Metric.carbs)
                    macroPill("Fat", "62", "/ 75g", LifeOSColor.Metric.fat)
                }
            }
        }
    }

    private func macroPill(_ name: String, _ have: String, _ goal: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(1)
                .foregroundStyle(LifeOSColor.fg3)
            Text(have)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(goal)
                .font(.system(size: 10))
                .foregroundStyle(LifeOSColor.fg3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(tint.opacity(0.08))
        )
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
                Text("Tap + to add one.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    private func mealRow(_ meal: MealLog) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(meal.name).font(.system(size: 15, weight: .semibold))
                    Text(meal.loggedAt.formatted(date: .omitted, time: .shortened))
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Text("\(Int(meal.calories)) kcal")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(LifeOSColor.Metric.calories)
            }
        }
    }
}
