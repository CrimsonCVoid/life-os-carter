import SwiftUI
import SwiftData

/// User-configurable goals — macro targets, sleep, water, steps —
/// stored in the singleton UserSettings row. Lives as a pushable
/// view rather than a sheet so it doesn't crowd the Settings list.
struct GoalsEditor: View {
    @Bindable var settings: UserSettings

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                macrosCard
                dailyTargetsCard
                methodCard
                Spacer(minLength: 60)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var macrosCard: some View {
        section("Macros") {
            VStack(spacing: 12) {
                intRow(label: "Calories", unit: "kcal",
                       tint: LifeOSColor.Metric.calories,
                       value: $settings.caloriesGoal, step: 50, range: 1000...5000)
                intRow(label: "Protein", unit: "g",
                       tint: LifeOSColor.Metric.protein,
                       value: $settings.proteinGoal, step: 5, range: 30...400)
                intRow(label: "Carbs", unit: "g",
                       tint: LifeOSColor.Metric.carbs,
                       value: $settings.carbsGoal, step: 5, range: 0...600)
                intRow(label: "Fat", unit: "g",
                       tint: LifeOSColor.Metric.fat,
                       value: $settings.fatGoal, step: 5, range: 10...200)
            }
        }
    }

    private var dailyTargetsCard: some View {
        section("Daily targets") {
            VStack(spacing: 12) {
                doubleRow(label: "Sleep", unit: "h",
                          tint: LifeOSColor.Metric.sleep,
                          value: $settings.sleepGoalHours, step: 0.5, range: 4...12)
                intRow(label: "Steps", unit: "steps",
                       tint: LifeOSColor.Metric.steps,
                       value: $settings.stepsGoal, step: 1000, range: 0...30000)
                doubleRow(label: "Water", unit: "oz",
                          tint: LifeOSColor.Metric.water,
                          value: $settings.waterGoalOz, step: 8, range: 16...256)
            }
        }
    }

    private var methodCard: some View {
        section("Tracking method") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Macros set manually. A guided TDEE / cut-bulk wizard is coming — for now, type the numbers you want.")
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
                .padding(.horizontal, 4)
            Card { content() }
        }
    }

    private func intRow(
        label: String,
        unit: String,
        tint: Color,
        value: Binding<Int>,
        step: Int,
        range: ClosedRange<Int>
    ) -> some View {
        HStack(spacing: 12) {
            Circle().fill(tint).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
            Spacer()
            stepperButton(systemName: "minus") {
                value.wrappedValue = max(range.lowerBound, value.wrappedValue - step)
                Haptics.tick()
            }
            VStack(spacing: 0) {
                Text("\(value.wrappedValue)")
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text(unit)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(minWidth: 64)
            stepperButton(systemName: "plus") {
                value.wrappedValue = min(range.upperBound, value.wrappedValue + step)
                Haptics.tick()
            }
        }
    }

    private func doubleRow(
        label: String,
        unit: String,
        tint: Color,
        value: Binding<Double>,
        step: Double,
        range: ClosedRange<Double>
    ) -> some View {
        HStack(spacing: 12) {
            Circle().fill(tint).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
            Spacer()
            stepperButton(systemName: "minus") {
                value.wrappedValue = max(range.lowerBound, value.wrappedValue - step)
                Haptics.tick()
            }
            VStack(spacing: 0) {
                Text(value.wrappedValue.truncatingRemainder(dividingBy: 1) == 0
                     ? String(format: "%.0f", value.wrappedValue)
                     : String(format: "%.1f", value.wrappedValue))
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text(unit)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(minWidth: 64)
            stepperButton(systemName: "plus") {
                value.wrappedValue = min(range.upperBound, value.wrappedValue + step)
                Haptics.tick()
            }
        }
    }

    private func stepperButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(width: 30, height: 30)
                .background(Circle().fill(LifeOSColor.elevated))
        }
        .buttonStyle(.plain)
    }
}
