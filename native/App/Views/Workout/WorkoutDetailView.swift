import SwiftUI
import SwiftData

/// Detail view for a single finished workout. Shown when the user taps
/// a row in the Gym tab's "Recent sessions" list. Breaks the session
/// down by exercise with the set log, and lets the user navigate to the
/// all-time history for any exercise.
///
/// Read-only — finished sessions are immutable. To "return" to a session
/// in the sense of resuming, the user starts a new workout (the active
/// store has no concept of un-finishing a saved session).
struct WorkoutDetailView: View {
    let session: LiftSessionEntry

    private var exercises: [WorkoutExercise] {
        CSVExporter.decodeExercises(session.detailsJSON)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                summaryHeader
                ForEach(exercises, id: \.id) { ex in
                    exerciseSection(ex)
                }
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle(session.workoutType)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Summary header

    private var summaryHeader: some View {
        Card(tint: LifeOSColor.Metric.peak) {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.startedAt.formatted(date: .complete, time: .omitted))
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg3)
                    Text(session.workoutType)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(.white)
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    summaryTile("VOLUME", "\(Int(session.totalVolumeLb))", "lb", LifeOSColor.Metric.peak)
                    summaryTile("SETS", "\(session.setCount)", "", LifeOSColor.Metric.strain)
                    summaryTile("TIME", durationShort, "", LifeOSColor.Metric.steps)
                }
            }
        }
    }

    private func summaryTile(_ label: String, _ value: String, _ unit: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .heavy)).tracking(1.2)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(tint)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Per-exercise section

    private func exerciseSection(_ ex: WorkoutExercise) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ex.name)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                    Text(exerciseSubtitle(ex))
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                Spacer()
                NavigationLink {
                    ExerciseHistoryView(exerciseName: ex.name)
                } label: {
                    HStack(spacing: 3) {
                        Text("History")
                            .font(.system(size: 11, weight: .semibold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(LifeOSColor.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)

            Card {
                setListRows(ex)
            }
        }
    }

    private func setListRows(_ ex: WorkoutExercise) -> some View {
        VStack(spacing: 6) {
            ForEach(Array(ex.sets.enumerated()), id: \.element.id) { idx, set in
                HStack(spacing: 10) {
                    if set.isDropSet {
                        Text("DROP")
                            .font(.system(size: 9, weight: .heavy)).tracking(0.6)
                            .foregroundStyle(LifeOSColor.warning)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                    .fill(LifeOSColor.warning.opacity(0.16))
                            )
                    } else {
                        Text("\(idx + 1)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(LifeOSColor.fg3)
                            .frame(width: 22)
                    }
                    Text("\(formatNumber(set.weight)) lb")
                        .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    Text("× \(set.reps)")
                        .font(.system(size: 13).monospacedDigit())
                        .foregroundStyle(LifeOSColor.fg2)
                    if let rpe = set.rpe {
                        Text("RPE \(formatNumber(rpe))")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(LifeOSColor.Metric.peak)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(LifeOSColor.Metric.peak.opacity(0.15)))
                    }
                    Spacer()
                    if set.completed {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(LifeOSColor.success)
                    } else {
                        Image(systemName: "minus.circle")
                            .font(.system(size: 14))
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .padding(.leading, set.isDropSet ? 16 : 0)
            }
        }
    }

    // MARK: - Derived

    private func completedSets(_ ex: WorkoutExercise) -> [WorkoutSet] {
        ex.sets.filter(\.completed)
    }

    private func exerciseSubtitle(_ ex: WorkoutExercise) -> String {
        let completed = completedSets(ex)
        let volume = completed.reduce(0.0) { $0 + $1.weight * Double($1.reps) }
        let topSet = completed.max(by: { $0.weight < $1.weight })
        var parts: [String] = []
        parts.append("\(completed.count) sets")
        if volume > 0 { parts.append("\(Int(volume)) lb vol") }
        if let top = topSet, top.weight > 0 {
            parts.append("top \(formatNumber(top.weight))×\(top.reps)")
        }
        return parts.joined(separator: " · ")
    }

    private var durationShort: String {
        let seconds = Int(session.endedAt.timeIntervalSince(session.startedAt))
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }

    private func formatNumber(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", v)
            : String(format: "%.1f", v)
    }
}
