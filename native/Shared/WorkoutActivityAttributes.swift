import ActivityKit
import Foundation

/// Shared Live Activity payload — included in BOTH the App target and
/// the WidgetExtension target. The App registers the activity with this
/// shape via `LiveActivityManager`; the WidgetExtension renders the
/// Lock Screen banner + Dynamic Island reading the same shape back.
public struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var setsCompleted: Int
        public var totalVolume: Double
        public var lastExerciseName: String?
        public var lastSetSummary: String?
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

    public var workoutType: String
    public var startedAt: Date

    public init(workoutType: String, startedAt: Date) {
        self.workoutType = workoutType
        self.startedAt = startedAt
    }
}
