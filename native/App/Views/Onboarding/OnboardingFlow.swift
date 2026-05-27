import SwiftUI
import SwiftData

/// First-run onboarding. Five steps: brand welcome → data source →
/// biometrics → activity + goal → computed plan. The final step writes
/// every nutrition/body field into UserSettings (reusing the exact
/// Mifflin-St Jeor → activity → goal-adjusted → macro-split math from
/// TDEEWizard) and flips `hasOnboarded`, which transitions RootView
/// into the tab UI.
///
/// The TDEE calculation is intentionally duplicated from TDEEWizard
/// rather than shared — TDEEWizard stays untouched, and the math is
/// small and transparent. If the formula ever changes, both update.
struct OnboardingFlow: View {
    @Bindable var settings: UserSettings
    @Environment(\.modelContext) private var modelContext

    @State private var step: Int = 0

    // Step 2 — data source
    @State private var source: HealthDataSource = .appleHealth

    // Step 3 — biometrics
    @State private var sex: String = "male"
    @State private var ageYears: Int = 28
    @State private var heightInches: Int = 70
    @State private var weightLb: Int = 175

    // Step 4 — activity + goal
    @State private var activity: String = "moderate"
    @State private var goal: Goal = .maintain

    private let stepCount = 5

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

    // MARK: - TDEE math (mirrors TDEEWizard)

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

    private var bmr: Double {
        let kg = Double(weightLb) * 0.45359237
        let cm = Double(heightInches) * 2.54
        let age = Double(ageYears)
        if sex == "female" {
            return 10 * kg + 6.25 * cm - 5 * age - 161
        }
        return 10 * kg + 6.25 * cm - 5 * age + 5
    }

    private var tdee: Int { Int((bmr * activityMultiplier).rounded()) }
    private var targetKcal: Int { tdee + goal.adjustmentKcal }

    private var targetMacros: (p: Int, c: Int, f: Int) {
        let split = goal.split
        return (
            p: Int((Double(targetKcal) * split.protein / 4).rounded()),
            c: Int((Double(targetKcal) * split.carbs / 4).rounded()),
            f: Int((Double(targetKcal) * split.fat / 9).rounded())
        )
    }

    private var usesMetric: Bool { settings.weightUnit == "kg" }

    // MARK: - Body

    var body: some View {
        ZStack {
            AmbientBackground()

            VStack(spacing: 0) {
                progressBar
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                ZStack {
                    stepView
                        .id(step)
                        .transition(
                            .asymmetric(
                                insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .move(edge: .leading).combined(with: .opacity)
                            )
                        )
                }
                .frame(maxHeight: .infinity)

                navBar
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
            }
            .padding(.top, 8)
        }
        .onAppear(perform: prefillFromSettings)
        .animation(.spring(response: 0.45, dampingFraction: 0.85), value: step)
    }

    // MARK: - Progress

