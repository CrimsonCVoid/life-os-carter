import SwiftUI
import SwiftData
import Charts

/// All-time history + PRs for a single exercise. Top-set-weight trend
/// line over every session, plus a list of every set ever performed.
struct ExerciseHistoryView: View {
    let exerciseName: String
    @Query private var sessions: [LiftSessionEntry]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                prGrid
                weightChart
                SectionLabel("History")
                ForEach(historyRows, id: \.id) { row in
                    historyCard(row)
                }
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(LifeOSColor.base.ignoresSafeArea())
        .navigationTitle(exerciseName)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - PR row

    private var prGrid: some View {
        let prs = computePRs()
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            prTile("Estimated 1RM",     prs.oneRM,         "lb", LifeOSColor.Metric.peak)
            prTile("Heaviest weight",   prs.heaviestWeight, "lb", LifeOSColor.Metric.strain)
            prTile("Most reps",         Double(prs.mostReps), "reps", LifeOSColor.Metric.steps)
            prTile("Sessions",          Double(prs.sessions), "", LifeOSColor.accent)
        }
    }

    private func prTile(_ label: String, _ value: Double, _ unit: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold)).tracking(1.2)
                .foregroundStyle(LifeOSColor.fg3)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value > 0 ? formatNumber(value) : "—")
                    .font(.system(size: 22, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundStyle(tint)
                if !unit.isEmpty && value > 0 {
                    Text(unit)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .glassCard(cornerRadius: 14)
    }

    // MARK: - Chart

    private var weightChart: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text("TOP WEIGHT PER WORKOUT")
                    .font(.system(size: 10, weight: .semibold)).tracking(1.2)
                    .foregroundStyle(LifeOSColor.fg3)
                Chart(topWeightSeries, id: \.date) { item in
                    LineMark(
                        x: .value("Date", item.date, unit: .day),
                        y: .value("Weight", item.value)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(LifeOSColor.Metric.strain)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                    PointMark(
                        x: .value("Date", item.date, unit: .day),
                        y: .value("Weight", item.value)
                    )
                    .foregroundStyle(LifeOSColor.Metric.strain)
                    .symbolSize(20)
                }
                .frame(height: 140)
                .chartYAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
            }
        }
    }

    // MARK: - History rows

    struct HistoryRow: Identifiable {
        let id = UUID()
        let date: Date
        let workoutType: String
        let sets: [WorkoutSet]
    }

    private var historyRows: [HistoryRow] {
        var rows: [HistoryRow] = []
        for s in sessions.sorted(by: { $0.startedAt > $1.startedAt }) {
            let decoded = CSVExporter.decodeExercises(s.detailsJSON)
            if let match = decoded.first(where: { $0.name.lowercased() == exerciseName.lowercased() }) {
                rows.append(HistoryRow(date: s.startedAt, workoutType: s.workoutType, sets: match.sets))
            }
        }
        return rows
    }

    private func historyCard(_ row: HistoryRow) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(row.date.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Text(row.workoutType)
                        .font(.system(size: 11))
                        .foregroundStyle(LifeOSColor.fg3)
                }
                ForEach(Array(row.sets.enumerated()), id: \.element.id) { idx, set in
                    HStack {
                        Text("\(idx + 1)")
                            .frame(width: 18)
                            .foregroundStyle(LifeOSColor.fg3)
                        Text("\(formatNumber(set.weight)) lb")
                            .monospacedDigit()
                        Text("× \(set.reps)")
                            .monospacedDigit()
                        Spacer()
                        if let rpe = set.rpe {
                            Text("RPE \(formatNumber(rpe))")
                                .font(.system(size: 10))
                                .foregroundStyle(LifeOSColor.Metric.peak)
                        }
                    }
                    .font(.system(size: 12))
                }
            }
        }
    }

    // MARK: - Derived

    struct PRSet {
        var oneRM: Double = 0
        var heaviestWeight: Double = 0
        var mostReps: Int = 0
        var sessions: Int = 0
    }

    private func computePRs() -> PRSet {
        var prs = PRSet()
        for s in sessions {
            let decoded = CSVExporter.decodeExercises(s.detailsJSON)
            for ex in decoded where ex.name.lowercased() == exerciseName.lowercased() {
                if !ex.sets.isEmpty { prs.sessions += 1 }
                for set in ex.sets where set.completed && set.weight > 0 {
                    prs.oneRM = max(prs.oneRM, estimate1RM(weight: set.weight, reps: set.reps))
                    prs.heaviestWeight = max(prs.heaviestWeight, set.weight)
                    prs.mostReps = max(prs.mostReps, set.reps)
                }
            }
        }
        return prs
    }

    struct DataPoint {
        let date: Date
        let value: Double
    }

    private var topWeightSeries: [DataPoint] {
        sessions
            .sorted { $0.startedAt < $1.startedAt }
            .compactMap { s in
                let decoded = CSVExporter.decodeExercises(s.detailsJSON)
                let top = decoded.first(where: { $0.name.lowercased() == exerciseName.lowercased() })?
                    .sets
                    .filter(\.completed)
                    .map(\.weight)
                    .max() ?? 0
                return top > 0 ? DataPoint(date: s.startedAt, value: top) : nil
            }
    }

    private func formatNumber(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", v)
            : String(format: "%.1f", v)
    }
}
