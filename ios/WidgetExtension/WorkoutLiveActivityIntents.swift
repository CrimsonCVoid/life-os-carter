/**
 * WorkoutLiveActivityIntents — interactive Live Activity buttons.
 *
 * Three intents are exposed inside the Dynamic Island / Lock Screen
 * banner so the user can advance their workout without unlocking the
 * phone:
 *
 *   • CompleteCurrentSetIntent — mark the next pending set as complete
 *   • AddRestIntent              — bump current rest by 30s
 *   • SkipRestIntent             — clear the rest countdown
 *
 * Implementation pattern (works around the fact that the WidgetExtension
 * runs in a different process than the main app):
 *
 *   1. The intent updates the Live Activity content state OPTIMISTICALLY
 *      so the user sees an immediate response — sets counter ticks up,
 *      rest timer extends/clears.
 *   2. The intent appends a JSON command to UserDefaults key
 *      "workoutCommands" inside the shared App Group.
 *   3. The main JS app, while it has an active workout, polls the queue
 *      on app foreground + every 2s. It applies each command to the
 *      Zustand store, then clears the queue. Zustand re-pushes the
 *      canonical Live Activity update which overwrites the optimistic
 *      state — they should agree, so nothing visible happens.
 *
 * Setup:
 *   1. Drag this file into the WidgetExtension target (NOT the App
 *      target — LiveActivityIntent only works from the widget process).
 *   2. WidgetExtension target → Signing & Capabilities → App Groups →
 *      group.com.hbrady.lifeos
 *   3. Min deployment iOS 17 for the LiveActivityIntent protocol.
 */

#if os(iOS)
import ActivityKit
import AppIntents
import Foundation
import WidgetKit

/// Default amount to extend rest by on +30s tap.
private let kRestBumpSeconds: TimeInterval = 30

/// Default rest target when none is currently active.
private let kDefaultRestSeconds: TimeInterval = 90

/// App Group identifier — must match the App + WidgetExtension entitlements.
private let kAppGroup = "group.com.hbrady.lifeos"

/// Shared UserDefaults key for the pending-command queue. JS app drains
/// this whenever it foregrounds or on a 2-second tick.
private let kCommandQueueKey = "workoutCommands"

// MARK: - Command persistence

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
    queue.append(WorkoutCommand(
        op: op,
        ts: Date().timeIntervalSince1970 * 1000,
        args: args
    ))
    // Cap at 50 — anything older is almost certainly stale by the time
    // the user opens the app, no point letting it grow unbounded.
    if queue.count > 50 {
        queue = Array(queue.suffix(50))
    }
    if let data = try? JSONEncoder().encode(queue),
       let raw = String(data: data, encoding: .utf8) {
        defaults.set(raw, forKey: kCommandQueueKey)
    }
}

// MARK: - Activity helper

@available(iOS 17.0, *)
private func currentActivity() -> Activity<WorkoutActivityAttributes>? {
    return Activity<WorkoutActivityAttributes>.activities.first
}

@available(iOS 17.0, *)
private func optimisticallyUpdate(
    _ activity: Activity<WorkoutActivityAttributes>,
    transform: (inout WorkoutActivityAttributes.ContentState) -> Void
) async {
    var next = activity.content.state
    transform(&next)
    let content = ActivityContent(state: next, staleDate: nil)
    await activity.update(content)
}

// MARK: - Intents

/// Mark the next uncompleted set as done. Optimistically increments the
/// sets counter and starts a 90s rest in the Live Activity; the JS app
/// reconciles to the canonical state next time it foregrounds.
@available(iOS 17.0, *)
public struct CompleteCurrentSetIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Complete set"
    public static var description = IntentDescription(
        "Mark the current set as complete and start the rest timer."
    )
    public static var openAppWhenRun: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        appendCommand(op: "complete_set")
        if let activity = currentActivity() {
            await optimisticallyUpdate(activity) { state in
                state.setsCompleted += 1
                // Start the default rest window if one isn't already running.
                let now = Date()
                if state.restEndsAt == nil || state.restEndsAt! < now {
                    state.restEndsAt = now.addingTimeInterval(kDefaultRestSeconds)
                }
            }
        }
        return .result()
    }
}

/// Add 30 seconds to the current rest countdown. If no rest is active,
/// starts one at +30s.
@available(iOS 17.0, *)
public struct AddRestIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Add 30s rest"
    public static var description = IntentDescription(
        "Extend the current rest period by 30 seconds."
    )
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

/// Clear the rest countdown entirely.
@available(iOS 17.0, *)
public struct SkipRestIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Skip rest"
    public static var description = IntentDescription(
        "End the rest period now."
    )
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
#endif
