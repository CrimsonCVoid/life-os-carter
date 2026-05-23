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
    static func syncToday(in ctx: ModelContext) async {
        let settings = UserSettings.loadOrCreate(in: ctx)
        switch HealthDataSource.from(settings.healthDataSource) {
        case .appleHealth:
            await HealthKitManager.shared.syncToday(in: ctx)
        case .googleHealth:
            await GoogleHealthClient.shared.syncToday(in: ctx)
        case .manual:
            break
        }
    }
}
