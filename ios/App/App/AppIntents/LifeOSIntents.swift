/**
 * Siri / Shortcuts / Spotlight App Intents.
 *
 * All intents deep-link into the running app via URL scheme
 * (lifeos://...) which the AppDelegate handles by passing the URL into
 * the Capacitor WebView. The WebView's onpopstate handler routes to the
 * matching screen.
 *
 * Setup:
 *   1. Drag this file into the App target.
 *   2. Add the URL scheme to Info.plist: CFBundleURLTypes → URL Schemes
 *      → "lifeos".
 *   3. (Optional) Open Shortcuts.app on a test device — the intents
 *      auto-appear under "Life OS".
 */

import AppIntents
import Foundation

@available(iOS 16.0, *)
struct StartWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Start workout"
    static var description = IntentDescription("Open Life OS and begin a new lift session.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let url = URL(string: "lifeos://workout/start")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

@available(iOS 16.0, *)
struct LogMealIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a meal"
    static var description = IntentDescription("Open Life OS to the log-meal entry sheet.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let url = URL(string: "lifeos://nutrition/log")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

@available(iOS 16.0, *)
struct QuickStatsIntent: AppIntent {
    static var title: LocalizedStringResource = "Show today's stats"
    static var description = IntentDescription("Reads today's strain, sleep, and steps aloud.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let defaults = UserDefaults(suiteName: "group.com.hbrady.lifeos"),
              let raw = defaults.string(forKey: "todaySnapshot"),
              let data = raw.data(using: .utf8),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data)
        else {
            return .result(dialog: "I don't have today's numbers yet. Open Life OS to sync.")
        }
        let strain = snap.strain.map { String(format: "%.1f", $0) } ?? "unknown"
        let sleep = snap.sleep.map { String(format: "%.1f hours", $0) } ?? "unknown"
        let steps = snap.steps.map { Int($0.rounded()) }.map(String.init) ?? "unknown"
        return .result(dialog: "Today's strain is \(strain). You slept \(sleep) and walked \(steps) steps.")
    }

    private struct Snapshot: Codable {
        var strain: Double?
        var sleep: Double?
        var steps: Double?
    }
}

@available(iOS 16.0, *)
struct StartFastIntent: AppIntent {
    static var title: LocalizedStringResource = "Start a fast"
    static var description = IntentDescription("Open Life OS and start an intermittent fast.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "lifeos://nutrition/fast")!))
    }
}

@available(iOS 16.0, *)
struct LogWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Log water"
    static var description = IntentDescription("Add a glass of water (8 oz) to today's hydration.")

    @Parameter(title: "Ounces", default: 8)
    var ounces: Int

    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let url = URL(string: "lifeos://water/log?oz=\(ounces)")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

@available(iOS 16.0, *)
struct LogMoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Log mood"
    static var description = IntentDescription("Open Life OS to log how you're feeling right now.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "lifeos://mood/log")!))
    }
}

@available(iOS 16.0, *)
struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "Log weight"
    static var description = IntentDescription("Open Life OS to record today's body weight.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "lifeos://weight/log")!))
    }
}

@available(iOS 16.0, *)
struct OpenJournalIntent: AppIntent {
    static var title: LocalizedStringResource = "Open journal"
    static var description = IntentDescription("Jump straight into a new journal entry.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "lifeos://journal/new")!))
    }
}

@available(iOS 16.0, *)
struct FinishWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Finish workout"
    static var description = IntentDescription("Open the active workout to wrap it up.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "lifeos://workout/finish")!))
    }
}

@available(iOS 16.0, *)
struct LifeOSShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartWorkoutIntent(),
            phrases: [
                "Start a workout with \(.applicationName)",
                "\(.applicationName) workout",
            ],
            shortTitle: "Start workout",
            systemImageName: "dumbbell.fill"
        )
        AppShortcut(
            intent: LogMealIntent(),
            phrases: [
                "Log a meal in \(.applicationName)",
                "\(.applicationName) log meal",
            ],
            shortTitle: "Log meal",
            systemImageName: "fork.knife"
        )
        AppShortcut(
            intent: QuickStatsIntent(),
            phrases: [
                "What are my \(.applicationName) stats",
                "\(.applicationName) today",
            ],
            shortTitle: "Today's stats",
            systemImageName: "chart.bar.fill"
        )
        AppShortcut(
            intent: StartFastIntent(),
            phrases: [
                "Start a fast with \(.applicationName)",
                "\(.applicationName) fast",
            ],
            shortTitle: "Start fast",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: LogWaterIntent(),
            phrases: [
                "Log water in \(.applicationName)",
                "\(.applicationName) water",
                "I drank water in \(.applicationName)",
            ],
            shortTitle: "Log water",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: LogMoodIntent(),
            phrases: [
                "Log my mood in \(.applicationName)",
                "\(.applicationName) mood",
            ],
            shortTitle: "Log mood",
            systemImageName: "face.smiling"
        )
        AppShortcut(
            intent: LogWeightIntent(),
            phrases: [
                "Log my weight in \(.applicationName)",
                "\(.applicationName) weight",
            ],
            shortTitle: "Log weight",
            systemImageName: "scalemass.fill"
        )
        AppShortcut(
            intent: OpenJournalIntent(),
            phrases: [
                "Journal in \(.applicationName)",
                "New journal entry in \(.applicationName)",
            ],
            shortTitle: "New journal",
            systemImageName: "book.fill"
        )
        AppShortcut(
            intent: FinishWorkoutIntent(),
            phrases: [
                "Finish my \(.applicationName) workout",
                "End \(.applicationName) workout",
            ],
            shortTitle: "Finish workout",
            systemImageName: "checkmark.circle.fill"
        )
    }
}
