import Foundation
import SwiftData

/// SwiftData models — local-first persistence. Each entity maps to a
/// slice of the old Zustand store. Anything user-generated lives here;
/// derived/computed data (readiness scores, strain rollups) is calc'd
/// in-memory off these.

/// One row per day. Combines what the web split across `health`,
/// `energy`, and the daily metrics — single row is easier to reason
/// about and matches how iOS apps typically slice data.
@Model
final class DailyEntry {
    /// "YYYY-MM-DD" — uses the device's local timezone, same as web.
    @Attribute(.unique) var date: String
    var sleepHours: Double?
    var moodScore: Int?           // 1–10
    var energyScore: Int?         // 1–10
    var waterOz: Double           // running tally for the day
    var weightLb: Double?
    var steps: Int?
    var hrvMs: Double?
    var restingHr: Double?
    var notes: String?
    var needsSync: Bool = true

    init(
        date: String,
        sleepHours: Double? = nil,
        moodScore: Int? = nil,
        energyScore: Int? = nil,
        waterOz: Double = 0,
        weightLb: Double? = nil,
        steps: Int? = nil,
        hrvMs: Double? = nil,
        restingHr: Double? = nil,
        notes: String? = nil
    ) {
        self.date = date
        self.sleepHours = sleepHours
        self.moodScore = moodScore
        self.energyScore = energyScore
        self.waterOz = waterOz
        self.weightLb = weightLb
        self.steps = steps
        self.hrvMs = hrvMs
        self.restingHr = restingHr
        self.notes = notes
    }
}

@Model
final class HabitEntry {
    @Attribute(.unique) var id: UUID
    var name: String
    /// SF Symbol name (e.g. "book.fill"). Migrated from the web app's
    /// custom icon enum to SF Symbols since we're now native.
    var icon: String
    /// Array of "YYYY-MM-DD" strings the habit was checked off on.
    var completedDates: [String]
    var createdAt: Date
    var order: Int
    /// True when this row has local changes the SyncService hasn't yet
    /// POSTed to Neon. Flipped false on a successful upload.
    var needsSync: Bool = true
    /// Server-assigned UUID once the row has round-tripped at least
    /// once. nil before first successful sync.
    var serverID: String?

    init(name: String, icon: String, order: Int = 0) {
        self.id = UUID()
        self.name = name
        self.icon = icon
        self.completedDates = []
        self.createdAt = Date()
        self.order = order
    }
}

@Model
final class JournalEntry {
    @Attribute(.unique) var id: UUID
    var date: String      // "YYYY-MM-DD"
    var createdAt: Date
    var body: String
    /// Optional 1–10 mood score the user attached when journaling.
    var moodScore: Int?
    /// HealthKit mindful-session sample identifier, set when the entry
    /// is written back to Health as a mindful minute.
    var mindfulSampleID: String?
    var needsSync: Bool = true
    var serverID: String?

    init(date: String, body: String, moodScore: Int? = nil) {
        self.id = UUID()
        self.date = date
        self.createdAt = Date()
        self.body = body
        self.moodScore = moodScore
    }
}

@Model
final class MealLog {
    @Attribute(.unique) var id: UUID
    var date: String
    var loggedAt: Date
    var name: String
    var calories: Double
    var proteinG: Double
    var carbsG: Double
    var fatG: Double
    /// Source — "manual", "barcode", "photo", "voice". Useful for
    /// nutrition coach summaries.
    var source: String
    var needsSync: Bool = true
    var serverID: String?

    init(
        date: String,
        name: String,
        calories: Double,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0,
        source: String = "manual"
    ) {
        self.id = UUID()
        self.date = date
        self.loggedAt = Date()
        self.name = name
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.source = source
    }
}

/// Completed lift session. Active-in-progress workouts live in a
/// separate @Observable view model (see `ActiveWorkoutStore`) rather
/// than SwiftData, since they mutate every second.
@Model
final class LiftSessionEntry {
    @Attribute(.unique) var id: UUID
    var date: String
    var workoutType: String
    var startedAt: Date
    var endedAt: Date
    var totalVolumeLb: Double
    var setCount: Int
    /// Lightweight JSON blob of exercises + sets — full schema isn't
    /// worth modeling as separate tables for an app at this scale.
    var detailsJSON: String
    var needsSync: Bool = true
    var serverID: String?

    init(
        date: String,
        workoutType: String,
        startedAt: Date,
        endedAt: Date,
        totalVolumeLb: Double,
        setCount: Int,
        detailsJSON: String
    ) {
        self.id = UUID()
        self.date = date
        self.workoutType = workoutType
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.totalVolumeLb = totalVolumeLb
        self.setCount = setCount
        self.detailsJSON = detailsJSON
    }
}
