import SwiftUI
import SwiftData

/// User-configurable goals — macro targets, sleep, water, steps —
/// stored in the singleton UserSettings row. Lives as a pushable
/// view rather than a sheet so it doesn't crowd the Settings list.
///
/// Nutrition targets have two paths: a *computed* path (the TDEE
/// wizard, which sets `nutritionTargetMethod = "tdee_<goal>"`) and a
/// *manual* path (the ruler editors below, which set it to "manual").
/// The segmented toggle at the top of the Nutrition section picks
/// which surface is shown; the stored method drives the initial pick.
struct GoalsEditor: View {
    @Bindable var settings: UserSettings
    @Environment(\.modelContext) private var modelContext
    @State private var wizardOpen = false
    @State private var nutritionMode: NutritionMode = .computed

    enum NutritionMode: String, CaseIterable, Identifiable {
        case computed, manual
        var id: String { rawValue }
        var label: String { self == .computed ? "Computed" : "Manual" }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                nutritionTargetsSection
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
        .onAppear {
            // Reflect the stored method so the user lands on the surface
            // their current targets came from.
            nutritionMode = settings.nutritionTargetMethod == "manual" ? .manual : .computed
        }
    }

    // MARK: - Nutrition targets (Computed / Manual)

    private var nutritionTargetsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NUTRITION TARGETS")
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
                .padding(.horizontal, 4)
            modeToggle
            if nutritionMode == .computed {
                wizardCard
            } else {
                manualCard
            }
        }
    }

    private var modeToggle: some View {
        HStack(spacing: 6) {
            ForEach(NutritionMode.allCases) { m in
                Button {
                    guard nutritionMode != m else { return }
                    nutritionMode = m
                    Haptics.tick()
                } label: {
                    Text(m.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(nutritionMode == m ? .white : LifeOSColor.fg2)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            Capsule().fill(nutritionMode == m ? LifeOSColor.accent : LifeOSColor.elevated)
                        )
                }
                .buttonStyle(.plain)
            }
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

    // MARK: - Manual editor

    private var manualCard: some View {
        Card {
            VStack(spacing: 18) {
                rulerBlock(
                    label: "Daily calories",
                    tint: LifeOSColor.Metric.calories,
                    value: $settings.caloriesGoal,
                    range: 1200...5000,
                    majorEvery: 500,
                    format: { "\($0) kcal" },
                    majorLabel: { "\($0)" }
                )
                Divider().overlay(LifeOSColor.stroke)
                rulerBlock(
                    label: "Protein",
                    tint: LifeOSColor.Metric.protein,
                    value: $settings.proteinGoal,
                    range: 50...300,
                    majorEvery: 50,
                    format: { "\($0) g" },
                    majorLabel: { "\($0)" }
                )
                rulerBlock(
                    label: "Carbs",
                    tint: LifeOSColor.Metric.carbs,
                    value: $settings.carbsGoal,
                    range: 50...500,
                    majorEvery: 50,
                    format: { "\($0) g" },
                    majorLabel: { "\($0)" }
                )
                rulerBlock(
                    label: "Fat",
                    tint: LifeOSColor.Metric.fat,
                    value: $settings.fatGoal,
                    range: 20...200,
                    majorEvery: 25,
                    format: { "\($0) g" },
                    majorLabel: { "\($0)" }
                )
                Divider().overlay(LifeOSColor.stroke)
                crossCheck
                saveButton
            }
        }
    }

    private func rulerBlock(
        label: String,
        tint: Color,
        value: Binding<Int>,
        range: ClosedRange<Int>,
        majorEvery: Int,
        format: @escaping (Int) -> String,
        majorLabel: @escaping (Int) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle().fill(tint).frame(width: 8, height: 8)
                Text(label)
                    .font(.system(size: 12, weight: .heavy)).tracking(0.4)
                    .foregroundStyle(LifeOSColor.fg2)
            }
            RulerPicker(
                value: value,
                range: range,
                tint: tint,
                majorEvery: majorEvery,
                format: format,
                majorLabel: majorLabel
            )
        }
    }

    /// Live 4/4/9 cross-check so the user can see whether their macro
    /// grams roughly add up to the calorie goal they set.
    private var crossCheck: some View {
        let implied = settings.proteinGoal * 4 + settings.carbsGoal * 4 + settings.fatGoal * 9
        let delta = implied - settings.caloriesGoal
        let aligned = abs(delta) <= 75
        return HStack(spacing: 8) {
            Image(systemName: aligned ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundStyle(aligned ? LifeOSColor.success : LifeOSColor.warning)
            Text("Macros imply \(implied) kcal")
                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(LifeOSColor.fg2)
            Spacer()
            Text(delta == 0 ? "matches goal" : "\(delta > 0 ? "+" : "")\(delta) kcal vs goal")
                .font(.system(size: 11).monospacedDigit())
                .foregroundStyle(aligned ? LifeOSColor.fg3 : LifeOSColor.warning)
        }
    }

    private var saveButton: some View {
        Button {
            settings.nutritionTargetMethod = "manual"
            try? modelContext.save()
            Haptics.success()
        } label: {
            Text(settings.nutritionTargetMethod == "manual" ? "Saved as manual targets" : "Save manual targets")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Capsule().fill(LifeOSColor.accent))
        }
        .buttonStyle(.plain)
        .pressable()
    }

    // MARK: - Daily targets (sleep / steps / water)

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
        default:              return "Targets set manually. Switch to Computed above to use the TDEE wizard."
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
