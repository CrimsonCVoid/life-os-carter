import Foundation
import ActivityKit

/// Single owner of the in-flight workout's Live Activity. ONE activity
/// per workout — splitting into two cards looked clean in code but iOS
/// stacks Live Activities so aggressively on the Lock Screen that the
/// back card is invisible. The single card contains header + hero +
/// action buttons.
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
        endExistingIfAny()

        let attributes = WorkoutActivityAttributes(
            workoutType: workoutType,
            startedAt: startedAt
        )
        let initialState = WorkoutContentState()
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

    func update(_ state: WorkoutContentState) {
        guard let activity = current else { return }
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

    private func endExistingIfAny() {
        guard let prev = current else { return }
        let finalState = prev.content.state
        Task {
            await prev.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
        current = nil
    }
}
