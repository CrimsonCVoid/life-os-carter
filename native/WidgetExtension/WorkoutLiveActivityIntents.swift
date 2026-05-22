import ActivityKit
import AppIntents
import Foundation
import UIKit
import WidgetKit

/// iOS 17+ LiveActivityIntents — the buttons inside the Controls Live
/// Activity. Each intent does three things, in order:
///
///   1. Fires a UIImpactFeedbackGenerator haptic. LiveActivityIntents
///      run in the MAIN APP process (per Apple's docs), so the haptic
///      engine is available even though the app isn't visibly in the
///      foreground. The user feels the tap confirmed.
///   2. Tags the action via lastAction + lastActionAt on the activity
///      content state so both Live Activity widgets render a brief
///      "just pressed" pulse on the matching control.
///   3. Appends a JSON command to the App Group queue so the main
///      app's `WorkoutCommandConsumer` can reconcile authoritative
///      state on the next foreground tick.
///
/// Plus the existing optimistic content-state mutation so the LA shows
/// the result of the tap immediately, not after the app catches up.

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

/// Fire a haptic from inside a LiveActivityIntent. Safe because these
/// intents run in the main app's foreground process.
@available(iOS 17.0, *)
@MainActor
private func fireHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
    let gen = UIImpactFeedbackGenerator(style: style)
    gen.prepare()
    gen.impactOccurred()
}

@available(iOS 17.0, *)
@MainActor
private func fireNotification(_ kind: UINotificationFeedbackGenerator.FeedbackType) {
    let gen = UINotificationFeedbackGenerator()
    gen.prepare()
    gen.notificationOccurred(kind)
}

/// Push an optimistic state update to the single Live Activity. The
/// caller mutates state in the closure; we await the push so iOS
/// re-renders the Lock Screen before the intent returns. Without the
/// await, the user sees a perceptible delay between tap and counter
/// updating.
@available(iOS 17.0, *)
private func updateLiveActivity(_ transform: (inout WorkoutContentState) -> Void) async {
    guard let activity = Activity<WorkoutActivityAttributes>.activities.first else { return }
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
        await fireNotification(.success)
        appendCommand(op: "complete_set")
        await updateLiveActivity { state in
            state.setsCompleted += 1
            let now = Date()
            if state.restEndsAt == nil || state.restEndsAt! < now {
                state.restEndsAt = now.addingTimeInterval(kDefaultRestSeconds)
            }
            state.lastAction = WorkoutAction.completeSet
            state.lastActionAt = now
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
        await fireHaptic(.medium)
        appendCommand(op: "add_rest", args: ["seconds": kRestBumpSeconds])
        await updateLiveActivity { state in
            let now = Date()
            let base = (state.restEndsAt ?? now).timeIntervalSinceReferenceDate
            let bumped = max(base, now.timeIntervalSinceReferenceDate) + kRestBumpSeconds
            state.restEndsAt = Date(timeIntervalSinceReferenceDate: bumped)
            state.lastAction = WorkoutAction.addRest
            state.lastActionAt = now
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
        await fireHaptic(.light)
        appendCommand(op: "skip_rest")
        await updateLiveActivity { state in
            state.restEndsAt = nil
            state.lastAction = WorkoutAction.skipRest
            state.lastActionAt = Date()
        }
        return .result()
    }
}
