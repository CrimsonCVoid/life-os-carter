import SwiftUI
import SwiftData

/// Insights — the on-device intelligence feed. Mines the full history
/// with `InsightsEngine` (deterministic, instant, no AI/network) and
/// surfaces the ranked findings as `InsightCard`s, grouped by sentiment
/// so what needs attention leads, wins reinforce, and context fills in.
///
/// Pure read surface: recomputes the snapshot on appear and whenever a
/// daily / meal / lift / habit row arrives. The engine is cheap enough
/// to run synchronously on the main actor at these data sizes.
struct InsightsView: View {
    @Query private var dailies: [DailyEntry]
    @Query private var meals: [MealLog]
    @Query private var lifts: [LiftSessionEntry]
    @Query private var habits: [HabitEntry]
    @Query private var settingsRows: [UserSettings]

    @State private var insights: [DataInsight] = []
    @State private var levers: [LeversBoard] = []
    @State private var cardsVisible = false

    private var settings: UserSettings? { settingsRows.first }

    /// Watch-first ordering: things to address, then wins, then context.
    private var watch: [DataInsight]    { insights.filter { $0.sentiment == .watch } }
    private var positive: [DataInsight] { insights.filter { $0.sentiment == .positive } }
    private var neutral: [DataInsight]  { insights.filter { $0.sentiment == .neutral } }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                if !levers.isEmpty {
                    LeversCard(boards: levers)
                        .cascadeReveal(index: 0, visible: cardsVisible)
                }
                if insights.isEmpty && levers.isEmpty {
                    emptyState
                } else {
                    feed
                }
                Spacer(minLength: 80)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(AmbientBackground().ignoresSafeArea())
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            recompute()
            if !cardsVisible {
                withAnimation(.easeOut(duration: 0.5)) { cardsVisible = true }
            }
        }
        .onChange(of: dailies.count) { _, _ in recompute() }
        .onChange(of: meals.count)   { _, _ in recompute() }
        .onChange(of: lifts.count)   { _, _ in recompute() }
        .onChange(of: habits.count)  { _, _ in recompute() }
    }

    private func recompute() {
        guard let settings else { insights = []; levers = []; return }
        insights = InsightsEngine.generate(
            daily: dailies,
            meals: meals,
            lifts: lifts,
            habits: habits,
            settings: settings
        )
        levers = InsightsEngine.levers(daily: dailies, meals: meals, lifts: lifts, settings: settings)
    }

    // MARK: - Feed

    /// One group of insights plus the running cascade offset so the
    /// reveal staggers continuously across groups rather than restarting.
    private struct Group: Identifiable {
        let id: String
        let title: String
        let tint: Color
        let items: [DataInsight]
        let cascadeOffset: Int
    }

    private var groups: [Group] {
        var out: [Group] = []
        var offset = 0
        func add(_ id: String, _ title: String, _ tint: Color, _ items: [DataInsight]) {
            guard !items.isEmpty else { return }
            out.append(Group(id: id, title: title, tint: tint, items: items, cascadeOffset: offset))
            offset += items.count
        }
        add("watch", "Worth a look", LifeOSColor.warning, watch)
        add("positive", "What's working", LifeOSColor.success, positive)
        add("neutral", "Context", LifeOSColor.fg2, neutral)
        return out
    }

    @ViewBuilder
    private var feed: some View {
        ForEach(groups) { group in
            SectionLabel(group.title) {
                Text("\(group.items.count)")
                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                    .foregroundStyle(group.tint)
            }
            .padding(.top, 4)

            ForEach(Array(group.items.enumerated()), id: \.element.id) { idx, insight in
                InsightCard(insight: insight)
                    .cascadeReveal(index: group.cascadeOffset + idx, visible: cardsVisible)
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        EmptyStateCard(
            icon: "sparkles.rectangle.stack.fill",
            title: "Insights are warming up",
            subtitle: "Log your days for a couple of weeks — sleep, mood, energy, and your evening habit flags — and on-device pattern detection will surface what's actually moving your recovery, mood, and energy. No data leaves your phone.",
            tint: LifeOSColor.accent
        )
        .padding(.top, 24)
    }
}
