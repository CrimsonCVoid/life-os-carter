import SwiftUI
import SwiftData

/// Today screen — real-data version. Pulls a singleton DailyEntry row
/// for today (creating it if missing), populates HealthKit-backed
/// fields on appear, computes recovery + strain from those, and lets
/// the user log everything else inline (water, mood, energy,
/// behavioral journal prompts). Pull-to-refresh re-syncs from
/// HealthKit so the user can manually trigger an update if they just
/// finished a workout or HRV reading.
struct TodayView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var dailyRows: [DailyEntry]
    @Query private var settingsRows: [UserSettings]
    @Query(sort: \LiftSessionEntry.startedAt, order: .reverse) private var allSessions: [LiftSessionEntry]
    @Query(filter: #Predicate<HabitEntry> { $0.archived == false }, sort: \HabitEntry.order) private var habits: [HabitEntry]
    @Query(sort: \MealLog.loggedAt, order: .reverse) private var allMeals: [MealLog]

    @State private var revealed = false
    @State private var syncing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    greeting.cascadeReveal(index: 0, visible: revealed)
                    RecoveryStrainHero(
                        recovery: recoveryScore,
                        strain: strainScore
                    )
                    .cascadeReveal(index: 1, visible: revealed)
                    if let advice = recoveryAdvice {
                        RecoveryAdviceCard(line: advice)
                            .cascadeReveal(index: 2, visible: revealed)
                    }
                    activityRingsCard.cascadeReveal(index: 2, visible: revealed)
                    vitalsGrid.cascadeReveal(index: 3, visible: revealed)
                    caloriesCard.cascadeReveal(index: 4, visible: revealed)
                    JournalPromptStrip(
                        daily: todayEntry,
                        onChange: persist
                    )
                    .cascadeReveal(index: 5, visible: revealed)
                    MoodEnergyCard(
                        mood: todayEntry.moodScore,
                        energy: todayEntry.energyScore,
                        moodTrend: moodTrend7d,
                        energyTrend: energyTrend7d,
                        onLogMood: { v in
                            todayEntry.moodScore = v
                            persist()
                        },
                        onLogEnergy: { v in
                            todayEntry.energyScore = v
                            persist()
                        }
                    )
                    .cascadeReveal(index: 6, visible: revealed)
                    workoutsSummary.cascadeReveal(index: 7, visible: revealed)
                    sleepCard.cascadeReveal(index: 8, visible: revealed)
                    HydrationCard(
                        currentOz: todayEntry.waterOz,
                        goalOz: settings.waterGoalOz,
                        onLog: { delta in
                            todayEntry.waterOz = max(0, todayEntry.waterOz + delta)
                            persist()
                            Task { await HealthKitManager.shared.writeWater(ounces: max(0, delta)) }
                        }
                    )
                    .cascadeReveal(index: 9, visible: revealed)
                    habitsRoll.cascadeReveal(index: 10, visible: revealed)
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .refreshable {
                await forceSync()
            }
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .foregroundStyle(LifeOSColor.fg2)
                    }
                }
            }
            .onAppear {
                if !revealed { revealed = true }
                Task { await sync() }
            }
        }
    }

    // MARK: - Singletons

    private var todayKey: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }

    private var todayEntry: DailyEntry {
        if let existing = dailyRows.first(where: { $0.date == todayKey }) {
            return existing
        }
        let fresh = DailyEntry(date: todayKey)
        modelContext.insert(fresh)
        try? modelContext.save()
        return fresh
    }

    private var settings: UserSettings {
        if let existing = settingsRows.first { return existing }
        return UserSettings.loadOrCreate(in: modelContext)
    }

    // MARK: - Derived

    private var recoveryScore: RecoveryCalculator.Score? {
        RecoveryCalculator.compute(
            daily: todayEntry,
            hrvBaseline: settings.hrvBaseline,
            rhrBaseline: settings.rhrBaseline,
            sleepGoalHours: settings.sleepGoalHours
        )
    }

    private var strainScore: StrainCalculator.Score {
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: Date())
        let todaySessions = allSessions.filter { $0.startedAt >= dayStart }
        let todayVolume = todaySessions.reduce(0.0) { $0 + $1.totalVolumeLb }
        let weekStart = cal.date(byAdding: .day, value: -7, to: dayStart) ?? dayStart
        let weekSessions = allSessions.filter { $0.startedAt >= weekStart }
        let weekMaxDayVolume = Dictionary(grouping: weekSessions, by: \.date)
            .values
            .map { $0.reduce(0.0) { $0 + $1.totalVolumeLb } }
            .max() ?? 0
        // We don't (yet) have async active-energy in the derived state.
        // Use today's calorie deficit from HealthKit syncToday as a proxy:
        // if it lands in DailyEntry.notes or via separate query in v2.
        // For now zero out — sufflower contribution from volume alone.
        return StrainCalculator.compute(
            liftVolumeTodayLb: todayVolume,
            liftVolumeMax7dLb: weekMaxDayVolume,
            activeEnergyKcal: 0
        )
    }

    private var recoveryAdvice: RecoveryAdvice.Line? {
        RecoveryAdvice.generate(
            recovery: recoveryScore,
            strainToday: strainScore,
            consecutiveTrainingDays: consecutiveTrainingDays
        )
    }

    private var consecutiveTrainingDays: Int {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let trainedSet: Set<String> = Set(allSessions.map { $0.date })
        var count = 0
        var cursor = today
        var safety = 0
        while safety < 60 {
            safety += 1
            let key = ymd(cursor)
            if trainedSet.contains(key) {
                count += 1
            } else {
                break
            }
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return count
    }

    private var moodTrend7d: [Double] {
        last7Dailies.map { Double($0?.moodScore ?? 0) }
    }
    private var energyTrend7d: [Double] {
        last7Dailies.map { Double($0?.energyScore ?? 0) }
    }
    private var last7Dailies: [DailyEntry?] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let map = Dictionary(uniqueKeysWithValues: dailyRows.map { ($0.date, $0) })
        return (0..<7).reversed().compactMap { offset in
            guard let d = cal.date(byAdding: .day, value: -offset, to: today) else { return nil }
            let key = ymd(d)
            return map[key]
        }
    }

    private func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }

    // MARK: - Greeting

    private var greeting: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(greetingText)
                    .font(.system(size: 22, weight: .bold))
                Text(Date().formatted(.dateTime.weekday(.wide).month().day()))
                    .font(.system(size: 12))
                    .foregroundStyle(LifeOSColor.fg3)
            }
            Spacer()
            if syncing {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 4)
    }

    private var greetingText: String {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case 5..<12:  return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default:      return "Late night"
        }
    }

    // MARK: - Activity rings (real-ish: tied to HealthKit aggregates)

    private var activityRingsCard: some View {
        let steps = todayEntry.steps ?? 0
        let stepsGoal = settings.stepsGoal
        return Card {
            HStack(spacing: 18) {
                ActivityRings(
                    move: 0.4,
                    exercise: 0.4,
                    stand: 0.4
                )
                .frame(width: 110, height: 110)
                VStack(alignment: .leading, spacing: 10) {
                    ringRow(name: "Steps", have: steps, goal: stepsGoal, unit: "steps", tint: LifeOSColor.Metric.steps)
                    ringRow(name: "Sleep", have: Int((todayEntry.sleepHours ?? 0) * 60), goal: Int(settings.sleepGoalHours * 60), unit: "min", tint: LifeOSColor.Metric.sleep)
                    ringRow(name: "Water", have: Int(todayEntry.waterOz), goal: Int(settings.waterGoalOz), unit: "oz", tint: LifeOSColor.Metric.water)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func ringRow(name: String, have: Int, goal: Int, unit: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name.uppercased())
                .font(.system(size: 9, weight: .semibold)).tracking(1.2)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(have)")
                    .font(.system(size: 18, weight: .bold).monospacedDigit())
                    .foregroundStyle(tint)
                Text("/ \(goal) \(unit)")
                    .font(.system(size: 11))
                    .foregroundStyle(LifeOSColor.fg3)
            }
        }
    }

    // MARK: - Vitals

    private var vitalsGrid: some View {
        VStack(spacing: 10) {
            SectionLabel("Vitals")
            HStack(spacing: 10) {
                VitalTile(
                    icon: "heart.fill", label: "Resting HR",
                    value: todayEntry.restingHr.map { "\(Int($0))" } ?? "—",
                    unit: "bpm",
                    tint: LifeOSColor.Metric.mood,
                    trend: [],
                    delta: rhrDelta
                )
                VitalTile(
                    icon: "waveform.path.ecg", label: "HRV",
                    value: todayEntry.hrvMs.map { "\(Int($0))" } ?? "—",
                    unit: "ms",
                    tint: LifeOSColor.Metric.sleep,
                    trend: [],
                    delta: hrvDelta
                )
            }
            HStack(spacing: 10) {
                VitalTile(
                    icon: "figure.walk", label: "Steps",
                    value: formatSteps(todayEntry.steps ?? 0),
                    tint: LifeOSColor.Metric.steps,
                    trend: [],
                    delta: stepsDelta
                )
                VitalTile(
                    icon: "scalemass.fill", label: "Weight",
                    value: todayEntry.weightLb.map {
                        WeightUnit.from(settings.weightUnit).formatted(fromLb: $0)
                            .replacingOccurrences(of: " \(settings.weightUnit)", with: "")
                    } ?? "—",
                    unit: settings.weightUnit,
                    tint: LifeOSColor.Metric.weight,
                    trend: [],
                    delta: "—"
                )
            }
        }
    }

    private var hrvDelta: String {
        guard let now = todayEntry.hrvMs, let base = settings.hrvBaseline, base > 0 else { return "no baseline" }
        let pct = Int(((now - base) / base * 100).rounded())
        return "\(pct >= 0 ? "+" : "")\(pct)% vs 14d"
    }
    private var rhrDelta: String {
        guard let now = todayEntry.restingHr, let base = settings.rhrBaseline, base > 0 else { return "no baseline" }
        let pct = Int(((now - base) / base * 100).rounded())
        return "\(pct >= 0 ? "+" : "")\(pct)% vs 14d"
    }
    private var stepsDelta: String {
        let goal = settings.stepsGoal
        guard goal > 0, let s = todayEntry.steps else { return "—" }
        return "\(Int(Double(s) / Double(goal) * 100))% of goal"
    }

    private func formatSteps(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? "0"
    }

    // MARK: - Calories

    private var caloriesCard: some View {
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        let mealsToday = allMeals.filter { $0.date == today }
        let kcal = mealsToday.reduce(0.0) { $0 + $1.calories }
        let p = mealsToday.reduce(0.0) { $0 + $1.proteinG }
        let c = mealsToday.reduce(0.0) { $0 + $1.carbsG }
        let f = mealsToday.reduce(0.0) { $0 + $1.fatG }
        return VStack(spacing: 10) {
            SectionLabel("Calories") {
                NavigationLink("Open") { NutritionView() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            MacroRingsCard(
                proteinG: p, proteinGoalG: Double(settings.proteinGoal),
                carbsG: c, carbsGoalG: Double(settings.carbsGoal),
                fatG: f, fatGoalG: Double(settings.fatGoal),
                caloriesEaten: kcal,
                caloriesBurned: 0,
                caloriesGoal: Double(settings.caloriesGoal)
            )
        }
    }

    // MARK: - Workouts summary

    private var workoutsSummary: some View {
        let today = ISO8601DateFormatter.dateOnly.string(from: Date())
        let todayWorkouts = allSessions.filter { $0.date == today }
        let latest = todayWorkouts.first
        return VStack(spacing: 10) {
            SectionLabel("Workouts") {
                NavigationLink("Open") { GymView() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            Card {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.Metric.strain.opacity(0.16))
                        Image(systemName: "dumbbell.fill")
                            .foregroundStyle(LifeOSColor.Metric.strain)
                            .font(.system(size: 18))
                    }
                    .frame(width: 44, height: 44)
                    if let latest {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(latest.workoutType)
                                .font(.system(size: 15, weight: .semibold))
                            Text("\(latest.setCount) sets · \(Int(latest.totalVolumeLb)) lb")
                                .font(.system(size: 11))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("STRAIN")
                                .font(.system(size: 8, weight: .semibold)).tracking(1.2)
                                .foregroundStyle(LifeOSColor.fg3)
                            Text(String(format: "%.1f", strainScore.value))
                                .font(.system(size: 18, weight: .bold).monospacedDigit())
                                .foregroundStyle(LifeOSColor.Metric.strain)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("No workout today")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(LifeOSColor.fg2)
                            Text("Tap Open to start one.")
                                .font(.system(size: 11))
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    // MARK: - Sleep

    @ViewBuilder
    private var sleepCard: some View {
        if let totalHours = todayEntry.sleepHours {
            // Whoop-style breakdown when stages came back from HealthKit;
            // otherwise just totals.
            let stages = makeStages(from: todayEntry)
            SleepCard(
                totalHours: totalHours,
                bedtime: bedtimeApprox(for: totalHours),
                wake: wakeApprox(),
                stages: stages,
                weekAverageHours: sleepAvg7d
            )
        } else {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("SLEEP")
                        .font(.system(size: 10, weight: .heavy)).tracking(0.8)
                        .foregroundStyle(LifeOSColor.fg3)
                    Text("No sleep data for last night yet.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
    }

    private func makeStages(from d: DailyEntry) -> [SleepCard.Stage] {
        // Only return staged data when HealthKit gave us per-stage
        // minutes; otherwise return an empty array so the SleepCard
        // can render a simpler view.
        guard let rem = d.sleepREMMin, let deep = d.sleepDeepMin,
              let light = d.sleepLightMin else { return [] }
        let awake = d.sleepAwakeMin ?? 0
        return [
            .init(kind: .awake, minutes: Double(awake)),
            .init(kind: .rem,   minutes: Double(rem)),
            .init(kind: .core,  minutes: Double(light)),
            .init(kind: .deep,  minutes: Double(deep)),
        ]
    }

    /// Approximate bedtime/wake when we only have a total hours number.
    /// We don't store the actual sample timestamps yet, so derive from
    /// the user's reported sleep goal anchored to ~6:30am wake.
    private func bedtimeApprox(for hours: Double) -> Date {
        let cal = Calendar.current
        let wake = wakeApprox()
        return cal.date(byAdding: .second, value: -Int(hours * 3600), to: wake) ?? wake
    }

    private func wakeApprox() -> Date {
        let cal = Calendar.current
        return cal.date(bySettingHour: 6, minute: 30, second: 0, of: Date()) ?? Date()
    }

    private var sleepAvg7d: Double {
        let values = last7Dailies.compactMap { $0?.sleepHours }
        guard !values.isEmpty else { return 0 }
        return values.reduce(0, +) / Double(values.count)
    }

    // MARK: - Habits roll-up

    private var habitsRoll: some View {
        let todayKeyLocal = todayKey
        let cal = Calendar.current
        let weekday = cal.component(.weekday, from: Date())
        let dueToday = habits.filter { $0.cadence.isDueOn(weekday: weekday) }
        let done = dueToday.filter { $0.isCompleted(on: todayKeyLocal) }.count
        let total = dueToday.count
        let bestStreak = habits.map { $0.currentStreak() }.max() ?? 0
        return VStack(spacing: 10) {
            SectionLabel("Habits") {
                NavigationLink("Open") { HabitsView() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(LifeOSColor.accent)
            }
            Card {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(done)").font(.system(size: 28, weight: .bold).monospacedDigit())
                            Text("/ \(total)").font(.system(size: 14)).foregroundStyle(LifeOSColor.fg3)
                        }
                        Text(total == 0 ? "no habits due" : "habits today")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(dueToday.prefix(8), id: \.id) { h in
                            let isDone = h.isCompleted(on: todayKeyLocal)
                            Circle()
                                .fill(isDone ? h.color : LifeOSColor.elevated)
                                .frame(width: 14, height: 14)
                                .overlay(Circle().stroke(LifeOSColor.stroke, lineWidth: 0.5))
                        }
                    }
                    if bestStreak > 0 {
                        Divider().overlay(LifeOSColor.stroke).frame(height: 30)
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 3) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(LifeOSColor.warning)
                                Text("\(bestStreak)").font(.system(size: 16, weight: .bold).monospacedDigit())
                            }
                            Text("STREAK")
                                .font(.system(size: 8, weight: .semibold)).tracking(1.2)
                                .foregroundStyle(LifeOSColor.fg3)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Persistence helpers

    private func persist() {
        try? modelContext.save()
        Task { await SyncService.shared.drainPending() }
    }

    /// Default on-appear sync — throttled by HealthSync to once per
    /// 60s. Idle tab switches no longer trigger a HealthKit pull +
    /// SwiftData rewrite, which was the root cause of the cascading
    /// @Query re-emit storm that pegged CPU.
    private func sync() async {
        syncing = true
        await HealthSync.syncToday(in: modelContext)
        syncing = false
    }

    /// Pull-to-refresh path — bypasses the throttle. The user has
    /// explicitly asked for fresh data so respect that even within
    /// the 60s window.
    private func forceSync() async {
        syncing = true
        await HealthSync.syncToday(in: modelContext, force: true)
        syncing = false
    }
}
