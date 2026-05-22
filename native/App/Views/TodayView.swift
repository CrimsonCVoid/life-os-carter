import SwiftUI
import SwiftData

/// Comprehensive Today screen — visual end-state. Placeholder data
/// stands in until the HealthKit + Fitbit + meal log pipelines are
/// wired up. Replace the `Sample` static values with real `@Query`
/// results or HealthKit reads as those land.
struct TodayView: View {
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    greeting
                    peakStateHero
                    activityRingsCard
                    vitalsGrid
                    caloriesCard
                    workoutsSummary
                    SleepCard(
                        totalHours: 7.5,
                        bedtime: Sample.bedtime,
                        wake: Sample.wake,
                        stages: Sample.sleepStages,
                        weekAverageHours: 7.3
                    )
                    HydrationCard(
                        currentOz: 48,
                        goalOz: 96,
                        onLog: { _ in /* TODO: write to HealthKit + SwiftData */ }
                    )
                    habitsRoll
                    MoodEnergyCard(
                        mood: 7,
                        energy: 6,
                        moodTrend: Sample.moodTrend,
                        energyTrend: Sample.energyTrend,
                        onLogMood: { _ in },
                        onLogEnergy: { _ in }
                    )
                    InsightsCard(insights: Sample.insights)
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
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
        }
    }

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

    // MARK: - Peak State hero

    private var peakStateHero: some View {
        Card {
            HStack(spacing: 18) {
                ScoreRing(
                    progress: 0.84,
                    value: "84",
                    label: "Peak State",
                    tint: LifeOSColor.Metric.peak,
                    size: 140
                )
                VStack(alignment: .leading, spacing: 10) {
                    pillar(label: "Recovery",  value: "72%",  tint: LifeOSColor.Metric.sleep)
                    pillar(label: "Strain",    value: "12.4", tint: LifeOSColor.Metric.strain)
                    pillar(label: "Sleep",     value: "7:30", tint: LifeOSColor.Metric.sleep)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func pillar(label: String, value: String, tint: Color) -> some View {
        HStack {
            Circle().fill(tint).frame(width: 6, height: 6)
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(LifeOSColor.fg3)
            Spacer()
            Text(value)
                .font(.system(size: 17, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(tint)
        }
    }

    // MARK: - Activity rings

    private var activityRingsCard: some View {
        Card {
            HStack(spacing: 18) {
                ActivityRings(move: 0.78, exercise: 0.62, stand: 0.42)
                    .frame(width: 110, height: 110)
                VStack(alignment: .leading, spacing: 10) {
                    ringRow(name: "Move",     have: 467,  goal: 600, unit: "kcal", tint: LifeOSColor.danger)
                    ringRow(name: "Exercise", have: 18,   goal: 30,  unit: "min",  tint: LifeOSColor.Metric.steps)
                    ringRow(name: "Stand",    have: 5,    goal: 12,  unit: "hr",   tint: LifeOSColor.Metric.water)
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

    // MARK: - Vitals 2x2 grid

    private var vitalsGrid: some View {
        VStack(spacing: 10) {
            SectionLabel("Vitals")
            HStack(spacing: 10) {
                VitalTile(
                    icon: "heart.fill", label: "Resting HR", value: "58", unit: "bpm",
                    tint: LifeOSColor.Metric.mood,
                    trend: Sample.hrTrend,
                    delta: "−2 vs 7d"
                )
                VitalTile(
                    icon: "waveform.path.ecg", label: "HRV", value: "62", unit: "ms",
                    tint: LifeOSColor.Metric.sleep,
                    trend: Sample.hrvTrend,
                    delta: "+4 vs 7d"
                )
            }
            HStack(spacing: 10) {
                VitalTile(
                    icon: "figure.walk", label: "Steps", value: "8,431",
                    tint: LifeOSColor.Metric.steps,
                    trend: Sample.stepsTrend,
                    delta: "70% of goal"
                )
                VitalTile(
                    icon: "lungs.fill", label: "Resp Rate", value: "14.2", unit: "br/min",
                    tint: LifeOSColor.Metric.water,
                    trend: Sample.respTrend,
                    delta: "stable"
                )
            }
        }
    }

    // MARK: - Calories card

    private var caloriesCard: some View {
        VStack(spacing: 10) {
            SectionLabel("Calories") {
                NavigationLink("Open") {
                    NutritionView()
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LifeOSColor.accent)
            }
            MacroRingsCard(
                proteinG: 142, proteinGoalG: 180,
                carbsG: 188, carbsGoalG: 240,
                fatG: 62, fatGoalG: 75,
                caloriesEaten: 1840,
                caloriesBurned: 467,
                caloriesGoal: 2200
            )
        }
    }

    // MARK: - Workouts summary

    private var workoutsSummary: some View {
        VStack(spacing: 10) {
            SectionLabel("Workouts")
            Card {
                HStack(spacing: 14) {
                    ZStack {
                        Circle().fill(LifeOSColor.Metric.strain.opacity(0.16))
                        Image(systemName: "dumbbell.fill")
                            .foregroundStyle(LifeOSColor.Metric.strain)
                            .font(.system(size: 18))
                    }
                    .frame(width: 44, height: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Push day")
                            .font(.system(size: 15, weight: .semibold))
                        Text("48 min · 12,450 lb volume · 24 sets")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("STRAIN")
                            .font(.system(size: 8, weight: .semibold)).tracking(1.2)
                            .foregroundStyle(LifeOSColor.fg3)
                        Text("12.4")
                            .font(.system(size: 18, weight: .bold).monospacedDigit())
                            .foregroundStyle(LifeOSColor.Metric.strain)
                    }
                }
            }
        }
    }

    // MARK: - Habits roll-up

    private var habitsRoll: some View {
        VStack(spacing: 10) {
            SectionLabel("Habits") {
                NavigationLink("Open") {
                    HabitsView()
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LifeOSColor.accent)
            }
            Card {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("3").font(.system(size: 28, weight: .bold).monospacedDigit())
                            Text("/ 5").font(.system(size: 14)).foregroundStyle(LifeOSColor.fg3)
                        }
                        Text("habits today")
                            .font(.system(size: 11))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(Sample.habitDots.indices, id: \.self) { i in
                            Circle()
                                .fill(Sample.habitDots[i] ? LifeOSColor.success : LifeOSColor.elevated)
                                .frame(width: 14, height: 14)
                                .overlay(
                                    Circle().stroke(LifeOSColor.stroke, lineWidth: 0.5)
                                )
                        }
                    }
                    Divider().overlay(LifeOSColor.stroke).frame(height: 30)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("12🔥")
                            .font(.system(size: 16, weight: .bold))
                        Text("STREAK")
                            .font(.system(size: 8, weight: .semibold)).tracking(1.2)
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
            }
        }
    }
}

/// Placeholder sample data — single home for the values used while
/// the real data pipeline is being wired. Delete each entry as it gets
/// hooked up to a real source.
private enum Sample {
    static let hrTrend: [Double]   = [62, 60, 61, 59, 58, 60, 58]
    static let hrvTrend: [Double]  = [54, 56, 58, 62, 60, 59, 62]
    static let stepsTrend: [Double] = [7200, 8100, 6900, 9300, 8400, 8800, 8431]
    static let respTrend: [Double] = [14, 14.2, 14.1, 14.3, 14.2, 14, 14.2]
    static let moodTrend: [Double] = [6, 7, 6, 8, 7, 7, 7]
    static let energyTrend: [Double] = [5, 6, 6, 7, 6, 7, 6]
    static let habitDots: [Bool] = [true, true, false, true, false]

    static var bedtime: Date {
        Calendar.current.date(bySettingHour: 23, minute: 12, second: 0, of: Date())!.addingTimeInterval(-86_400)
    }
    static var wake: Date {
        Calendar.current.date(bySettingHour: 6, minute: 42, second: 0, of: Date())!
    }
    static let sleepStages: [SleepCard.Stage] = [
        .init(kind: .awake, minutes: 18),
        .init(kind: .rem,   minutes: 92),
        .init(kind: .core,  minutes: 252),
        .init(kind: .deep,  minutes: 88),
    ]
    static let insights: [InsightsCard.Insight] = [
        .init(
            icon: "moon.fill",
            tint: LifeOSColor.Metric.sleep,
            title: "Sleep edged ahead of your 7-day average",
            body: "7h 30m last night vs 7h 18m typical — recovery should hold."
        ),
        .init(
            icon: "flame.fill",
            tint: LifeOSColor.danger,
            title: "Strain pacing fast for the week",
            body: "12.4 today on top of 49 across the prior 6 days. Consider a recovery session."
        ),
        .init(
            icon: "drop.fill",
            tint: LifeOSColor.Metric.water,
            title: "Hydration trending under target",
            body: "Averaged 71 oz vs 96 oz goal over the last 5 days."
        ),
    ]
}
