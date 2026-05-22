import Foundation
import ActivityKit

/// Owns the in-flight workout's TWO concurrent Live Activities:
///   - Info     (WorkoutActivityAttributes)     — header + hero element
///   - Controls (WorkoutControlsAttributes)     — three action buttons
///
/// Both share `WorkoutContentState`. We push identical state to both
/// so counters and pulse animation stay in lockstep. The Controls card
/// is requested with a higher relevanceScore than Info, so the system
/// places it on TOP of the Lock Screen stack — buttons stay reachable,
/// info card peeks behind. Can't prevent stacking (iOS limitation), but
/// can control which surface is in front.
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

        // Info card — relevanceScore 50 puts it under Controls in the
        // stack. Stale date 60s out keeps it from being culled.
        do {
            infoActivity = try Activity.request(
                attributes: WorkoutActivityAttributes(
                    workoutType: workoutType,
                    startedAt: startedAt
                ),
                content: ActivityContent(
                    state: initialState,
                    staleDate: nil,
                    relevanceScore: 50
                ),
                pushType: nil
            )
        } catch {
            print("[LA] info-activity start failed: \(error)")
        }

        // Controls card — relevanceScore 100 so iOS shows it on top.
        do {
            controlsActivity = try Activity.request(
                attributes: WorkoutControlsAttributes(
                    workoutType: workoutType,
                    startedAt: startedAt
                ),
                content: ActivityContent(
                    state: initialState,
                    staleDate: nil,
                    relevanceScore: 100
                ),
                pushType: nil
            )
        } catch {
            print("[LA] controls-activity start failed: \(error)")
        }
    }

    func update(_ state: WorkoutContentState) {
        if let info = infoActivity {
            Task {
                await info.update(ActivityContent(
                    state: state, staleDate: nil, relevanceScore: 50
                ))
            }
        }
        if let controls = controlsActivity {
            Task {
                await controls.update(ActivityContent(
                    state: state, staleDate: nil, relevanceScore: 100
                ))
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
