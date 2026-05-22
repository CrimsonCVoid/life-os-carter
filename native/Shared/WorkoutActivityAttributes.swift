import ActivityKit
import Foundation

/// Shared Live Activity payload — included in BOTH the App target and
/// the WidgetExtension target. Expanded for the v2 Live Activity that
/// shows a richer Lock Screen + Dynamic Island layout.
public struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Core counters
        public var setsCompleted: Int
        public var totalVolume: Double
        public var exerciseCount: Int
        public var completedExerciseCount: Int

        // Last set context
        public var lastExerciseName: String?
        public var lastSetSummary: String?
        public var lastSetEstOneRM: Double?
        public var lastSetIsPR: Bool

        // Rest
        public var restEndsAt: Date?
        public var restTargetSeconds: Int

        // What's next (from template, if running off one)
        public var nextExerciseName: String?
        public var nextExerciseSetCount: Int?

        // Workout energy estimate
        public var estimatedKcal: Double?

        public init(
            setsCompleted: Int = 0,
            totalVolume: Double = 0,
            exerciseCount: Int = 0,
            completedExerciseCount: Int = 0,
            lastExerciseName: String? = nil,
            lastSetSummary: String? = nil,
            lastSetEstOneRM: Double? = nil,
            lastSetIsPR: Bool = false,
            restEndsAt: Date? = nil,
            restTargetSeconds: Int = 120,
            nextExerciseName: String? = nil,
            nextExerciseSetCount: Int? = nil,
            estimatedKcal: Double? = nil
        ) {
            self.setsCompleted = setsCompleted
            self.totalVolume = totalVolume
            self.exerciseCount = exerciseCount
            self.completedExerciseCount = completedExerciseCount
            self.lastExerciseName = lastExerciseName
            self.lastSetSummary = lastSetSummary
            self.lastSetEstOneRM = lastSetEstOneRM
            self.lastSetIsPR = lastSetIsPR
            self.restEndsAt = restEndsAt
            self.restTargetSeconds = restTargetSeconds
            self.nextExerciseName = nextExerciseName
            self.nextExerciseSetCount = nextExerciseSetCount
            self.estimatedKcal = estimatedKcal
        }
    }

    public var workoutType: String
    public var startedAt: Date

    public init(workoutType: String, startedAt: Date) {
        self.workoutType = workoutType
        self.startedAt = startedAt
    }
}
