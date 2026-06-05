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

    /// Behavioral journal prompts — quick yes/no flags the user toggles
    /// on Today. Feed the correlation engine: "your sleep is 28% better
    /// on no-alcohol days." All optional/false by default so this is a
    /// lightweight migration on existing rows.
    var alcoholYesterday: Bool = false
    var caffeineAfter2pm: Bool = false
    var lateEating: Bool = false
    var screenBeforeBed: Bool = false
    /// 1–5 scale. nil = unanswered, not "no stress."
    var stressLevel: Int?

    /// Per-stage sleep minutes pulled from HealthKit's sleepAnalysis
    /// samples. nil = no sample data (e.g. user without an Apple Watch
    /// or before HealthKit auth was granted). Sum can differ from
    /// `sleepHours` by a few minutes due to awake-time and HealthKit's
    /// reconciliation; we still display both because the breakdown is
    /// what makes Whoop's sleep view valuable.
    var sleepREMMin: Int?
    var sleepDeepMin: Int?
    var sleepLightMin: Int?
    var sleepAwakeMin: Int?

    /// Activity metrics from the active health source (Apple Health /
    /// Google Health). nil = no data synced for the day. Additive
    /// optional fields => lightweight SwiftData migration on existing rows.
    var activeEnergyKcal: Double?
    var totalCaloriesKcal: Double?
    var distanceMeters: Double?
    var floors: Int?
    var vo2Max: Double?
    /// Body composition from HealthKit (.bodyFatPercentage as 0…1 fraction,
    /// .leanBodyMass in lb). nil = not synced. Additive optionals →
    /// lightweight migration on existing rows.
    var bodyFatPct: Double?
    var leanMassLb: Double?
    /// Overnight recovery vitals from HealthKit. spo2Pct is a 0…100 percent
    /// (blood-oxygen saturation); respiratoryRate is breaths/min. nil = not
    /// synced. Additive optionals → lightweight migration.
    var spo2Pct: Double?
    var respiratoryRate: Double?

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
    /// Always the source-of-truth for streak/heatmap rendering; for
    /// count-based habits it's auto-populated by `setCount` once the
    /// day's count crosses `dailyTarget`.
    var completedDates: [String]
    var createdAt: Date
    var order: Int

    /// HabitColor raw value — "accent" | "emerald" | "rose" | "amber" |
    /// "sky" | "indigo" | "cyan" | "lime". Resolved to a real Color at
    /// render time via HabitColor.color so theme changes propagate.
    var colorToken: String = "accent"
    /// HabitCadence serialized form: "daily" | "weekdays" | "weekends" |
    /// "days:1,3,5" | "weekly:3". Parsed via HabitCadence.parse.
    var cadenceRaw: String = "daily"
    /// 1 = boolean checkmark habit; >1 = count-based (e.g. 8 glasses
    /// water). Boolean habits ignore `countsJSON`; count habits store
    /// per-day counts there and mirror to completedDates on hitting
    /// the target.
    var dailyTarget: Int = 1
    /// `{"YYYY-MM-DD": Int}` — count-based progress per day. Empty
    /// JSON object for boolean habits.
    var countsJSON: String = "{}"
    /// HabitCategory raw value — "body" | "mind" | "productivity" |
    /// "discipline" | "sleep" | "general".
    var category: String = "general"
    /// Soft-delete state. Archived habits don't appear in the main
    /// list but their history is preserved for stats and unarchive.
    var archived: Bool = false
    /// Optional free-form description, surfaced on the detail screen.
    var notes: String = ""

    /// True when this row has local changes the SyncService hasn't yet
    /// POSTed to Neon. Flipped false on a successful upload.
    var needsSync: Bool = true
    /// Server-assigned UUID once the row has round-tripped at least
    /// once. nil before first successful sync.
    var serverID: String?

    init(
        name: String,
        icon: String,
        order: Int = 0,
        colorToken: String = "accent",
        cadenceRaw: String = "daily",
        dailyTarget: Int = 1,
        category: String = "general",
        notes: String = ""
    ) {
        self.id = UUID()
        self.name = name
        self.icon = icon
        self.completedDates = []
        self.createdAt = Date()
        self.order = order
        self.colorToken = colorToken
        self.cadenceRaw = cadenceRaw
        self.dailyTarget = dailyTarget
        self.countsJSON = "{}"
        self.category = category
        self.archived = false
        self.notes = notes
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
    /// Source — "manual", "barcode", "photo", "voice", "favorite",
    /// "quickadd". Useful for nutrition coach summaries.
    var source: String
    /// Bucket — "breakfast" | "lunch" | "dinner" | "snack". Auto-set
    /// from `loggedAt` hour on insert; the user can override via the
    /// row context menu. Default to the empty string for pre-existing
    /// rows (lightweight migration); read-site falls back to a
    /// time-of-day derive when empty.
    var mealType: String = ""
    var needsSync: Bool = true
    var serverID: String?

    init(
        date: String,
        name: String,
        calories: Double,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0,
        source: String = "manual",
        mealType: String = ""
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
        self.mealType = mealType.isEmpty ? Self.deriveMealType(at: Date()) : mealType
    }

    /// Heuristic time-of-day bucketing — 4am-10:59 → breakfast,
    /// 11am-3:59pm → lunch, 4pm-8:59pm → dinner, otherwise snack.
    static func deriveMealType(at date: Date) -> String {
        let h = Calendar.current.component(.hour, from: date)
        switch h {
        case 4..<11:  return "breakfast"
        case 11..<16: return "lunch"
        case 16..<21: return "dinner"
        default:      return "snack"
        }
    }
}

