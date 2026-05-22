import Foundation

/// Build a CSV string from completed lift sessions. Format mirrors the
/// web's CSV export so the user's spreadsheets keep working.
///
///   date,workout_type,exercise,set,weight_lb,reps,rpe,is_drop
///
/// Pass the resulting URL to `ShareLink` for the standard share sheet.
@MainActor
enum CSVExporter {
    static func write(
        sessions: [LiftSessionEntry],
        decoded: [(LiftSessionEntry, [WorkoutExercise])]
    ) -> URL? {
        var lines: [String] = [
            "date,workout_type,exercise,set,weight_lb,reps,rpe,is_drop"
        ]
        for (session, exercises) in decoded {
            let date = ISO8601DateFormatter.dateOnly.string(from: session.startedAt)
            for ex in exercises {
                for (idx, set) in ex.sets.enumerated() {
                    guard set.completed else { continue }
                    let rpe = set.rpe.map { String(format: "%.1f", $0) } ?? ""
                    let drop = set.isDropSet ? "1" : "0"
                    lines.append(
                        "\(date),\(escape(session.workoutType)),\(escape(ex.name)),\(idx + 1),"
                        + "\(String(format: "%g", set.weight)),\(set.reps),\(rpe),\(drop)"
                    )
                }
            }
        }
        let csv = lines.joined(separator: "\n")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("life-os-workouts-\(Int(Date().timeIntervalSince1970)).csv")
        do {
            try csv.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            print("[CSVExporter] write failed: \(error)")
            return nil
        }
    }

    /// Decode a session's stored JSON exercises blob. Returns empty on
    /// malformed data rather than throwing — bad rows just skip.
    static func decodeExercises(_ json: String) -> [WorkoutExercise] {
        guard let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([WorkoutExercise].self, from: data)) ?? []
    }

    private static func escape(_ s: String) -> String {
        if s.contains(",") || s.contains("\"") || s.contains("\n") {
            return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return s
    }
}
