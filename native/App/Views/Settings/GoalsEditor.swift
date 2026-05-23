import SwiftUI
import SwiftData

/// User-configurable goals — macro targets, sleep, water, steps —
/// stored in the singleton UserSettings row. Lives as a pushable
/// view rather than a sheet so it doesn't crowd the Settings list.
struct GoalsEditor: View {
    @Bindable var settings: UserSettings
    @State private var wizardOpen = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                wizardCard
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
        .sheet(isPresented: $wizardOpen) {
            TDEEWizard(settings: settings)
                .presentationDetents([.large])
        }
    }

    private var wizardCard: some View {
        Button {
            Haptics.tap()
            wizardOpen = true
        } label: {
            Card(tint: LifeOSColor.accent) {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.accent.opacity(0.18))
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(LifeOSColor.accent)
                    }
                    .frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Calculate from TDEE")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg)
                        Text("Mifflin-St Jeor → activity → cut/maintain/bulk")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(LifeOSColor.accent))
                }
            }
        }
        .buttonStyle(.plain)
        .pressable()
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
        section("Display") {
            VStack(spacing: 14) {
                weightUnitToggle
                Divider().overlay(LifeOSColor.stroke)
                methodLabel
            }
        }
    }

    private var weightUnitToggle: some View {
        HStack(spacing: 12) {
            Circle().fill(LifeOSColor.Metric.weight).frame(width: 8, height: 8)
            Text("Weight unit")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
            Spacer()
            HStack(spacing: 4) {
                unitPill("lb", active: settings.weightUnit == "lb") {
                    settings.weightUnit = "lb"
                    Haptics.tick()
                }
                unitPill("kg", active: settings.weightUnit == "kg") {
                    settings.weightUnit = "kg"
                    Haptics.tick()
                }
            }
        }
    }

    private func unitPill(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(active ? .white : LifeOSColor.fg2)
                .frame(width: 36, height: 28)
                .background(
                    Capsule().fill(active ? LifeOSColor.accent : LifeOSColor.elevated)
                )
        }
        .buttonStyle(.plain)
    }

    private var methodLabel: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CURRENT METHOD")
                .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                .foregroundStyle(LifeOSColor.fg3)
            Text(methodLabelText)
                .font(.system(size: 12))
                .foregroundStyle(LifeOSColor.fg2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var methodLabelText: String {
        switch settings.nutritionTargetMethod {
        case "tdee_cut":      return "Calculated from TDEE — cut (−500 kcal/day)"
        case "tdee_maintain": return "Calculated from TDEE — maintain"
        case "tdee_bulk":     return "Calculated from TDEE — bulk (+300 kcal/day)"
        default:              return "Macros set manually. Tap \"Calculate from TDEE\" above to use the wizard."
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
