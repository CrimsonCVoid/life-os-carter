import Foundation
import SwiftData

/// Builds an OverseerContext-shaped payload for /api/overseer from the
/// local SwiftData stores. Field names mirror the web app's
/// `getOverseerContext()` selector exactly — the server's
/// `buildContextBlock` dereferences them by those names, so anything
/// off-shape silently lands in the "empty" branch and Gemini sees no
/// data.
///
/// Web-only fields the iOS app doesn't have (morning/evening routines,
/// schedule, weekly reviews, recurring goals, patterns) are sent as
/// empty/null so the prompt builder skips them.
enum CoachContextBuilder {

    // MARK: - Public entry

    static func build(from ctx: ModelContext) -> CoachContextPayload {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let todayKey = ymd(today)
        let last7 = lastNDays(7, anchor: today)
        let last14 = lastNDays(14, anchor: today)
        let last30 = lastNDays(30, anchor: today)

        let dailies = (try? ctx.fetch(FetchDescriptor<DailyEntry>())) ?? []
        let dailyByDate = Dictionary(grouping: dailies, by: \.date)
            .compactMapValues { $0.first }

        let habitEntries = (try? ctx.fetch(FetchDescriptor<HabitEntry>(
            sortBy: [SortDescriptor(\.order)]
        ))) ?? []
        let habitDateSets: [(name: String, dates: Set<String>)] = habitEntries.map {
            ($0.name, Set($0.completedDates))
        }

        let meals = (try? ctx.fetch(FetchDescriptor<MealLog>(
            sortBy: [SortDescriptor(\.loggedAt, order: .reverse)]
        ))) ?? []
        let mealsByDate = Dictionary(grouping: meals, by: \.date)

        let workouts = (try? ctx.fetch(FetchDescriptor<LiftSessionEntry>(
            sortBy: [SortDescriptor(\.startedAt, order: .reverse)]
        ))) ?? []
        let workoutsByDate = Dictionary(grouping: workouts, by: \.date)

        let journal = (try? ctx.fetch(FetchDescriptor<JournalEntry>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        ))) ?? []

        // health for today
        let healthToday = dailyByDate[todayKey].map { HealthSlice(from: $0) }

        // habits — shape matches selector exactly
        let habits = habitEntries.map { h -> Habit in
            Habit(
                name: h.name,
                doneToday: h.completedDates.contains(todayKey),
                streak: streakFor(dates: Set(h.completedDates), today: today, cal: cal)
            )
        }

        // workouts today — derive durationMin from start/end and a coarse
        // intensity bucket from set count (server prompt just renders the
        // type/duration line, so even rough numbers help the model).
        let workoutsTodayPayload = (workoutsByDate[todayKey] ?? []).map { w -> WorkoutToday in
            WorkoutToday(
                type: w.workoutType,
                durationMin: Int(w.endedAt.timeIntervalSince(w.startedAt) / 60),
                intensity: intensityBucket(setCount: w.setCount, volume: w.totalVolumeLb)
            )
        }

        // nutritionToday — sum the day's meals; no per-user targets on iOS yet
        let nutritionToday: NutritionToday? = {
            let dayMeals = mealsByDate[todayKey] ?? []
            guard !dayMeals.isEmpty || !meals.isEmpty else { return nil }
            let totals = dayMeals.reduce(MacroTotals.zero) { acc, m in
                MacroTotals(
                    calories: acc.calories + Int(m.calories),
                    protein: acc.protein + Int(m.proteinG),
                    carbs: acc.carbs + Int(m.carbsG),
                    fat: acc.fat + Int(m.fatG)
                )
            }
            // 7-day protein average (only count days the user actually logged)
            let perDay = last7.map { d in
                (mealsByDate[d] ?? []).reduce(0.0) { $0 + $1.proteinG }
            }
            let logged = perDay.filter { $0 > 0 }
            let proteinAvg7: Int? = logged.isEmpty
                ? nil
                : Int(logged.reduce(0, +) / Double(logged.count))
            return NutritionToday(
                totals: totals,
                targets: NutritionTargets(calories: nil, protein: nil),
                proteinAvg7: proteinAvg7
            )
        }()

