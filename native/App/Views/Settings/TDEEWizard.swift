import SwiftUI
import SwiftData

/// Guided macro setup. Walks the user through Mifflin-St Jeor BMR
/// → activity-multiplied TDEE → goal-adjusted calories → macro split
/// (40/30/30 maintain, 40/40/20 cut, 30/45/25 bulk by default), then
/// writes the result into UserSettings on apply.
///
/// Math is simple but transparent — every input the user provided is
/// visible in the summary card so they can sanity-check the result
/// before tapping Apply.
struct TDEEWizard: View {
    @Bindable var settings: UserSettings
    @Environment(\.dismiss) private var dismiss

    @State private var sex: String = "male"
    @State private var ageYears: Int = 28
    @State private var heightInches: Int = 70
    @State private var weightLb: Int = 175
    @State private var activity: String = "moderate"
    @State private var goal: Goal = .maintain

    enum Goal: String, CaseIterable, Identifiable {
        case cut, maintain, bulk
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
        var subtitle: String {
            switch self {
            case .cut:      return "−500 kcal/day"
            case .maintain: return "Hold weight"
            case .bulk:     return "+300 kcal/day"
            }
        }
        var adjustmentKcal: Int {
            switch self {
            case .cut:      return -500
            case .maintain: return 0
            case .bulk:     return 300
            }
        }
        var split: (protein: Double, carbs: Double, fat: Double) {
            switch self {
            case .cut:      return (0.40, 0.40, 0.20)
            case .maintain: return (0.30, 0.40, 0.30)
            case .bulk:     return (0.30, 0.45, 0.25)
            }
        }
    }

    private var activityMultiplier: Double {
        switch activity {
        case "sedentary":   return 1.2
        case "light":       return 1.375
        case "moderate":    return 1.55
        case "active":      return 1.725
        case "very_active": return 1.9
        default:            return 1.55
        }
    }

    /// Mifflin-St Jeor BMR (more accurate than Harris-Benedict for the
    /// general population). Returns kcal/day.
    private var bmr: Double {
        let kg = Double(weightLb) * 0.45359237
        let cm = Double(heightInches) * 2.54
        let age = Double(ageYears)
        if sex == "female" {
            return 10 * kg + 6.25 * cm - 5 * age - 161
        }
        return 10 * kg + 6.25 * cm - 5 * age + 5
    }

    private var tdee: Int {
        Int((bmr * activityMultiplier).rounded())
    }

    private var targetKcal: Int {
        tdee + goal.adjustmentKcal
    }

