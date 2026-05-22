import Foundation
import ActivityKit

/// Single owner of the in-flight workout's TWO Live Activities. We run
/// two concurrent activities for one workout:
///   - Info  (WorkoutActivityAttributes)     — sets/volume/timer/last set
///   - Controls (WorkoutControlsAttributes)  — Set / +30s / Skip buttons
///
/// They share a ContentState shape (`WorkoutContentState`) and we
/// always push identical state to both so the UI stays consistent. End
/// behavior is also linked: ending the workout ends both cards.
@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private init() {}

    private var infoActivity: Activity<WorkoutActivityAttributes>?
    private var controlsActivity: Activity<WorkoutControlsAttributes>?

    var isSupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func start(workoutType: String, startedAt: Date = Date()) {
        guard isSupported else {
            print("[LA] Live Activities not authorized")
            return
        }
        endExistingIfAny()

        let initialState = WorkoutContentState()
        do {
            infoActivity = try Activity.request(
                attributes: WorkoutActivityAttributes(
                    workoutType: workoutType,
                    startedAt: startedAt
                ),
                content: ActivityContent(state: initialState, staleDate: nil),
                pushType: nil
            )
        } catch {
            print("[LA] info-activity start failed: \(error)")
        }
        do {
            controlsActivity = try Activity.request(
                attributes: WorkoutControlsAttributes(
                    workoutType: workoutType,
                    startedAt: startedAt
                ),
                content: ActivityContent(state: initialState, staleDate: nil),
                pushType: nil
            )
        } catch {
            print("[LA] controls-activity start failed: \(error)")
        }
    }

    func update(_ state: WorkoutContentState) {
        if let info = infoActivity {
            Task {
                await info.update(ActivityContent(state: state, staleDate: nil))
            }
        }
        if let controls = controlsActivity {
            Task {
                await controls.update(ActivityContent(state: state, staleDate: nil))
            }
        }
    }

    func end() {
        if let info = infoActivity {
            let finalState = info.content.state
            Task {
                await info.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            infoActivity = nil
        }
        if let controls = controlsActivity {
            let finalState = controls.content.state
            Task {
                await controls.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            controlsActivity = nil
        }
    }

    private func endExistingIfAny() {
        if let prev = infoActivity {
            let finalState = prev.content.state
            Task {
                await prev.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            infoActivity = nil
        }
        if let prev = controlsActivity {
            let finalState = prev.content.state
            Task {
                await prev.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            }
            controlsActivity = nil
        }
    }
}
