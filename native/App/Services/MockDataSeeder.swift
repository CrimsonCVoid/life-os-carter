import Foundation
import SwiftData

/// Throwaway test-data populator. Generates ~30 days of realistic
/// meals / workouts / habits / journal / day-entries / PRs into the
/// local SwiftData store so the Analysis, Gym, Nutrition, and Habits
/// tabs have something real to render against. Triggered from the
/// Settings → "Populate test data" button.
///
/// All rows are marked needsSync=true so the SyncService drains them
/// to Neon on the next foreground — useful for testing the full
/// roundtrip. To wipe afterwards: Settings → "Wipe test data" (also
/// added in this commit).
@MainActor
enum MockDataSeeder {
    static func seed(_ ctx: ModelContext) {
        let now = Date()
        let cal = Calendar.current
        let dateFmt: DateFormatter = {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f
        }()

        // 5 habits with varied completion histories.
        let habitSeeds: [(String, String)] = [
            ("Read 20 minutes", "book.fill"),
            ("Meditate", "brain"),
            ("No phone after 10pm", "moon.fill"),
            ("Cold shower", "snowflake"),
            ("Stretch", "figure.flexibility"),
        ]
        for (i, seed) in habitSeeds.enumerated() {
            let h = HabitEntry(name: seed.0, icon: seed.1, order: i)
            // Completed on a rolling fraction of the last 30 days.
            let hitRate = [0.85, 0.55, 0.7, 0.3, 0.6][i % 5]
            for day in 0..<30 {
                if Double.random(in: 0...1) < hitRate {
                    if let d = cal.date(byAdding: .day, value: -day, to: now) {
                        h.completedDates.append(dateFmt.string(from: d))
                    }
                }
            }
            ctx.insert(h)
        }

        // 30 days of day entries (mood/energy/sleep/water/weight/steps/HRV/RHR).
        for day in 0..<30 {
            guard let d = cal.date(byAdding: .day, value: -day, to: now) else { continue }
            let entry = DailyEntry(
                date: dateFmt.string(from: d),
                sleepHours: Double.random(in: 5.5...8.5),
                moodScore: Int.random(in: 5...9),
                energyScore: Int.random(in: 4...9),
                waterOz: Double.random(in: 40...100),
                weightLb: 175 + Double.random(in: -3...3),
                steps: Int.random(in: 5000...14000),
                hrvMs: Double.random(in: 45...85),
                restingHr: Double.random(in: 52...62),
                notes: nil
            )
            ctx.insert(entry)
        }

        // 90 meals over 30 days (3 per day, varied).
        let mealTemplates: [(String, Double, Double, Double, Double)] = [
            ("Greek yogurt + berries",        220, 22, 24, 4),
            ("Chicken + rice bowl",           640, 50, 70, 14),
            ("Salmon + sweet potato",         580, 42, 48, 22),
            ("Protein shake",                 280, 35, 18, 6),
            ("Oatmeal + peanut butter",       420, 14, 56, 18),
            ("Eggs + toast",                  450, 26, 36, 22),
            ("Steak + broccoli",              620, 55, 12, 38),
            ("Turkey sandwich",               520, 38, 48, 16),
            ("Banana + almond butter",        290, 6, 32, 16),
            ("Pasta + marinara",              560, 18, 90, 12),
        ]
        for day in 0..<30 {
            guard let d = cal.date(byAdding: .day, value: -day, to: now) else { continue }
            let dateStr = dateFmt.string(from: d)
            let mealsToday = (2...4).randomElement()!
            for _ in 0..<mealsToday {
                let t = mealTemplates.randomElement()!
                let meal = MealLog(
                    date: dateStr,
                    name: t.0,
                    calories: t.1 * Double.random(in: 0.85...1.15),
                    proteinG: t.2 * Double.random(in: 0.85...1.15),
                    carbsG: t.3 * Double.random(in: 0.85...1.15),
                    fatG: t.4 * Double.random(in: 0.85...1.15),
                    source: ["manual", "photo", "voice", "barcode"].randomElement()!
                )
                // Spread logged_at across the day for realism.
                meal.loggedAt = cal.date(byAdding: .hour, value: Int.random(in: 7...21), to: d) ?? d
                ctx.insert(meal)
            }
        }

        // 12 lift sessions over 30 days (PPL split).
        let sessionTemplates: [(String, [(String, [(Double, Int)])])] = [
            ("Push Day", [
                ("Bench Press",        [(185, 8), (185, 8), (185, 7), (195, 5)]),
                ("Overhead Press",     [(115, 8), (115, 8), (115, 7)]),
                ("Incline DB Press",   [(70, 10), (70, 10), (75, 8)]),
                ("Tricep Pushdown",    [(50, 12), (50, 12), (55, 10)]),
                ("Lateral Raise",      [(20, 15), (20, 14), (25, 10)]),
            ]),
            ("Pull Day", [
                ("Deadlift",           [(315, 5), (335, 3), (355, 1)]),
                ("Pull-ups",           [(0, 10), (0, 9), (0, 8)]),
                ("Barbell Row",        [(155, 8), (165, 8), (175, 6)]),
                ("Face Pull",          [(40, 15), (40, 15), (45, 12)]),
                ("Dumbbell Curl",      [(35, 10), (35, 10), (40, 8)]),
            ]),
            ("Leg Day", [
                ("Back Squat",         [(225, 8), (235, 6), (245, 5)]),
                ("Romanian Deadlift",  [(225, 8), (235, 8), (245, 6)]),
                ("Leg Press",          [(360, 10), (380, 10), (400, 8)]),
                ("Leg Curl",           [(80, 12), (90, 10), (100, 8)]),
                ("Calf Raise",         [(150, 15), (160, 15), (170, 12)]),
            ]),
        ]
        for i in 0..<12 {
            let dayOffset = i * 2 + Int.random(in: 0...1)
            guard let d = cal.date(byAdding: .day, value: -dayOffset, to: now) else { continue }
            let tpl = sessionTemplates[i % 3]
            var exercises: [WorkoutExercise] = []
            var totalVolume = 0.0
            var totalSets = 0
            for (exName, setList) in tpl.1 {
                var sets: [WorkoutSet] = []
                for (w, r) in setList {
                    var s = WorkoutSet(weight: w, reps: r, completed: true)
                    s.rpe = [7.0, 7.5, 8.0, 8.5, 9.0].randomElement()
                    sets.append(s)
                    totalVolume += w * Double(r)
                    totalSets += 1
                }
                exercises.append(WorkoutExercise(name: exName, sets: sets))
            }
            let json = (try? String(data: JSONEncoder().encode(exercises), encoding: .utf8)) ?? "[]"
            let startedAt = cal.date(byAdding: .hour, value: 17, to: d) ?? d
            let endedAt = cal.date(byAdding: .minute, value: 55, to: startedAt) ?? startedAt
            let entry = LiftSessionEntry(
                date: dateFmt.string(from: d),
                workoutType: tpl.0,
                startedAt: startedAt,
                endedAt: endedAt,
                totalVolumeLb: totalVolume,
                setCount: totalSets,
                detailsJSON: json
            )
            ctx.insert(entry)
            PersonalRecordsService.ingest(
                session: entry,
                exercises: exercises,
                modelContext: ctx
            )
        }

        // A handful of journal entries scattered across the month.
        let journalSnippets = [
            "Solid week. Energy back to baseline after the trip. Sleep is the lever.",
            "Felt flat all day. Bench felt twice as heavy. Need more carbs pre-lift.",
            "Two PRs and a long walk with M. Logging this so I remember the wins.",
            "Anxious about the launch. Used the breathing thing — actually helped.",
            "Cold shower again. Hard to start, easy once you're in. Pattern is showing.",
        ]
        for (i, body) in journalSnippets.enumerated() {
            let dayOffset = i * 5 + Int.random(in: 0...2)
            guard let d = cal.date(byAdding: .day, value: -dayOffset, to: now) else { continue }
            let entry = JournalEntry(
                date: dateFmt.string(from: d),
                body: body,
                moodScore: Int.random(in: 5...9)
            )
            entry.createdAt = d
            ctx.insert(entry)
        }

        try? ctx.save()
        Haptics.success()
    }

    /// Nuke everything the seeder might have created. Used by the
    /// Settings → "Wipe test data" button when the user is done
    /// testing.
    static func wipe(_ ctx: ModelContext) {
        try? ctx.delete(model: DailyEntry.self)
        try? ctx.delete(model: HabitEntry.self)
        try? ctx.delete(model: JournalEntry.self)
        try? ctx.delete(model: MealLog.self)
        try? ctx.delete(model: LiftSessionEntry.self)
        try? ctx.delete(model: PersonalRecord.self)
        try? ctx.save()
        Haptics.warning()
    }
}
