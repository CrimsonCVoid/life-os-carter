import Foundation

/// Recent-performance lookup for an exercise by name. Walks back
/// through LiftSessionEntry history and returns the most recent
/// session that included this exercise, summarized as a one-line
/// "last time: 185×8×3 RPE 8" string the active-workout view can
/// render under the exercise header. Returns nil when the user has
/// never logged this exercise before.
@MainActor
enum ExerciseHistoryLookup {
    struct Summary {
        let sessionDate: Date
        let topSetWeight: Double
        let topSetReps: Int
        let topSetRPE: Double?
        let totalSets: Int
        let oneLine: String
    }

    static func lastPerformance(
        of exerciseName: String,
        in sessions: [LiftSessionEntry]
    ) -> Summary? {
        let needle = exerciseName.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return nil }
        for session in sessions.sorted(by: { $0.startedAt > $1.startedAt }) {
            let decoded = CSVExporter.decodeExercises(session.detailsJSON)
            guard let match = decoded.first(where: { $0.name.lowercased() == needle }) else {
                continue
            }
            let completed = match.sets.filter(\.completed)
            guard !completed.isEmpty else { continue }
            let top = completed.max { $0.weight < $1.weight }
            return Summary(
                sessionDate: session.startedAt,
                topSetWeight: top?.weight ?? 0,
                topSetReps: top?.reps ?? 0,
                topSetRPE: top?.rpe,
                totalSets: completed.count,
                oneLine: format(
                    date: session.startedAt,
                    weight: top?.weight ?? 0,
                    reps: top?.reps ?? 0,
                    rpe: top?.rpe,
                    totalSets: completed.count
                )
            )
        }
        return nil
    }

    private static func format(date: Date, weight: Double, reps: Int, rpe: Double?, totalSets: Int) -> String {
        let when = ago(from: date)
        let w = weight.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", weight)
            : String(format: "%.1f", weight)
        var line = "Last \(when): top \(w)×\(reps) · \(totalSets) sets"
        if let rpe {
            let r = rpe.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%.0f", rpe)
                : String(format: "%.1f", rpe)
            line += " · RPE \(r)"
        }
        return line
    }

    private static func ago(from date: Date) -> String {
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: date),
                                      to: cal.startOfDay(for: Date())).day ?? 0
        switch days {
        case 0:    return "today"
        case 1:    return "yesterday"
        case ..<7: return "\(days) days ago"
        case ..<14: return "1 week ago"
        case ..<30: return "\(days / 7) weeks ago"
        default:   return "\(days / 30) months ago"
        }
    }
}
