import SwiftUI
import SwiftData

/// Full-screen behavioral intelligence — the deep view behind
/// BehaviorInsightsCard. Lists every on-device insight, then a
/// per-habit consistency breakdown with completion-rate bars, current
/// streak, and a trend arrow. All deterministic and instant.
struct BehaviorInsightsView: View {
    @Query(filter: #Predicate<HabitEntry> { $0.archived == false })
    private var habits: [HabitEntry]
    @Query private var daily: [DailyEntry]

    @State private var revealed = false

    /// Lookback window, in days.
    var days: Int = 30

    private var insights: [BehaviorInsight] {
        BehaviorInsightsEngine.insights(habits: habits, daily: daily, days: days)
    }
    private var consistency: [HabitConsistency] {
        BehaviorInsightsEngine.consistency(habits: habits, days: days)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if habits.isEmpty {
                    emptyState.cascadeReveal(index: 0, visible: revealed)
                } else {
                    insightsSection.cascadeReveal(index: 0, visible: revealed)
                    consistencySection.cascadeReveal(index: 1, visible: revealed)
                }
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(AmbientBackground().ignoresSafeArea())
        .navigationTitle("Behavior")
        .navigationBarTitleDisplayMode(.large)
        .onAppear { if !revealed { revealed = true } }
    }

    // MARK: - Insights

    @ViewBuilder
    private var insightsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("What your behavior is telling you")
            if insights.isEmpty {
                Card {
                    Text("Not enough overlap between habit completions and your mood/energy logs yet. Keep logging both for a week or two and patterns will surface here.")
                        .font(.system(size: 12))
                        .foregroundStyle(LifeOSColor.fg2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Card {
                    VStack(spacing: 12) {
                        ForEach(insights) { InsightRow(insight: $0) }
                    }
                }
            }
        }
    }

    // MARK: - Per-habit consistency

    @ViewBuilder
    private var consistencySection: some View {
        if !consistency.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Consistency · last \(days) days")
                Card {
                    VStack(spacing: 16) {
                        ForEach(Array(consistency.enumerated()), id: \.element.id) { idx, row in
                            ConsistencyRow(row: row)
                            if idx < consistency.count - 1 {
                                Divider().overlay(LifeOSColor.stroke)
                            }
                        }
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        EmptyStateCard(
            icon: "brain.head.profile",
            title: "No behavior data yet",
            subtitle: "Track a few habits and log your mood or energy on Today. Once there's history, this screen reveals which habits move your mood, energy, and sleep.",
            tint: LifeOSColor.accent
        )
    }
}

// MARK: - Consistency row

/// One habit's consistency line — icon, name, streak chip, a tinted
/// completion-rate bar, and a trend arrow. Mirrors the habit-row visual
/// language from HabitsView so the two screens feel like one system.
private struct ConsistencyRow: View {
    let row: HabitConsistency

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(row.tint.opacity(0.16))
                    Image(systemName: row.icon)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(row.tint)
                }
                .frame(width: 32, height: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LifeOSColor.fg)
                    HStack(spacing: 6) {
                        if row.currentStreak >= 2 {
                            HStack(spacing: 3) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 9, weight: .bold))
                                Text("\(row.currentStreak)")
                                    .font(.system(size: 10, weight: .heavy)).monospacedDigit()
                            }
                            .foregroundStyle(LifeOSColor.warning)
                        }
                        trendChip
                    }
                }
                Spacer()
                Text("\(Int((row.completionRate * 100).rounded()))%")
                    .font(.system(size: 15, weight: .heavy).monospacedDigit())
                    .foregroundStyle(row.tint)
            }
            // Completion-rate meter.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(row.tint.opacity(0.14))
                    Capsule()
                        .fill(row.tint)
                        .frame(width: max(4, geo.size.width * row.completionRate))
                }
            }
            .frame(height: 6)
        }
    }

    @ViewBuilder
    private var trendChip: some View {
        // Only call out a trend once it crosses a small threshold; tiny
        // wobble around zero isn't worth labeling.
        if abs(row.trend) >= 0.1 {
            let improving = row.trend > 0
            HStack(spacing: 3) {
                Image(systemName: improving ? "arrow.up.right" : "arrow.down.right")
                    .font(.system(size: 8, weight: .heavy))
                Text(improving ? "improving" : "slipping")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(improving ? LifeOSColor.success : LifeOSColor.danger)
        }
    }
}