    private var targetMacros: (p: Int, c: Int, f: Int) {
        let split = goal.split
        let pKcal = Double(targetKcal) * split.protein
        let cKcal = Double(targetKcal) * split.carbs
        let fKcal = Double(targetKcal) * split.fat
        return (
            p: Int((pKcal / 4).rounded()),
            c: Int((cKcal / 4).rounded()),
            f: Int((fKcal / 9).rounded())
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    statsCard
                    activityCard
                    goalCard
                    summaryCard
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Macro setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(LifeOSColor.fg2)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Apply") { apply() }
                        .fontWeight(.semibold)
                        .foregroundStyle(LifeOSColor.accent)
                }
            }
            .onAppear(perform: prefillFromSettings)
        }
    }

    // MARK: - Sections

    private var statsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                Text("ABOUT YOU")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                segmented(
                    label: "Sex",
                    options: [("male", "Male"), ("female", "Female")],
                    selection: $sex
                )
                stepperRow(label: "Age", value: $ageYears, range: 14...90, step: 1, unit: "yrs")
                stepperRow(label: "Height", value: $heightInches, range: 48...84, step: 1, unit: "in")
                stepperRow(label: "Weight", value: $weightLb, range: 80...450, step: 1, unit: "lb")
            }
        }
    }

    private var activityCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("ACTIVITY")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                VStack(spacing: 6) {
                    activityRow("sedentary",   "Sedentary",   "Desk job, no exercise")
                    activityRow("light",       "Light",       "Light exercise 1–3×/wk")
                    activityRow("moderate",    "Moderate",    "Exercise 3–5×/wk")
                    activityRow("active",      "Active",      "Hard exercise 6–7×/wk")
                    activityRow("very_active", "Very active", "Twice daily or physical job")
                }
            }
        }
    }

    private var goalCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("GOAL")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                HStack(spacing: 8) {
                    ForEach(Goal.allCases) { g in
                        goalPill(g)
                    }
                }
            }
        }
    }

    private var summaryCard: some View {
        let macros = targetMacros
        return Card(tint: LifeOSColor.accent) {
            VStack(alignment: .leading, spacing: 12) {
                Text("YOUR PLAN")
                    .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(LifeOSColor.fg3)
                HStack(spacing: 16) {
                    statBig(value: "\(targetKcal)", unit: "kcal", label: "DAILY TARGET", tint: LifeOSColor.Metric.calories)
                    statBig(value: "\(macros.p)", unit: "g", label: "PROTEIN", tint: LifeOSColor.Metric.protein)
                    statBig(value: "\(macros.c)", unit: "g", label: "CARBS", tint: LifeOSColor.Metric.carbs)
                    statBig(value: "\(macros.f)", unit: "g", label: "FAT", tint: LifeOSColor.Metric.fat)
                }
                Divider().overlay(LifeOSColor.stroke)
                Text("BMR \(Int(bmr.rounded())) kcal · TDEE \(tdee) kcal · \(goal.adjustmentKcal == 0 ? "no adjustment" : "\(goal.adjustmentKcal > 0 ? "+" : "")\(goal.adjustmentKcal) kcal for \(goal.label.lowercased())")")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    // MARK: - Pieces

    private func segmented(
        label: String,
        options: [(String, String)],
        selection: Binding<String>
    ) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
                .frame(width: 70, alignment: .leading)
            HStack(spacing: 6) {
                ForEach(options, id: \.0) { (value, lbl) in
                    Button {
                        selection.wrappedValue = value
                        Haptics.tick()
                    } label: {
                        Text(lbl)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(selection.wrappedValue == value ? .white : LifeOSColor.fg2)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .frame(maxWidth: .infinity)
                            .background(
                                Capsule().fill(
                                    selection.wrappedValue == value ? LifeOSColor.accent : LifeOSColor.elevated
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func stepperRow(
        label: String,
        value: Binding<Int>,
        range: ClosedRange<Int>,
        step: Int,
        unit: String
    ) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LifeOSColor.fg)
                .frame(width: 70, alignment: .leading)
            Spacer()
            stepBtn("minus") {
                value.wrappedValue = max(range.lowerBound, value.wrappedValue - step)
                Haptics.tick()
            }
            VStack(spacing: 0) {
                Text("\(value.wrappedValue)")
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(LifeOSColor.fg)
                Text(unit)
                    .font(.system(size: 9))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            .frame(minWidth: 50)
            stepBtn("plus") {
                value.wrappedValue = min(range.upperBound, value.wrappedValue + step)
                Haptics.tick()
            }
        }
    }

    private func stepBtn(_ system: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(width: 30, height: 30)
                .background(Circle().fill(LifeOSColor.elevated))
        }
        .buttonStyle(.plain)
    }

    private func activityRow(_ value: String, _ label: String, _ subtitle: String) -> some View {
        let active = activity == value
        return Button {
            activity = value
            Haptics.tick()
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill((active ? LifeOSColor.accent : LifeOSColor.fg3).opacity(0.15))
                    Image(systemName: active ? "checkmark" : "circle")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(active ? LifeOSColor.accent : LifeOSColor.fg3)
                }
                .frame(width: 24, height: 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func goalPill(_ g: Goal) -> some View {
        let active = goal == g
        return Button {
            goal = g
            Haptics.tick()
        } label: {
            VStack(spacing: 3) {
                Text(g.label)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(active ? .white : LifeOSColor.fg)
                Text(g.subtitle)
                    .font(.system(size: 10))
                    .foregroundStyle(active ? .white.opacity(0.8) : LifeOSColor.fg3)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(active ? LifeOSColor.accent : LifeOSColor.elevated)
            )
        }
        .buttonStyle(.plain)
    }

    private func statBig(value: String, unit: String, label: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(value)
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text(unit)
                    .font(.system(size: 9))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(LifeOSColor.fg3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Persist

    private func prefillFromSettings() {
        sex = settings.biologicalSex ?? "male"
        if let yr = settings.birthYear {
            let nowYear = Calendar.current.component(.year, from: Date())
            ageYears = max(14, nowYear - yr)
        }
        if let h = settings.heightCm {
            heightInches = Int((Double(h) / 2.54).rounded())
        }
        activity = settings.activityLevel
    }

    private func apply() {
        let m = targetMacros
        settings.caloriesGoal = targetKcal
        settings.proteinGoal = m.p
        settings.carbsGoal = m.c
        settings.fatGoal = m.f
        settings.biologicalSex = sex
        settings.heightCm = Int((Double(heightInches) * 2.54).rounded())
        settings.birthYear = Calendar.current.component(.year, from: Date()) - ageYears
        settings.activityLevel = activity
        settings.nutritionTargetMethod = "tdee_\(goal.rawValue)"
        Haptics.success()
        dismiss()
    }
}
