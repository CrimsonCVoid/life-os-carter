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
    @State private var showRecoveryDetail = false
    @State private var showStrainDetail = false
    @State private var showSleepDetail = false
    /// The day the screen is showing. Defaults to actual today; the day
    /// navigator walks it backwards/forwards. Future days are disallowed.
    @State private var selectedDate = Calendar.current.startOfDay(for: Date())

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    dayNavigator.cascadeReveal(index: 0, visible: revealed)
                    greeting.cascadeReveal(index: 0, visible: revealed)
                    RecoveryStrainHero(
                        recovery: recoveryScore,
                        strain: strainScore,
                        onTapRecovery: { showRecoveryDetail = true },
                        onTapStrain: { showStrainDetail = true }
                    )
                    .cascadeReveal(index: 1, visible: revealed)
                    if let advice = recoveryAdvice {
                        RecoveryAdviceCard(line: advice)
                            .cascadeReveal(index: 2, visible: revealed)
                    }
                    activityRingsCard.cascadeReveal(index: 2, visible: revealed)
                    vitalsGrid.cascadeReveal(index: 3, visible: revealed)
                    caloriesCard.cascadeReveal(index: 4, visible: revealed)
                    // Journal prompts bind to a concrete row, so only show
                    // them when one exists (today always has one; past days
                    // only once logged) — avoids materializing empty rows
                    // just by browsing back.
                    if isViewingToday || existingEntry != nil {
                        JournalPromptStrip(
                            daily: ensureEntry(),
                            onChange: persist
                        )
                        .cascadeReveal(index: 5, visible: revealed)
                    }
                    MoodEnergyCard(
                        mood: displayEntry.moodScore,
                        energy: displayEntry.energyScore,
                        moodTrend: moodTrend7d,
                        energyTrend: energyTrend7d,
                        onLogMood: { v in
                            ensureEntry().moodScore = v
                            persist()
                        },
                        onLogEnergy: { v in
                            ensureEntry().energyScore = v
                            persist()
                        }
                    )
                    .cascadeReveal(index: 6, visible: revealed)
                    workoutsSummary.cascadeReveal(index: 7, visible: revealed)
                    sleepCard.cascadeReveal(index: 8, visible: revealed)
                    HydrationCard(
                        currentOz: displayEntry.waterOz,
                        goalOz: settings.waterGoalOz,
                        onLog: { delta in
                            let e = ensureEntry()
                            e.waterOz = max(0, e.waterOz + delta)
                            persist()
                            // Only mirror to HealthKit for today — a back-dated
                            // log would otherwise write water as of "now".
                            if isViewingToday {
                                Task { await HealthKitManager.shared.writeWater(ounces: max(0, delta)) }
                            }
                        }
                    )
                    .cascadeReveal(index: 9, visible: revealed)
                    habitsRoll.cascadeReveal(index: 10, visible: revealed)
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
            }
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
            .fullScreenCover(isPresented: $showSleepDetail) {
                // Presented as a cover, not a NavigationStack push: the push
                // transition was hanging half-open (gesture-gate timeout,
                // pronounced on iPad). A cover sidesteps the push entirely.
                NavigationStack {
                    SleepHypnogramView(date: selectedKey)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Done") { showSleepDetail = false }
                            }
                        }
                }
            }
            .sheet(isPresented: $showRecoveryDetail) {
                if let r = recoveryScore {
                    RecoveryDetailView(
                        result: r,
                        daily: displayEntry,
                        history: recoveryChartHistory,
                        sleepGoalHours: settings.sleepGoalHours
                    )
                }
            }
            .sheet(isPresented: $showStrainDetail) {
                StrainDetailView(
                    strain: strainScore,
                    sessions: allSessions,
                    dailies: dailyRows
                )
            }
        }
    }

    // MARK: - Singletons

    /// "YYYY-MM-DD" for the day being viewed.
    private var selectedKey: String { ymd(selectedDate) }

    private var isViewingToday: Bool {
        Calendar.current.isDate(selectedDate, inSameDayAs: Date())
    }

    /// The persisted row for the viewed day, if one exists. nil for a day
    /// the user has never logged — browsing must NOT create empty rows, so
    /// reads go through `displayEntry` and writes through `ensureEntry()`.
    private var existingEntry: DailyEntry? {
        dailyRows.first { $0.date == selectedKey }
    }

    /// Read-only view of the viewed day: the real row, or a transient empty
    /// entry (never inserted) so cards render zeros/dashes for untouched days.
    private var displayEntry: DailyEntry {
        existingEntry ?? DailyEntry(date: selectedKey)
    }

    /// Fetch-or-create the row for the viewed day. Called only from edit
    /// closures (logging water/mood/etc.), so a row is materialized the
    /// moment the user actually writes to that day — today or backfilled.
    @discardableResult
    private func ensureEntry() -> DailyEntry {
        if let existing = existingEntry { return existing }
        let fresh = DailyEntry(date: selectedKey)
        modelContext.insert(fresh)
        try? modelContext.save()
        return fresh
    }

    private func step(_ days: Int) {
        let cal = Calendar.current
        guard let next = cal.date(byAdding: .day, value: days, to: selectedDate) else { return }
        // No future days — planning isn't part of this screen.
        if next > cal.startOfDay(for: Date()) { return }
        Haptics.tick()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            selectedDate = cal.startOfDay(for: next)
        }
    }

    private func jumpToToday() {
        Haptics.tap()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            selectedDate = Calendar.current.startOfDay(for: Date())
        }
    }

    private var settings: UserSettings {
        if let existing = settingsRows.first { return existing }
        return UserSettings.loadOrCreate(in: modelContext)
    }

    // MARK: - Derived

    private var recoveryScore: RecoveryResult? {
        // Baselines are learned from history — the trailing window is the
        // days strictly before the VIEWED day, most-recent first, 30 cap.
        let history = dailyRows
            .filter { $0.date < selectedKey }
            .sorted { $0.date > $1.date }
            .prefix(30)
        return RecoveryEngine.compute(
            today: displayEntry,
            history: Array(history),
            priorStrain: priorStrain?.value,
            sleepGoalHours: settings.sleepGoalHours
        )
    }

    /// Trailing window (≤21 days) up to and including the viewed day,
    /// chronological — feeds the recovery detail sheet's "why" trend charts.
    private var recoveryChartHistory: [DailyEntry] {
        Array(
            dailyRows
                .filter { $0.date <= selectedKey }
                .sorted { $0.date < $1.date }
                .suffix(21)
        )
    }

    private var strainScore: StrainCalculator.Score {
        strain(for: selectedDate)
    }

    /// Strain for the day before the viewed day, used to temper the viewed
    /// day's recovery. Optional purely to pass through cleanly.
    private var priorStrain: StrainCalculator.Score? {
        let cal = Calendar.current
        guard let prior = cal.date(byAdding: .day, value: -1, to: selectedDate) else { return nil }
        return strain(for: prior)
    }

    /// Strain for the calendar day starting at `dayStart`. Pulls that
    /// day's lift volume + volume-weighted session RPE from sessions, the
    /// 7-day rolling max-day volume as the mechanical reference, and that
    /// day's DailyEntry cardio signals (active energy, steps, distance).
    private func strain(for dayStart: Date) -> StrainCalculator.Score {
        let cal = Calendar.current
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let dayKey = ymd(dayStart)
        let daySessions = allSessions.filter { $0.startedAt >= dayStart && $0.startedAt < dayEnd }
        let dayVolume = daySessions.reduce(0.0) { $0 + $1.totalVolumeLb }
        let dayRPE = sessionRPE(for: daySessions)

        // 7-day rolling window ending at this day (inclusive).
        let weekStart = cal.date(byAdding: .day, value: -7, to: dayStart) ?? dayStart
        let weekSessions = allSessions.filter { $0.startedAt >= weekStart && $0.startedAt < dayEnd }
        let weekMaxDayVolume = Dictionary(grouping: weekSessions, by: \.date)
            .values
            .map { $0.reduce(0.0) { $0 + $1.totalVolumeLb } }
            .max() ?? 0

        let daily = dailyRows.first(where: { $0.date == dayKey })
        return StrainCalculator.compute(
            liftVolumeTodayLb: dayVolume,
            liftVolumeMax7dLb: weekMaxDayVolume,
            activeEnergyKcal: daily?.activeEnergyKcal ?? 0,
            sessionRPE: dayRPE,
            steps: daily?.steps,
            distanceMeters: daily?.distanceMeters
        )
    }

    /// Volume-weighted average set RPE across a day's sessions, recovered
    /// from each session's `detailsJSON` exercise/set blob. Each completed
    /// set is weighted by its training volume (weight × reps) so heavy
    /// top sets count more than light back-offs — the validated sRPE
    /// aggregation. Returns nil when no set carried an RPE.
    private func sessionRPE(for sessions: [LiftSessionEntry]) -> Double? {
        var weightedSum = 0.0
        var totalWeight = 0.0
        for session in sessions {
            for exercise in CSVExporter.decodeExercises(session.detailsJSON) {
                for set in exercise.sets where set.rpe != nil {
                    let vol = max(1.0, set.weight * Double(set.reps))
                    weightedSum += (set.rpe ?? 0) * vol
                    totalWeight += vol
                }
            }
        }
        guard totalWeight > 0 else { return nil }
        return weightedSum / totalWeight
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

    // MARK: - Day navigator

    private var dayNavigator: some View {
        HStack(spacing: 8) {
            Button { step(-1) } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(LifeOSColor.fg2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            Spacer()
            Button { jumpToToday() } label: {
                HStack(spacing: 6) {
                    if !isViewingToday {
                        Image(systemName: "arrow.uturn.left")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(LifeOSColor.accent)
                    }
                    VStack(spacing: 1) {
                        Text(isViewingToday ? "Today" : relativeDayLabel)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(LifeOSColor.fg)
                        Text(selectedDate.formatted(.dateTime.weekday(.abbreviated).month().day()))
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(isViewingToday)
            Spacer()
            Button { step(1) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(isViewingToday ? LifeOSColor.fg3.opacity(0.4) : LifeOSColor.fg2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .disabled(isViewingToday)
        }
        .padding(.horizontal, 4)
    }

    private var relativeDayLabel: String {
        let cal = Calendar.current
        if cal.isDateInYesterday(selectedDate) { return "Yesterday" }
        let days = cal.dateComponents([.day], from: selectedDate, to: cal.startOfDay(for: Date())).day ?? 0
        return "\(days) days ago"
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
        let e = displayEntry
        let steps = e.steps ?? 0
        let stepsGoal = settings.stepsGoal
        let sleepMin = Int((e.sleepHours ?? 0) * 60)
        let sleepGoalMin = Int(settings.sleepGoalHours * 60)
        let waterOz = Int(e.waterOz)
        let waterGoal = Int(settings.waterGoalOz)
        // The three rings map to the three metrics labeled beside them —
        // Steps (outer), Sleep (middle), Water (inner) — each as its real
        // progress-to-goal ratio. Previously hardcoded to 0.4/0.4/0.4,
        // which rendered identical placeholder arcs regardless of data.
        let stepsRatio = stepsGoal > 0 ? Double(steps) / Double(stepsGoal) : 0
        let sleepRatio = sleepGoalMin > 0 ? Double(sleepMin) / Double(sleepGoalMin) : 0
        let waterRatio = waterGoal > 0 ? Double(waterOz) / Double(waterGoal) : 0
        return Card {
            HStack(spacing: 18) {
                ActivityRings(
                    move: stepsRatio,
                    exercise: sleepRatio,
                    stand: waterRatio
                )
                .frame(width: 110, height: 110)
                VStack(alignment: .leading, spacing: 10) {
                    ringRow(name: "Steps", have: steps, goal: stepsGoal, unit: "steps", tint: LifeOSColor.Metric.steps)
                    ringRow(name: "Sleep", have: sleepMin, goal: sleepGoalMin, unit: "min", tint: LifeOSColor.Metric.sleep)
                    ringRow(name: "Water", have: waterOz, goal: waterGoal, unit: "oz", tint: LifeOSColor.Metric.water)
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
        // Resting HR / HRV / weight are lagging metrics — today's value
        // often doesn't exist yet (resting HR is computed post-sleep), so
        // fall back to the most recent reading and label it "as of …"
        // instead of showing "—". Steps stays today-only — it's a live
        // daily counter, and surfacing yesterday's total as today's would
        // be misleading.
        let rhr = mostRecentVital { $0.restingHr }
        let hrv = mostRecentVital { $0.hrvMs }
        let weight = mostRecentVital { $0.weightLb }
        let spo2 = mostRecentVital { $0.spo2Pct }
        let respRate = mostRecentVital { $0.respiratoryRate }
        return VStack(spacing: 10) {
            SectionLabel("Vitals")
            HStack(spacing: 10) {
                VitalTile(
                    icon: "heart.fill", label: "Resting HR",
                    value: rhr.map { "\(Int($0.value))" } ?? "—",
                    unit: "bpm",
                    tint: LifeOSColor.Metric.mood,
                    trend: [],
                    delta: vitalCaption(rhr, baseline: settings.rhrBaseline)
                )
                VitalTile(
                    icon: "waveform.path.ecg", label: "HRV",
                    value: hrv.map { "\(Int($0.value))" } ?? "—",
                    unit: "ms",
                    tint: LifeOSColor.Metric.sleep,
                    trend: [],
                    delta: vitalCaption(hrv, baseline: settings.hrvBaseline)
                )
            }
            HStack(spacing: 10) {
                VitalTile(
                    icon: "figure.walk", label: "Steps",
                    value: formatSteps(displayEntry.steps ?? 0),
                    tint: LifeOSColor.Metric.steps,
                    trend: [],
                    delta: stepsDelta
                )
                VitalTile(
                    icon: "scalemass.fill", label: "Weight",
                    value: weight.map {
                        WeightUnit.from(settings.weightUnit).formatted(fromLb: $0.value)
                            .replacingOccurrences(of: " \(settings.weightUnit)", with: "")
                    } ?? "—",
                    unit: settings.weightUnit,
                    tint: LifeOSColor.Metric.weight,
                    trend: [],
                    delta: weight.map { $0.isToday ? "—" : asOfCaption($0.date) } ?? "—"
                )
            }
            HStack(spacing: 10) {
                VitalTile(
                    icon: "flame.fill", label: "Calories",
                    value: (displayEntry.totalCaloriesKcal ?? displayEntry.activeEnergyKcal)
                        .map { "\(Int($0))" } ?? "—",
                    unit: "kcal",
                    tint: LifeOSColor.Metric.calories,
                    trend: [],
                    delta: caloriesDelta
                )
                VitalTile(
                    icon: "point.topleft.down.curvedto.point.bottomright.up", label: "Distance",
                    value: displayEntry.distanceMeters.map { String(format: "%.2f", $0 / 1609.34) } ?? "—",
                    unit: "mi",
                    tint: LifeOSColor.Metric.energy,
                    trend: [],
                    delta: "—"
                )
            }
            // Overnight recovery vitals — only surfaced when a compatible sensor
            // has actually synced them (most devices have no SpO2), so we don't
            // show a permanent dead "—/—" row.
            if spo2 != nil || respRate != nil {
                HStack(spacing: 10) {
                    VitalTile(
                        icon: "lungs.fill", label: "Blood O₂",
                        value: spo2.map { "\(Int($0.value.rounded()))" } ?? "—",
                        unit: "%",
                        tint: LifeOSColor.Metric.spo2,
                        trend: [],
                        delta: spo2.map { $0.isToday ? "—" : asOfCaption($0.date) } ?? "—"
                    )
                    VitalTile(
                        icon: "wind", label: "Resp rate",
                        value: respRate.map { String(format: "%.0f", $0.value) } ?? "—",
                        unit: "br/min",
                        tint: LifeOSColor.Metric.respiratory,
                        trend: [],
                        delta: respRate.map { $0.isToday ? "—" : asOfCaption($0.date) } ?? "—"
                    )
                }
            }
        }
    }

    /// Caption for the Calories tile. The tile headline is TOTAL burned
    /// (active + resting) so it matches the Nutrition tab's "burned" ring;
    /// the caption breaks out the active (movement) portion.
    private var caloriesDelta: String {
        // Only break out the active portion when the headline is actually the
        // TOTAL. When total is missing the headline already shows the active
        // value, so an "X active" caption would duplicate it under a
        // misleading label.
        guard displayEntry.totalCaloriesKcal != nil,
              let active = displayEntry.activeEnergyKcal else { return "—" }
        return "\(Int(active)) active"
    }

    /// A metric value plus where it came from, for the "as of …" fallback.
    private struct RecentVital { let value: Double; let date: String; let isToday: Bool }

    /// Most recent DailyEntry on or before the VIEWED day with a non-nil
    /// value for `pick`. "YYYY-MM-DD" strings sort lexicographically ==
    /// chronologically. `isToday` here means "is the viewed day".
    private func mostRecentVital(_ pick: (DailyEntry) -> Double?) -> RecentVital? {
        dailyRows
            .filter { $0.date <= selectedKey }
            .compactMap { row in
                pick(row).map { RecentVital(value: $0, date: row.date, isToday: row.date == selectedKey) }
            }
            .max { $0.date < $1.date }
    }

    /// Caption under a vital: the vs-baseline delta when the value is
    /// today's, otherwise an "as of …" staleness note.
    private func vitalCaption(_ recent: RecentVital?, baseline: Double?) -> String {
        guard let recent else { return "no data" }
        if !recent.isToday { return asOfCaption(recent.date) }
        guard let base = baseline, base > 0 else { return "no baseline" }
        let pct = Int(((recent.value - base) / base * 100).rounded())
        return "\(pct >= 0 ? "+" : "")\(pct)% vs 14d"
    }

    private func asOfCaption(_ dateStr: String) -> String {
        guard let d = Self.ymdFormatter.date(from: dateStr) else { return "earlier" }
        let cal = Calendar.current
        let ref = cal.startOfDay(for: selectedDate)
        let dd = cal.startOfDay(for: d)
        if dd == ref { return "—" }
        let days = cal.dateComponents([.day], from: dd, to: ref).day ?? 0
        if days == 1 { return "as of prior day" }
        return "as of \(max(days, 1))d earlier"
    }

    private static let ymdFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private var stepsDelta: String {
        let goal = settings.stepsGoal
        guard goal > 0, let s = displayEntry.steps else { return "—" }
        return "\(Int(Double(s) / Double(goal) * 100))% of goal"
    }

    private func formatSteps(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f.string(from: NSNumber(value: n)) ?? "0"
    }

    // MARK: - Calories

    private var caloriesCard: some View {
        let mealsToday = allMeals.filter { $0.date == selectedKey }
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
                caloriesGoal: Double(settings.caloriesGoal),
                activeBurnedKcal: displayEntry.activeEnergyKcal,
                totalBurnedKcal: displayEntry.totalCaloriesKcal,
                eatBackExercise: settings.eatBackExerciseCalories
            )
        }
    }

    // MARK: - Workouts summary

    private var workoutsSummary: some View {
        let todayWorkouts = allSessions.filter { $0.date == selectedKey }
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
        if let totalHours = displayEntry.sleepHours {
            // Whoop-style breakdown when stages came back from HealthKit;
            // otherwise just totals.
            let stages = makeStages(from: displayEntry)
            SleepCard(
                totalHours: totalHours,
                bedtime: bedtimeApprox(for: totalHours),
                wake: wakeApprox(),
                stages: stages,
                weekAverageHours: sleepAvg7d,
                onTap: { showSleepDetail = true }
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
        let todayKeyLocal = selectedKey
        let cal = Calendar.current
        let weekday = cal.component(.weekday, from: selectedDate)
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
        // Passive HealthKit pull only makes sense for the live day; past
        // days are already persisted and immutable from the sensor side.
        guard isViewingToday else { return }
        syncing = true
        await HealthSync.syncToday(in: modelContext)
        syncing = false
    }

    /// Pull-to-refresh path — bypasses the throttle. The user has
    /// explicitly asked for fresh data so respect that even within
    /// the 60s window.
    private func forceSync() async {
        guard isViewingToday else { return }
        syncing = true
        await HealthSync.syncToday(in: modelContext, force: true)
        syncing = false
    }
}
