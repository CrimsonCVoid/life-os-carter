import SwiftUI

/// Calories + macros centerpiece. A bold calorie-budget ring wraps the three
/// macro rings (protein / carbs / fat), with a large unambiguous "left" number
/// in the center, a 3-up macro stat row, and a context strip (eaten / goal /
/// burned).
///
/// Budget model: the calorie goal already includes an activity multiplier (the
/// TDEE wizard), so burned calories are NOT added to the budget by default —
/// `remaining = goal − eaten`. When the user opts into eat-back, ONLY the
/// active (exercise) component is added — never total (which includes BMR), so
/// a sedentary day adds ~0, not ~1700. Burned is otherwise informational.
struct MacroRingsCard: View {
    let proteinG: Double
    let proteinGoalG: Double
    let carbsG: Double
    let carbsGoalG: Double
    let fatG: Double
    let fatGoalG: Double
    let caloriesEaten: Double
    let caloriesGoal: Double
    /// Active (exercise) energy only — `DailyEntry.activeEnergyKcal`. The only
    /// value eligible to be eaten back. nil when there's no health data.
    let activeBurnedKcal: Double?
    /// Total expenditure (active + BMR) — `DailyEntry.totalCaloriesKcal`. Shown
    /// as "Burned" context only; never added to the budget. nil when no data.
    let totalBurnedKcal: Double?
    /// User setting: add `activeBurnedKcal` back into remaining.
    let eatBackExercise: Bool

    /// Eat-back adjustment: only the ACTIVE component, only when opted in, only
    /// when we have a value. Never BMR.
    private var eatBackBonus: Double {
        guard eatBackExercise, let active = activeBurnedKcal else { return 0 }
        return max(0, active)
    }

    private var remaining: Double { caloriesGoal - caloriesEaten + eatBackBonus }
    private var isOver: Bool { remaining < 0 }

    /// Ring fill = eaten / effective budget; the budget grows by the eat-back
    /// bonus so the ring and the number agree.
    private var effectiveBudget: Double { max(1, caloriesGoal + eatBackBonus) }
    private var calorieProgress: Double { caloriesEaten / effectiveBudget }
    private var calorieRingTint: Color { isOver ? LifeOSColor.danger : LifeOSColor.Metric.calories }

    private var burnedDisplay: String {
        guard let total = totalBurnedKcal, total > 0 else { return "—" }
        return "\(Int(total))"
    }

    var body: some View {
        Card(tint: isOver ? LifeOSColor.danger : nil) {
            VStack(spacing: 18) {
                // Single calorie hero ring — its full interior is the number's
                // clear zone, so a 4-digit value reads cleanly. Per-macro
                // progress lives in the stat tiles below (no cramped nested
                // rings crushing the center).
                ZStack {
                    ProgressRing(progress: calorieProgress, tint: calorieRingTint, lineWidth: 14)

                    VStack(spacing: 2) {
                        Text("\(Int(abs(remaining)))")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            // Comfortably inside the ~140pt interior, so 4 digits
                            // never truncate; scales only for extreme values.
                            .frame(maxWidth: 128)
                            .foregroundStyle(isOver ? LifeOSColor.danger : LifeOSColor.fg)
                            .contentTransition(.numericText())
                            .animation(.snappy(duration: 0.2), value: remaining)
                        Text(isOver ? "OVER" : "LEFT")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.8)
                            .foregroundStyle(isOver ? LifeOSColor.danger : LifeOSColor.fg3)
                        Text("\(Int(caloriesGoal)) kcal goal")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .frame(width: 168, height: 168)

                HStack(spacing: 10) {
                    macroStat("Protein", proteinG, proteinGoalG, LifeOSColor.Metric.protein)
                    macroStat("Carbs",   carbsG,   carbsGoalG,   LifeOSColor.Metric.carbs)
                    macroStat("Fat",     fatG,     fatGoalG,     LifeOSColor.Metric.fat)
                }

                contextStrip
            }
        }
    }

    private func macroStat(_ name: String, _ have: Double, _ goal: Double, _ tint: Color) -> some View {
        VStack(spacing: 6) {
            Text(name.uppercased())
                .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                .foregroundStyle(LifeOSColor.fg3)
            Text("\(Int(have))")
                .font(.system(size: 20, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
            Text("/ \(Int(goal))g")
                .font(.system(size: 10, weight: .medium).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg3)
            ProgressView(value: min(1, have / max(1, goal)))
                .progressViewStyle(.linear)
                .tint(tint)
                .scaleEffect(x: 1, y: 0.6, anchor: .center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint.opacity(0.07))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(tint.opacity(0.18), lineWidth: 0.5))
        )
    }

    private var contextStrip: some View {
        HStack(spacing: 0) {
            contextCell("EATEN", "\(Int(caloriesEaten))", LifeOSColor.Metric.calories)
            Divider().frame(height: 24).overlay(LifeOSColor.stroke)
            contextCell("GOAL", "\(Int(caloriesGoal))", LifeOSColor.fg2)
            Divider().frame(height: 24).overlay(LifeOSColor.stroke)
            // When eat-back is on, surface the ACTIVE amount actually added to
            // the budget (not total expenditure, which the old "(+active)"
            // label misleadingly implied was the added number).
            if eatBackExercise, eatBackBonus > 0 {
                contextCell("EATEN BACK", "+\(Int(eatBackBonus))", LifeOSColor.Metric.steps)
            } else {
                contextCell("BURNED", burnedDisplay, LifeOSColor.Metric.steps)
            }
        }
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LifeOSColor.elevated))
    }

    private func contextCell(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.5)
                .foregroundStyle(LifeOSColor.fg3)
                .lineLimit(1).minimumScaleFactor(0.8)
            Text(value)
                .font(.system(size: 15, weight: .bold).monospacedDigit())
                .foregroundStyle(value == "—" ? LifeOSColor.fg3 : tint)
        }
        .frame(maxWidth: .infinity)
    }
}
