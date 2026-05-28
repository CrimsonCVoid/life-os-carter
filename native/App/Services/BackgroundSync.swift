import Foundation
import BackgroundTasks
import SwiftData

/// Opportunistic background refresh of the active health source so the
/// next time the user opens the app, today's metrics are already hot.
///
/// Uses `BGAppRefreshTask`: iOS schedules these at its discretion based on
/// app-usage signals, with the `earliestBeginDate` as a floor (typically
/// it fires every ~15–60 min when the user opens the app often, much less
/// when the app is rarely used). We are NOT guaranteed a wake-up — this is
/// best-effort. Foreground sync (HealthSync.syncToday) remains the source
/// of truth.
///
/// Identifier must also be listed in Info.plist under
/// `BGTaskSchedulerPermittedIdentifiers`, and `fetch` must be in
/// `UIBackgroundModes`.
enum BackgroundSync {
    static let identifier = "com.hbrady.lifeos.healthrefresh"
    private static let minInterval: TimeInterval = 15 * 60   // 15 min floor

    /// Register the task handler with the system. MUST be called before
    /// `application(_:didFinishLaunchingWithOptions:)` returns — i.e. in
    /// the App's `init()`.
    static func register(modelContainer: ModelContainer) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: identifier,
            using: nil
        ) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(task: refresh, modelContainer: modelContainer)
        }
    }

    /// Ask iOS to run us again in at least `minInterval`. Call when the
    /// app goes to background.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: minInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Common reasons: task not permitted (Info.plist missing it),
            // simulator (BGTaskScheduler doesn't fire on Simulator), or
            // user disabled Background App Refresh in Settings.
            print("[BackgroundSync] submit failed: \(error)")
        }
    }

    // MARK: - Handler

    private static func handle(task: BGAppRefreshTask, modelContainer: ModelContainer) {
        // Always queue the next run before doing work, so a crash here
        // doesn't strand us without a future wake-up.
        schedule()

        let work = Task { @MainActor in
            // The user may have signed out between scheduling and waking.
            await AuthStore.shared.ensureSignedIn()
            guard AuthStore.shared.token != nil else {
                task.setTaskCompleted(success: false)
                return
            }
            let ctx = ModelContext(modelContainer)
            await HealthSync.syncToday(in: ctx, force: true)
            task.setTaskCompleted(success: true)
        }

        // iOS gives us a budget (~30s). If we're about to exceed it, the
        // expiration handler fires — cancel and report failure cleanly so
        // the scheduler doesn't penalize future requests.
        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