        // last7DaysSummary — one row per day with the things the prompt
        // builder actually consumes
        let summary7 = last7.map { d -> Last7DaySummary in
            let daily = dailyByDate[d]
            let habitsDone = habitDateSets.filter { $0.dates.contains(d) }.count
            return Last7DaySummary(
                date: d,
                goalsDone: 0,
                goalsTotal: 0,
                sleepHours: daily?.sleepHours,
                mood: daily?.moodScore,
                energy: daily?.energyScore,
                habitsDone: habitsDone,
                habitsTotal: habitEntries.count,
                morningDone: 0,
                morningTotal: 0
            )
        }

        // recentJournal — three most recent entries, body snippet capped
        let recentJournal = journal.prefix(3).map { j in
            RecentJournal(date: j.date, snippet: String(j.body.prefix(200)), mood: j.moodScore)
        }

        // bodyLatest — the most recent DailyEntry with a non-nil weight
        let bodyLatest: BodyLatest? = {
            let sorted = dailies.sorted { $0.date > $1.date }
            guard let row = sorted.first(where: { $0.weightLb != nil }) else { return nil }
            return BodyLatest(
                date: row.date,
                weight: row.weightLb,
                bodyFatPct: nil,
                chest: nil,
                waist: nil
            )
        }()

        // Extra rollups the prompt's "INSIGHTS" tail will pick up via
        // simple field lookups. We don't have web's full feature set, so
        // these are conservative.
        let workouts30 = workouts.filter { (w) -> Bool in
            guard let d = parseYMD(w.date) else { return false }
            return d >= cal.date(byAdding: .day, value: -30, to: today)!
        }

        return CoachContextPayload(
            today: todayKey,
            dayType: "",
            goalsToday: [],
            habits: habits,
            eveningRoutine: nil,
            morningRoutine: nil,
            workoutsToday: workoutsTodayPayload,
            health: healthToday,
            plansTomorrow: [],
            winsToday: [],
            strugglesToday: [],
            last7DaysSummary: summary7,
            recentJournal: Array(recentJournal),
            recentVoiceSummaries: [],
            scheduleToday: [],
            energyToday: nil,
            nutritionToday: nutritionToday,
            bodyLatest: bodyLatest,
            currentPattern: nil,
            recentWeeklyReviews: [],
            recurringGoals: [],
            // Extras the web selector doesn't expose but the model finds
            // useful — workout volume rollups and a HRV/RHR snapshot.
            // The server ignores unknown fields, so these are additive.
            metricsSnapshot: MetricsSnapshot(
                workouts7d: workouts.filter { last7.contains($0.date) }.count,
                workouts30d: workouts30.count,
                totalVolume7dLb: Int(workouts.filter { last7.contains($0.date) }
                    .reduce(0.0) { $0 + $1.totalVolumeLb }),
                avgSleepHours7d: avg(last7.compactMap { dailyByDate[$0]?.sleepHours }),
                avgMood7d: avg(last7.compactMap { dailyByDate[$0]?.moodScore.map(Double.init) }),
                avgEnergy7d: avg(last7.compactMap { dailyByDate[$0]?.energyScore.map(Double.init) }),
                avgHRV14d: avg(last14.compactMap { dailyByDate[$0]?.hrvMs }),
                avgRHR14d: avg(last14.compactMap { dailyByDate[$0]?.restingHr }),
                journalEntries30d: journal.filter { last30.contains($0.date) }.count
            )
        )
    }

    // MARK: - Helpers

    private static func ymd(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: d)
    }

    private static func parseYMD(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: s)
    }

    private static func lastNDays(_ n: Int, anchor: Date) -> [String] {
        let cal = Calendar.current
        return (0..<n).compactMap {
            cal.date(byAdding: .day, value: -$0, to: anchor).map(ymd)
        }
    }

    private static func streakFor(dates: Set<String>, today: Date, cal: Calendar) -> Int {
        var count = 0
        var cursor = today
        while dates.contains(ymd(cursor)) {
            count += 1
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return count
    }

    private static func avg(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        return (values.reduce(0, +) / Double(values.count) * 10).rounded() / 10
    }

    private static func intensityBucket(setCount: Int, volume: Double) -> String {
        switch setCount {
        case ..<8: return "light"
        case 8..<16: return "moderate"
        default: return volume > 8000 ? "heavy" : "intense"
        }
    }
}

