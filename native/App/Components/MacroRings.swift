import SwiftUI

/// MyFitnessPal-style triple macro display — three concentric rings,
/// one per macro, ordered Protein (outer) → Carbs (middle) → Fat (inner).
/// Inside the ring stack: current/goal kcal with the deficit/surplus.
struct MacroRingsCard: View {
    let proteinG: Double
    let proteinGoalG: Double
    let carbsG: Double
    let carbsGoalG: Double
    let fatG: Double
    let fatGoalG: Double
    let caloriesEaten: Double
    let caloriesBurned: Double
    let caloriesGoal: Double

    private var remaining: Double {
        caloriesGoal - caloriesEaten + caloriesBurned
    }

    var body: some View {
        Card {
            HStack(spacing: 18) {
                ZStack {
                    ProgressRing(
                        progress: proteinG / max(1, proteinGoalG),
                        tint: LifeOSColor.Metric.protein,
                        lineWidth: 10
                    )
                    ProgressRing(
                        progress: carbsG / max(1, carbsGoalG),
                        tint: LifeOSColor.Metric.carbs,
                        lineWidth: 10
                    )
                    .padding(14)
                    ProgressRing(
                        progress: fatG / max(1, fatGoalG),
                        tint: LifeOSColor.Metric.fat,
                        lineWidth: 10
                    )
                    .padding(28)

                    VStack(spacing: 0) {
                        Text("\(Int(remaining))")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                        Text("LEFT")
                            .font(.system(size: 8, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .frame(width: 130, height: 130)

                VStack(alignment: .leading, spacing: 10) {
                    calorieRow(
                        label: "Eaten",
                        value: Int(caloriesEaten),
                        tint: LifeOSColor.Metric.calories
                    )
                    calorieRow(
                        label: "Burned",
                        value: Int(caloriesBurned),
                        tint: LifeOSColor.Metric.steps
                    )
                    calorieRow(
                        label: "Goal",
                        value: Int(caloriesGoal),
                        tint: LifeOSColor.fg2
                    )
                    Divider().overlay(LifeOSColor.stroke).padding(.vertical, 2)
                    macroRow("Protein", proteinG, proteinGoalG, "g", LifeOSColor.Metric.protein)
                    macroRow("Carbs",   carbsG,   carbsGoalG,   "g", LifeOSColor.Metric.carbs)
                    macroRow("Fat",     fatG,     fatGoalG,     "g", LifeOSColor.Metric.fat)
                }
            }
        }
    }

    private func calorieRow(label: String, value: Int, tint: Color) -> some View {
        HStack {
            Circle().fill(tint).frame(width: 6, height: 6)
            Text(label).font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
            Spacer()
            Text("\(value)")
                .font(.system(size: 14, weight: .semibold).monospacedDigit())
                .foregroundStyle(tint)
        }
    }

    private func macroRow(_ name: String, _ have: Double, _ goal: Double, _ unit: String, _ tint: Color) -> some View {
        HStack(spacing: 6) {
            Text(name)
                .font(.system(size: 11))
                .foregroundStyle(LifeOSColor.fg3)
                .frame(width: 46, alignment: .leading)
            ProgressView(value: min(1, have / max(1, goal)))
                .progressViewStyle(.linear)
                .tint(tint)
            Text("\(Int(have))/\(Int(goal))\(unit)")
                .font(.system(size: 10).monospacedDigit())
                .foregroundStyle(.white.opacity(0.8))
                .frame(width: 64, alignment: .trailing)
        }
    }
}
