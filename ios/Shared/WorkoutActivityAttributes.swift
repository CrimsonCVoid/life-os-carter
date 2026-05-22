/**
 * WorkoutActivityAttributes — shared between the App target (which
 * starts/updates/ends the activity from JS via LiveActivityBridge) and
 * the Widget Extension target (which renders the Lock Screen + Dynamic
 * Island UI).
 *
 * IMPORTANT: this file must be added to BOTH targets in Xcode.
 *   1. App target — used by LiveActivityBridgePlugin to call
 *      Activity<WorkoutActivityAttributes>.request(...)
 *   2. WidgetExtension target — used by the WidgetBundle to declare
 *      ActivityConfiguration(for: WorkoutActivityAttributes.self) { ... }
 *
 * Right-click → Add to → check both targets in the inspector.
 */

import ActivityKit
import Foundation

public struct WorkoutActivityAttributes: ActivityAttributes {
    /// Mutable state — pushed via Activity.update(...) every time the
    /// JS app logs a set or finishes an exercise.
    public struct ContentState: Codable, Hashable {
        /// Total completed sets so far in this session.
        public var setsCompleted: Int
        /// Total volume (lb) — sum of weight × reps for completed sets.
        public var totalVolume: Double
        /// Most-recent exercise name, shown in the expanded Dynamic Island
        /// and the Lock Screen banner.
        public var lastExerciseName: String?
        /// Most-recent set summary like "185 × 8". Used in compact island.
        public var lastSetSummary: String?
        /// Resting countdown — non-nil while the user is between sets.
        /// Encoded as ISO-8601 so the system can keep the countdown ticking
        /// without further updates from the app.
        public var restEndsAt: Date?

        public init(
            setsCompleted: Int = 0,
            totalVolume: Double = 0,
            lastExerciseName: String? = nil,
            lastSetSummary: String? = nil,
            restEndsAt: Date? = nil
        ) {
            self.setsCompleted = setsCompleted
            self.totalVolume = totalVolume
            self.lastExerciseName = lastExerciseName
            self.lastSetSummary = lastSetSummary
            self.restEndsAt = restEndsAt
        }
    }

    /// Immutable — set once when the activity starts.
    /// The Workout Type (e.g. "Push", "Legs") + the session start time.
    public var workoutType: String
    public var startedAt: Date

    public init(workoutType: String, startedAt: Date) {
        self.workoutType = workoutType
        self.startedAt = startedAt
    }
}