/// One row per day of intraday heart-rate samples, pulled on demand
/// from `/api/google-health/heart-rate`. The per-minute series is
/// stored as a single JSON blob (`samplesJSON`) rather than thousands
/// of SwiftData rows — a day can hold up to 1,440 minute buckets and
/// modeling each as its own row would balloon the store and slow every
/// fetch. Day-level aggregates (`dayMin/Max/Avg/count`, `restingHr`)
/// are denormalized so the graph header can render before decoding the
/// blob. Upserted by HeartRateClient; never synced back to Neon.
@Model
final class HRDaySeries {
    @Attribute(.unique) var date: String   // "YYYY-MM-DD", local tz
    /// JSON-encoded `[{m,avg,min,max}]` — minute-of-day buckets, only
    /// minutes with data, sorted ascending. Decoded via
    /// `HeartRateClient.decodeSamples`.
    var samplesJSON: String
    var dayMin: Int
    var dayMax: Int
    var dayAvg: Int
    var count: Int
    var restingHr: Int?
    var updatedAt: Date

    init(
        date: String,
        samplesJSON: String = "[]",
        dayMin: Int = 0,
        dayMax: Int = 0,
        dayAvg: Int = 0,
        count: Int = 0,
        restingHr: Int? = nil,
        updatedAt: Date = Date()
    ) {
        self.date = date
        self.samplesJSON = samplesJSON
        self.dayMin = dayMin
        self.dayMax = dayMax
        self.dayAvg = dayAvg
        self.count = count
        self.restingHr = restingHr
        self.updatedAt = updatedAt
    }
}

/// One row per night of timed sleep-stage segments, pulled on demand
/// from `/api/google-health/sleep`. Like `HRDaySeries`, the segment
/// list is a single JSON blob rather than a row-per-segment — a night
/// can hold dozens of transitions and modeling each as its own row
/// would bloat the store. `date` is the civil WAKE date (what the UI
/// labels "last night"). `inBedStartMs` / `wakeEndMs` (epoch ms) anchor
/// the hypnogram's time axis; the per-stage minutes are denormalized so
/// the header renders before the blob decodes. Upserted by SleepClient;
/// never synced back to Neon.
@Model
final class SleepNight {
    @Attribute(.unique) var date: String   // wake date "YYYY-MM-DD", local tz
    /// JSON-encoded `[{s,a,b}]` — `s` = stage code (0 awake, 1 light,
    /// 2 deep, 3 rem), `a` = start epoch-ms, `b` = end epoch-ms. Sorted
    /// ascending by start. Decoded via `SleepClient.decodeSegments`.
    var segmentsJSON: String
    var inBedStartMs: Double
    var wakeEndMs: Double
    var deepMin: Int
    var remMin: Int
    var lightMin: Int
    var awakeMin: Int
    var updatedAt: Date

    init(
        date: String,
        segmentsJSON: String = "[]",
        inBedStartMs: Double = 0,
        wakeEndMs: Double = 0,
        deepMin: Int = 0,
        remMin: Int = 0,
        lightMin: Int = 0,
        awakeMin: Int = 0,
        updatedAt: Date = Date()
    ) {
        self.date = date
        self.segmentsJSON = segmentsJSON
        self.inBedStartMs = inBedStartMs
        self.wakeEndMs = wakeEndMs
        self.deepMin = deepMin
        self.remMin = remMin
        self.lightMin = lightMin
        self.awakeMin = awakeMin
        self.updatedAt = updatedAt
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
    /// Free-form session notes (how it felt, what to remember next
    /// time). Empty string is the "not set" state.
    var notes: String = ""
    var needsSync: Bool = true
    var serverID: String?

    init(
        date: String,
        workoutType: String,
        startedAt: Date,
        endedAt: Date,
        totalVolumeLb: Double,
        setCount: Int,
        detailsJSON: String,
        notes: String = ""
    ) {
        self.id = UUID()
        self.date = date
        self.workoutType = workoutType
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.totalVolumeLb = totalVolumeLb
        self.setCount = setCount
        self.detailsJSON = detailsJSON
        self.notes = notes
    }
}
