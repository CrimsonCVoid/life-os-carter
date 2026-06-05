import Foundation
import SwiftData

/// Single-row settings store for user-configurable goals + preferences.
/// One per app install (we don't yet support multiple profiles); the
/// loader auto-creates the row on first access so screen code can call
/// `UserSettings.loadOrCreate(in: modelContext)` without checking.
///
/// Field philosophy: everything has a sensible default so a fresh
/// install has working numbers immediately. The user can override any
/// of them from the Settings → Goals editor.
@Model
final class UserSettings {
    @Attribute(.unique) var id: UUID

    // Nutrition macro goals
    var caloriesGoal: Int = 2200
    var proteinGoal: Int = 180
    var carbsGoal: Int = 240
    var fatGoal: Int = 75
    /// "manual" | "tdee_cut" | "tdee_maintain" | "tdee_bulk" — written
    /// by the (future) TDEE wizard, read-only display elsewhere.
    var nutritionTargetMethod: String = "manual"
    /// When true, ACTIVE exercise energy is added back to the daily
    /// calorie budget (remaining = goal − eaten + activeEnergy). Default
    /// false: the TDEE wizard already bakes an activity multiplier into
    /// `caloriesGoal`, so adding burn on top double-counts. Only ever
    /// adds `DailyEntry.activeEnergyKcal` — never total (which includes
    /// BMR) — so a sedentary day adds ~0, not ~1700.
    var eatBackExerciseCalories: Bool = false

    // Daily targets
    var sleepGoalHours: Double = 8
    var stepsGoal: Int = 10000
    var waterGoalOz: Double = 96

    // Body
    var weightUnit: String = "lb"
    var heightCm: Int?
    var birthYear: Int?
    var biologicalSex: String?            // "male" | "female" | "other"
    var activityLevel: String = "moderate" // sedentary | light | moderate | active | very_active
    /// Target body weight in lb. nil = no goal set → the Body screen hides the
    /// goal ring + ETA and shows a plain weight hero. Additive optional →
    /// lightweight migration.
    var goalWeightLb: Double?

    // Recovery baselines — populated by HealthKitManager.syncDay() so
    // the score is computed against rolling averages instead of raw
    // values. nil until enough data exists.
    var hrvBaseline: Double?
    var rhrBaseline: Double?

    /// Where the app pulls passive metrics (sleep, HRV, RHR, steps,
    /// weight) from. "apple_health" is the default — fast and local
    /// for Apple Watch users. "google_health" is for Fitbit / Pixel
    /// Watch users (Google bought Fitbit and the Web API is now
    /// served through Google Health). "manual" disables auto-sync;
    /// the user enters everything in the app.
    var healthDataSource: String = "apple_health"
    /// Last successful Google Health sync timestamp (ms since epoch),
    /// surfaced in Settings so the user knows when the cloud round-
    /// trip last completed. Apple Health syncs are local and don't
    /// need a timestamp.
    var lastGoogleHealthSyncAt: Double?
    /// True once we've seen a successful Google Health status check
    /// or sync. Gates the background sync loop — without this, every
    /// idle tab switch fires /api/google-health/sync and gets 401's
    /// in the console (and burns battery). Flipped true only after
    /// the server confirms an authenticated session; flipped false
    /// on explicit disconnect.
    var googleHealthConnected: Bool = false

    /// App background treatment. "mesh" = the default animated gradient;
    /// "photo" = a user-picked image rendered behind a heavy blur + scrim.
    /// The image bytes live on disk (Application Support) keyed by
    /// `backgroundImageFilename` — large blobs don't belong in SwiftData.
    var backgroundStyle: String = "mesh"
    var backgroundImageFilename: String?
    /// 0...1 user-tuned blur/scrim intensity for the photo background.
    /// Higher = blurrier + darker scrim (more legible foreground).
    var backgroundIntensity: Double = 0.85

    /// False until the user completes the first-run onboarding flow.
    /// Gates RootView: while false we present OnboardingFlow full-screen
    /// instead of the tab UI. Flipped true on the final "Start" step.
    var hasOnboarded: Bool = false

    init() {
        self.id = UUID()
    }

    /// Fetch the single row, creating it if missing. Safe to call on
    /// every screen mount — the predicate is exact-match on the
    /// singleton ID after first creation.
    static func loadOrCreate(in ctx: ModelContext) -> UserSettings {
        let descriptor = FetchDescriptor<UserSettings>()
        if let existing = (try? ctx.fetch(descriptor))?.first {
            return existing
        }
        let fresh = UserSettings()
        ctx.insert(fresh)
        try? ctx.save()
        return fresh
    }
}