    private var progressBar: some View {
        HStack(spacing: 6) {
            ForEach(0..<stepCount, id: \.self) { i in
                Capsule()
                    .fill(i <= step ? LifeOSColor.accent : LifeOSColor.strokeStrong)
                    .frame(height: 4)
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: step)
            }
        }
    }

    // MARK: - Step router

    @ViewBuilder
    private var stepView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch step {
                case 0: welcomeStep
                case 1: sourceStep
                case 2: biometricsStep
                case 3: activityStep
                default: resultStep
                }
                Spacer(minLength: 24)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Step 0 — Welcome

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer(minLength: 40)
            ZStack {
                Circle()
                    .fill(LifeOSColor.accent.opacity(0.18))
                    .frame(width: 96, height: 96)
                    .blur(radius: 18)
                Image(systemName: "sparkles")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            .frame(maxWidth: .infinity, alignment: .center)

            VStack(alignment: .leading, spacing: 12) {
                Text("Welcome to Life OS")
                    .font(.system(size: 32, weight: .bold))
                    .tracking(-0.5)
                    .foregroundStyle(LifeOSColor.fg)
                Text("Your personal command center for goals, habits, sleep, nutrition, and training — with a coach that sees the whole picture.")
                    .font(.system(size: 16))
                    .foregroundStyle(LifeOSColor.fg2)
                    .lineSpacing(3)
            }

            VStack(alignment: .leading, spacing: 12) {
                featureRow("target", "Goals & habits", "Track what moves the needle")
                featureRow("bed.double.fill", "Recovery & sleep", "Recovery, strain, sleep at a glance")
                featureRow("fork.knife", "Nutrition & training", "Macros, meals, lifts — dialed in")
            }
            .padding(.top, 4)
        }
    }

    private func featureRow(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(LifeOSColor.accent.opacity(0.12))
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(LifeOSColor.fg)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
        }
    }

    // MARK: - Step 1 — Data source

    private var sourceStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader("Where's your data?", "Pick where Life OS pulls sleep, recovery, steps, and weight from. You can change this later in Settings.")

            VStack(spacing: 10) {
                ForEach(HealthDataSource.allCases) { src in
                    sourceRow(src)
                }
            }

            if source == .googleHealth {
                Button {
                    Haptics.tap()
                    GoogleHealthClient.shared.startAuthFlow()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: settings.googleHealthConnected ? "checkmark.circle.fill" : "link")
                            .font(.system(size: 15, weight: .semibold))
                        Text(settings.googleHealthConnected ? "Connected" : "Connect Google Health")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundStyle(settings.googleHealthConnected ? LifeOSColor.success : .white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(settings.googleHealthConnected
                                  ? LifeOSColor.success.opacity(0.14)
                                  : LifeOSColor.accent)
                    )
                }
                .buttonStyle(.plain)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: source)
    }

    private func sourceRow(_ src: HealthDataSource) -> some View {
        let active = source == src
        return Button {
            source = src
            settings.healthDataSource = src.rawValue
            Haptics.tick()
            if src == .appleHealth {
                Task { await HealthKitManager.shared.requestAuthorization() }
            }
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill((active ? LifeOSColor.accent : LifeOSColor.fg3).opacity(0.14))
                    Image(systemName: src.icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(active ? LifeOSColor.accent : LifeOSColor.fg2)
                }
                .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(src.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text(src.subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                Image(systemName: active ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(active ? LifeOSColor.accent : LifeOSColor.fg3)
            }
            .padding(14)
            .liquidGlass(cornerRadius: 16, tint: active ? LifeOSColor.accent : nil, depth: .soft)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 2 — Biometrics

    private var biometricsStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader("About you", "Drag the dials. Used to compute your daily calorie and macro targets — nothing leaves your device.")

            Card {
                VStack(alignment: .leading, spacing: 20) {
                    segmented(
                        label: "Sex",
                        options: [("male", "Male"), ("female", "Female")],
                        selection: $sex
                    )
                    rulerField("AGE") {
                        RulerPicker(value: $ageYears, range: 14...90, tint: LifeOSColor.accent,
                                    majorEvery: 5, format: { "\($0)" }, majorLabel: { "\($0)" })
                    }
                    if usesMetric {
                        rulerField("HEIGHT") {
                            RulerPicker(value: heightCmBinding, range: 120...220, tint: LifeOSColor.accent,
                                        majorEvery: 10, format: { "\($0) cm" }, majorLabel: { "\($0)" })
                        }
                        rulerField("WEIGHT") {
                            RulerPicker(value: weightKgBinding, range: 36...205, tint: LifeOSColor.accent,
                                        majorEvery: 10, format: { "\($0) kg" }, majorLabel: { "\($0)" })
                        }
                    } else {
                        rulerField("HEIGHT") {
                            RulerPicker(value: $heightInches, range: 48...84, tint: LifeOSColor.accent,
                                        majorEvery: 12, format: heightFtIn, majorLabel: { "\($0 / 12)′" })
                        }
                        rulerField("WEIGHT") {
                            RulerPicker(value: $weightLb, range: 80...450, tint: LifeOSColor.accent,
                                        majorEvery: 10, format: { "\($0) lb" }, majorLabel: { "\($0)" })
                        }
                    }
                }
            }
        }
    }

    /// "70" inches -> "5 ft 10 in" (drops the inches when it's a round foot).
    private func heightFtIn(_ inches: Int) -> String {
        let ft = inches / 12, inch = inches % 12
        return inch == 0 ? "\(ft) ft" : "\(ft) ft \(inch) in"
    }

    private func rulerField<P: View>(_ label: String, @ViewBuilder _ picker: () -> P) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                .foregroundStyle(LifeOSColor.fg3)
            picker()
        }
    }

    /// Height stepper in cm that maps back to the stored inches value
    /// so the BMR math stays unit-agnostic.
    private var heightCmBinding: Binding<Int> {
        Binding(
            get: { Int((Double(heightInches) * 2.54).rounded()) },
            set: { heightInches = Int((Double($0) / 2.54).rounded()) }
        )
    }
    private var weightKgBinding: Binding<Int> {
        Binding(
            get: { Int((Double(weightLb) * 0.45359237).rounded()) },
            set: { weightLb = Int((Double($0) / 0.45359237).rounded()) }
        )
    }

    // MARK: - Step 3 — Activity + goal

    private var activityStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader("Activity & goal", "How active are you, and what are you aiming for?")

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

            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("GOAL")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(LifeOSColor.fg3)
                    HStack(spacing: 8) {
                        ForEach(Goal.allCases) { goalPill($0) }
                    }
                }
            }
        }
    }

    // MARK: - Step 4 — Result

    private var resultStep: some View {
        let macros = targetMacros
        return VStack(alignment: .leading, spacing: 16) {
            stepHeader("Your plan is ready", "Here's your starting point. You can fine-tune any target in Settings.")

            Card(tint: LifeOSColor.accent) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("DAILY TARGET")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(LifeOSColor.fg3)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(targetKcal)")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(LifeOSColor.Metric.calories)
                        Text("kcal")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Divider().overlay(LifeOSColor.stroke)
                    HStack(spacing: 16) {
                        macroStat("\(macros.p)", "PROTEIN", LifeOSColor.Metric.protein)
                        macroStat("\(macros.c)", "CARBS", LifeOSColor.Metric.carbs)
                        macroStat("\(macros.f)", "FAT", LifeOSColor.Metric.fat)
                    }
                    Text("BMR \(Int(bmr.rounded())) kcal · TDEE \(tdee) kcal · \(goal.adjustmentKcal == 0 ? "no adjustment" : "\(goal.adjustmentKcal > 0 ? "+" : "")\(goal.adjustmentKcal) kcal for \(goal.label.lowercased())")")
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private func macroStat(_ value: String, _ label: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text("g")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Text(label)
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(LifeOSColor.fg3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Nav bar

    private var navBar: some View {
        HStack(spacing: 12) {
            if step > 0 {
                Button {
                    Haptics.tick()
                    step -= 1
                } label: {
                    Text("Back")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg2)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(LifeOSColor.elevated)
                        )
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 120)
            }

            Button {
                advance()
            } label: {
                Text(step == stepCount - 1 ? "Start" : "Continue")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(LifeOSColor.accent)
                    )
                    .shadow(color: LifeOSColor.accent.opacity(0.4), radius: 16, x: 0, y: 6)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Shared pieces (mirror TDEEWizard)

    private func stepHeader(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 26, weight: .bold))
                .tracking(-0.4)
                .foregroundStyle(LifeOSColor.fg)
            Text(subtitle)
                .font(.system(size: 15))
                .foregroundStyle(LifeOSColor.fg2)
                .lineSpacing(2)
        }
    }

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
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(selection.wrappedValue == value ? .white : LifeOSColor.fg2)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 44)
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
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(LifeOSColor.fg2)
                .frame(width: 44, height: 44)
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
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(active ? LifeOSColor.accent : LifeOSColor.fg3)
                }
                .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
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
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(active ? .white : LifeOSColor.fg)
                Text(g.subtitle)
                    .font(.system(size: 10))
                    .foregroundStyle(active ? .white.opacity(0.8) : LifeOSColor.fg3)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 60)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(active ? LifeOSColor.accent : LifeOSColor.elevated)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Flow

    private func prefillFromSettings() {
        source = HealthDataSource.from(settings.healthDataSource)
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

    private func advance() {
        if step < stepCount - 1 {
            Haptics.tick()
            step += 1
        } else {
            finish()
        }
    }

    private func finish() {
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
        settings.healthDataSource = source.rawValue
        settings.hasOnboarded = true
        try? modelContext.save()
        Haptics.success()
    }
}
