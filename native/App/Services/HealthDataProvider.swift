import Foundation
import SwiftData

/// The three passive-metric sources the app can pull from. Selected
/// per-user in Settings so Apple Watch and Fitbit/Pixel Watch users
/// don't have to live with each other's defaults.
enum HealthDataSource: String, CaseIterable, Identifiable {
    case appleHealth = "apple_health"
    case googleHealth = "google_health"
    case manual

    var id: String { rawValue }

    var label: String {
        switch self {
        case .appleHealth:  return "Apple Health"
        case .googleHealth: return "Google Health"
        case .manual:       return "Manual entry"
        }
    }

    var subtitle: String {
        switch self {
        case .appleHealth:  return "Apple Watch · iPhone Health app"
        case .googleHealth: return "Fitbit · Pixel Watch (via Google Health)"
        case .manual:       return "I'll enter sleep, HRV, weight myself"
        }
    }

    var icon: String {
        switch self {
        case .appleHealth:  return "applewatch"
        case .googleHealth: return "applewatch.radiowaves.left.and.right"
        case .manual:       return "square.and.pencil"
        }
    }

    static func from(_ raw: String) -> HealthDataSource {
        HealthDataSource(rawValue: raw) ?? .appleHealth
    }
}

/// Unified entry point for "go pull today's metrics into the local
/// DailyEntry row." Branches on UserSettings.healthDataSource so the
/// rest of the app doesn't have to know whether the user is on
/// Apple Watch or Fitbit. Each branch is a no-op when the source
/// isn't configured (e.g. no HealthKit auth, no Google Health
/// connection).
@MainActor
enum HealthSync {
    /// Per-source throttle timestamps so we don't hammer either
    /// HealthKit or the Google Health API every time a screen
    /// re-renders. The Apple Health path also has its own internal
    /// throttle (HealthKitManager.lastSyncAt); we belt-and-suspenders
    /// here so the Google path is treated the same way.
    private static var lastGoogleSyncAt: Date?
    private static let minInterval: TimeInterval = 60

    static func syncToday(in ctx: ModelContext, force: Bool = false) async {
        let settings = UserSettings.loadOrCreate(in: ctx)
        switch HealthDataSource.from(settings.healthDataSource) {
        case .appleHealth:
            await HealthKitManager.shared.syncToday(in: ctx, force: force)
        case .googleHealth:
            // Short-circuit if the user hasn't completed OAuth yet —
            // no point hitting /sync just to take a 401, and that 401
            // would spam the console + wake the radio on every tab
            // switch (User saw "[GoogleHealth] sync failed: unauthenticated"
            // looping in the Xcode console).
            guard settings.googleHealthConnected else { return }
            if !force, let last = lastGoogleSyncAt,
               Date().timeIntervalSince(last) < minInterval {
                return
            }
            await GoogleHealthClient.shared.syncToday(in: ctx)
            lastGoogleSyncAt = Date()
        case .manual:
            break
        }
    }
}
