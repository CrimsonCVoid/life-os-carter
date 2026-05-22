import ActivityKit
import AppIntents
import Foundation
import WidgetKit

/// iOS 17+ LiveActivityIntents — the buttons inside the Lock Screen
/// banner and Dynamic Island. Each intent does two things:
///   1. Mutates the activity content state immediately (optimistic UI)
///   2. Appends a JSON command to the App Group queue so the main app
///      can reconcile authoritative state on next foreground
///
/// In the native build, the app picks up the queue via
/// `WorkoutCommandConsumer` — same pattern as the Capacitor build,
/// minus the JS bridge in the middle.

private let kRestBumpSeconds: TimeInterval = 30
private let kDefaultRestSeconds: TimeInterval = 90
private let kAppGroup = "group.com.hbrady.lifeos"
private let kCommandQueueKey = "workoutCommands"

private struct WorkoutCommand: Codable {
    let op: String
    let ts: Double
    let args: [String: Double]?
}

@available(iOS 17.0, *)
private func appendCommand(op: String, args: [String: Double]? = nil) {
    guard let defaults = UserDefaults(suiteName: kAppGroup) else { return }
    var queue: [WorkoutCommand] = []
    if let raw = defaults.string(forKey: kCommandQueueKey),
       let data = raw.data(using: .utf8),
       let decoded = try? JSONDecoder().decode([WorkoutCommand].self, from: data) {
        queue = decoded
    }
    queue.append(WorkoutCommand(op: op, ts: Date().timeIntervalSince1970 * 1000, args: args))
    if queue.count > 50 { queue = Array(queue.suffix(50)) }
    if let data = try? JSONEncoder().encode(queue),
       let raw = String(data: data, encoding: .utf8) {
        defaults.set(raw, forKey: kCommandQueueKey)
    }
}

@available(iOS 17.0, *)
private func currentActivity() -> Activity<WorkoutActivityAttributes>? {
    Activity<WorkoutActivityAttributes>.activities.first
}

@available(iOS 17.0, *)
private func optimisticallyUpdate(
    _ activity: Activity<WorkoutActivityAttributes>,
    transform: (inout WorkoutActivityAttributes.ContentState) -> Void
) async {
    var next = activity.content.state
    transform(&next)
    await activity.update(ActivityContent(state: next, staleDate: nil))
}

@available(iOS 17.0, *)
public struct CompleteCurrentSetIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Complete set"
    public static var description = IntentDescription("Mark the current set complete and start the rest timer.")
    public static var openAppWhenRun: Bool = false
    public init() {}

    public func perform() async throws -> some IntentResult {
        appendCommand(op: "complete_set")
        if let activity = currentActivity() {
            await optimisticallyUpdate(activity) { state in
                state.setsCompleted += 1
                let now = Date()
                if state.restEndsAt == nil || state.restEndsAt! < now {
                    state.restEndsAt = now.addingTimeInterval(kDefaultRestSeconds)
                }
            }
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct AddRestIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Add 30s rest"
    public static var description = IntentDescription("Extend the current rest period by 30 seconds.")
    public static var openAppWhenRun: Bool = false
    public init() {}

    public func perform() async throws -> some IntentResult {
        appendCommand(op: "add_rest", args: ["seconds": kRestBumpSeconds])
        if let activity = currentActivity() {
            await optimisticallyUpdate(activity) { state in
                let now = Date()
                let base = (state.restEndsAt ?? now).timeIntervalSinceReferenceDate
                let bumped = max(base, now.timeIntervalSinceReferenceDate) + kRestBumpSeconds
                state.restEndsAt = Date(timeIntervalSinceReferenceDate: bumped)
            }
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct SkipRestIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Skip rest"
    public static var description = IntentDescription("End the rest period now.")
    public static var openAppWhenRun: Bool = false
    public init() {}

    public func perform() async throws -> some IntentResult {
        appendCommand(op: "skip_rest")
        if let activity = currentActivity() {
            await optimisticallyUpdate(activity) { state in
                state.restEndsAt = nil
            }
        }
        return .result()
    }
}
