import SwiftUI
import Charts

/// Full training-periodization detail — phase, weekly volume by muscle, per-lift
/// e1RM progression, and the PR timeline. Presented as a sheet wrapping its own
/// NavigationStack (per the push-vs-sheet gotcha). Continuous-axis-safe: the
/// weekly-volume chart uses Date x + Double y with string-keyed COLOR stacking
/// only — no ordinal/array y-domain.
struct PeriodizationDetailView: View {
    let snapshot: PeriodizationSnapshot
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    phaseCard
                    if !snapshot.weeklyVolume.filter({ $0.total > 0 }).isEmpty {
                        weeklyVolumeCard
                    }
                    ForEach(snapshot.liftProgressions) { lift in
                        liftCard(lift)
                    }
                    if !snapshot.prTimeline.isEmpty { prTimelineCard }
                    Spacer(minLength: 60)
                }
                .padding(.horizontal, 14).padding(.top, 8)
            }
            .background(LifeOSColor.base.ignoresSafeArea())
            .navigationTitle("Periodization")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    // MARK: Phase

    private var phaseCard: some View {
        Card(tint: snapshot.phase.tint) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: snapshot.phase.icon).font(.system(size: 14, weight: .bold))
                        .foregroundStyle(snapshot.phase.tint)
                    Text(snapshot.phase.rawValue).font(.system(size: 16, weight: .bold))
                        .foregroundStyle(LifeOSColor.fg)
                }
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(snapshot.phase.tint.opacity(0.12), in: Capsule())

                Text(snapshot.phaseRationale).font(.system(size: 13)).foregroundStyle(LifeOSColor.fg2)
                    .fixedSize(horizontal: false, vertical: true)

                if let d = snapshot.deload {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "bed.double.fill").font(.system(size: 12))
                            .foregroundStyle(LifeOSColor.warning)
                        Text(d.reason).font(.system(size: 12)).foregroundStyle(LifeOSColor.fg)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(LifeOSColor.warning.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
    }

    // MARK: Weekly volume

    private struct VolRow: Identifiable {
        let id = UUID(); let week: Date; let muscle: String; let vol: Double
    }

    private var weeklyVolumeCard: some View {
        // Present muscles → stable domain + matching color range, so the legend
        // and stacking colors line up with the rest of the app.
        let presentMuscles = orderedPresentMuscles()
        let domain = presentMuscles.map(\.displayName)
        let colors = presentMuscles.map(\.chartTint)
        let rows: [VolRow] = snapshot.weeklyVolume.flatMap { wv in
            wv.byMuscle.map { VolRow(week: wv.weekStart, muscle: $0.muscle.displayName, vol: $0.volume) }
        }
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                header("WEEKLY VOLUME", "Tonnage by muscle", LifeOSColor.Metric.strain)
                Chart(rows) { r in
                    BarMark(
                        x: .value("Week", r.week, unit: .weekOfYear),
                        y: .value("Volume", r.vol)
                    )
                    .foregroundStyle(by: .value("Muscle", r.muscle))
                    .cornerRadius(2)
                }
                .chartForegroundStyleScale(domain: domain, range: colors)
                .chartLegend(position: .bottom, spacing: 6)
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel().foregroundStyle(LifeOSColor.fg3)
                        AxisGridLine().foregroundStyle(LifeOSColor.stroke)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .weekOfYear)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(LifeOSColor.fg3)
                    }
                }
                .frame(height: 190)
            }
        }
    }

    /// Muscles appearing in any week, ordered by total volume desc (stable
    /// legend ordering shared with the color range).
    private func orderedPresentMuscles() -> [ExerciseCatalogItem.Muscle] {
        var totals: [ExerciseCatalogItem.Muscle: Double] = [:]
        for wv in snapshot.weeklyVolume {
            for mv in wv.byMuscle { totals[mv.muscle, default: 0] += mv.volume }
        }
        return totals.sorted { $0.value > $1.value }.map(\.key)
    }

    // MARK: Lift progression

    private func liftCard(_ lift: PeriodizationSnapshot.LiftProgression) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(lift.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                    Spacer()
                    Text("\(lift.deltaPct >= 0 ? "+" : "")\(String(format: "%.0f", lift.deltaPct))%")
                        .font(.system(size: 13, weight: .bold).monospacedDigit())
                        .foregroundStyle(lift.deltaPct >= 0 ? LifeOSColor.success : LifeOSColor.danger)
                }
                Text("Estimated 1RM progression").font(.system(size: 11)).foregroundStyle(LifeOSColor.fg3)
                ScrubbableTrendChart(
                    points: lift.points, tint: LifeOSColor.Metric.strain,
                    average: nil, showArea: true, showPoints: lift.points.count <= 30,
                    valueFormat: { "\(Int($0.rounded())) lb e1RM" },
                    yAxisFormat: { "\(Int($0.rounded()))" })
                .frame(height: 130)
            }
        }
    }

    // MARK: PR timeline

    private var prTimelineCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                header("MILESTONES", "Recent 1RM PRs", LifeOSColor.Metric.peak)
                ForEach(snapshot.prTimeline) { pr in
                    HStack(spacing: 10) {
                        Image(systemName: "trophy.fill").font(.system(size: 13))
                            .foregroundStyle(LifeOSColor.Metric.calories).frame(width: 20)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(pr.exercise).font(.system(size: 13, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
                            Text(Self.shortDate(pr.day)).font(.system(size: 10)).foregroundStyle(LifeOSColor.fg3)
                        }
                        Spacer()
                        Text("\(Int(pr.e1RM.rounded())) lb")
                            .font(.system(size: 14, weight: .bold).monospacedDigit()).foregroundStyle(LifeOSColor.fg)
                        if pr.gainLb > 0 {
                            Text("+\(Int(pr.gainLb.rounded()))")
                                .font(.system(size: 10, weight: .bold).monospacedDigit())
                                .foregroundStyle(LifeOSColor.success)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(LifeOSColor.success.opacity(0.14), in: Capsule())
                        }
                    }
                }
            }
        }
    }

    // MARK: Shared

    private func header(_ kicker: String, _ title: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(kicker).font(.system(size: 10, weight: .heavy)).tracking(1.4).foregroundStyle(tint)
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(LifeOSColor.fg)
        }
    }

    private static func shortDate(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "MMM d, yyyy"; return f.string(from: d) }
}
