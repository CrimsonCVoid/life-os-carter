import Foundation
import ActivityKit

/// Single owner of the in-flight workout Live Activity. Start when a
/// session begins, push updates as sets complete, end when the user
/// finishes or cancels. Pair with `WorkoutActivityAttributes` (shared
/// with the WidgetExtension target).
@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private init() {}

    private var current: Activity<WorkoutActivityAttributes>?

    var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func start(workoutType: String, startedAt: Date = Date()) {
        guard isSupported else {
            print("[LA] Live Activities not authorized")
            return
        }
        // End any leftover activity from a previous app session — only
        // one workout-LA is allowed at a time.
        if let prev = current {
            let finalState = prev.content.state
            Task {
                await prev.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            current = nil
        }

        let attributes = WorkoutActivityAttributes(
            workoutType: workoutType,
            startedAt: startedAt
        )
        let initialState = WorkoutActivityAttributes.ContentState()
        do {
            current = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: initialState, staleDate: nil),
                pushType: nil
            )
        } catch {
            print("[LA] start failed: \(error)")
        }
    }

    func update(
        setsCompleted: Int,
        totalVolume: Double,
        lastExerciseName: String? = nil,
        lastSetSummary: String? = nil,
        restEndsAt: Date? = nil
    ) {
        guard let activity = current else { return }
        let state = WorkoutActivityAttributes.ContentState(
            setsCompleted: setsCompleted,
            totalVolume: totalVolume,
            lastExerciseName: lastExerciseName,
            lastSetSummary: lastSetSummary,
            restEndsAt: restEndsAt
        )
        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    func end() {
        guard let activity = current else { return }
        let finalState = activity.content.state
        Task {
            await activity.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: .immediate
            )
            current = nil
        }
    }
}