// MARK: - Payload shape

/// Matches `OverseerContext` on the server. Sent verbatim to
/// `/api/overseer` — keep field names in sync with the web selector.
struct CoachContextPayload: Encodable {
    let today: String
    let dayType: String
    let goalsToday: [String]
    let habits: [Habit]
    let eveningRoutine: RoutineSlice?
    let morningRoutine: RoutineSlice?
    let workoutsToday: [WorkoutToday]
    let health: HealthSlice?
    let plansTomorrow: [String]
    let winsToday: [String]
    let strugglesToday: [String]
    let last7DaysSummary: [Last7DaySummary]
    let recentJournal: [RecentJournal]
    let recentVoiceSummaries: [String]
    let scheduleToday: [String]
    let energyToday: [String: Int?]?
    let nutritionToday: NutritionToday?
    let bodyLatest: BodyLatest?
    let currentPattern: String?
    let recentWeeklyReviews: [String]
    let recurringGoals: [String]
    let metricsSnapshot: MetricsSnapshot
}

struct Habit: Encodable {
    let name: String
    let doneToday: Bool
    let streak: Int
}

struct RoutineSlice: Encodable {
    let total: Int
    let doneToday: Int
}

struct WorkoutToday: Encodable {
    let type: String
    let durationMin: Int
    let intensity: String
}

struct HealthSlice: Encodable {
    let sleepHours: Double?
    let mood: Int?
    let energy: Int?
    let waterOz: Double
    let weight: Double?
    let steps: Int?
    let hrvMs: Double?
    let restingHr: Double?

    init(from d: DailyEntry) {
        sleepHours = d.sleepHours
        mood = d.moodScore
        energy = d.energyScore
        waterOz = d.waterOz
        weight = d.weightLb
        steps = d.steps
        hrvMs = d.hrvMs
        restingHr = d.restingHr
    }
}

struct Last7DaySummary: Encodable {
    let date: String
    let goalsDone: Int
    let goalsTotal: Int
    let sleepHours: Double?
    let mood: Int?
    let energy: Int?
    let habitsDone: Int
    let habitsTotal: Int
    let morningDone: Int
    let morningTotal: Int
}

struct RecentJournal: Encodable {
    let date: String
    let snippet: String
    let mood: Int?
}

struct NutritionToday: Encodable {
    let totals: MacroTotals
    let targets: NutritionTargets
    let proteinAvg7: Int?
}

struct MacroTotals: Encodable {
    let calories: Int
    let protein: Int
    let carbs: Int
    let fat: Int
    static let zero = MacroTotals(calories: 0, protein: 0, carbs: 0, fat: 0)
}

struct NutritionTargets: Encodable {
    let calories: Int?
    let protein: Int?
}

struct BodyLatest: Encodable {
    let date: String
    let weight: Double?
    let bodyFatPct: Double?
    let chest: Double?
    let waist: Double?
}

/// Rollups the model uses for trend questions ("how's my volume
/// trending?"). Server ignores unknown fields so this is additive on
/// top of the OverseerContext-matched shape above.
struct MetricsSnapshot: Encodable {
    let workouts7d: Int
    let workouts30d: Int
    let totalVolume7dLb: Int
    let avgSleepHours7d: Double?
    let avgMood7d: Double?
    let avgEnergy7d: Double?
    let avgHRV14d: Double?
    let avgRHR14d: Double?
    let journalEntries30d: Int
}
