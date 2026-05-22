import ActivityKit
import Foundation

/// Shared Live Activity payloads — included in BOTH the App target and
/// the WidgetExtension target.
///
/// The lock screen now hosts TWO concurrent Live Activities for one
/// workout: an INFO card (sets, volume, rest timer, last set) and a
/// CONTROLS card (Set / +30s / Skip buttons). They're separate
/// ActivityAttributes types because iOS only renders one
/// ActivityConfiguration per type — registering two configurations
/// with the same attributes type produces the same single card.
/// Splitting into two types lets the system show both stacked.
///
/// Both share the same ContentState shape via a typealias so the main
/// app pushes one state object and both widgets re-render in sync.

// MARK: - Shared content state

public struct WorkoutContentState: Codable, Hashable {
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

    /// Last button the user tapped on the Controls widget. Both
    /// widgets read this + `lastActionAt` to render a brief "just
    /// pressed" pulse on the matching control. nil before any tap.
    public var lastAction: String?
    public var lastActionAt: Date?

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
        estimatedKcal: Double? = nil,
        lastAction: String? = nil,
        lastActionAt: Date? = nil
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
        self.lastAction = lastAction
        self.lastActionAt = lastActionAt
    }
}

/// Action-tag constants used by both the intents and the widget render
/// path so we don't have to keep raw strings in sync.
public enum WorkoutAction {
    public static let completeSet = "complete_set"
    public static let addRest     = "add_rest"
    public static let skipRest    = "skip_rest"
}

// MARK: - Info activity

public struct WorkoutActivityAttributes: ActivityAttributes {
    public typealias ContentState = WorkoutContentState

    public var workoutType: String
    public var startedAt: Date

    public init(workoutType: String, startedAt: Date) {
        self.workoutType = workoutType
        self.startedAt = startedAt
    }
}

// MARK: - Controls activity

public struct WorkoutControlsAttributes: ActivityAttributes {
    public typealias ContentState = WorkoutContentState

    public var workoutType: String
    public var startedAt: Date

    public init(workoutType: String, startedAt: Date) {
        self.workoutType = workoutType
        self.startedAt = startedAt
    }
}
