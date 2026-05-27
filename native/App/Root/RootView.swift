import SwiftUI
import SwiftData

/// Top-level navigation. Custom Liquid Glass tab bar floats above the
/// content; the tab content lives in a single ZStack so transitions
/// between tabs cross-fade with a subtle scale rather than the stock
/// TabView's hard switch. The AmbientBackground layer behind
/// everything carries a slow mesh-gradient drift so the screen never
/// reads as flat black.
///
/// First-run gate: a `@Query` on UserSettings drives whether we show
/// the onboarding flow or the tabs. When OnboardingFlow flips
/// `hasOnboarded`, SwiftData re-publishes the query and this view
/// cross-fades into the tab UI without any manual state plumbing.
struct RootView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var settingsRows: [UserSettings]
    @State private var selection: RootTab = .today

    var body: some View {
        Group {
            if let settings = settingsRows.first, !settings.hasOnboarded {
                OnboardingFlow(settings: settings)
                    .transition(.opacity)
            } else if settingsRows.isEmpty {
                // First launch before the singleton row materializes —
                // create it, which re-fires the query into onboarding.
                Color.clear
                    .onAppear { _ = UserSettings.loadOrCreate(in: modelContext) }
            } else {
                tabs
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: settingsRows.first?.hasOnboarded)
    }

    private var tabs: some View {
        ZStack(alignment: .bottom) {
            AmbientBackground()
            content
                .padding(.bottom, 8)
            LiquidGlassTabBar(selection: $selection)
                .padding(.bottom, 6)
                .shadow(color: .black.opacity(0.32), radius: 24, x: 0, y: 14)
        }
        .ignoresSafeArea(.keyboard)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private var content: some View {
        ZStack {
            screen(for: .today)
                .opacity(selection == .today ? 1 : 0)
            screen(for: .nutrition)
                .opacity(selection == .nutrition ? 1 : 0)
            screen(for: .habits)
                .opacity(selection == .habits ? 1 : 0)
            screen(for: .gym)
                .opacity(selection == .gym ? 1 : 0)
            screen(for: .analysis)
                .opacity(selection == .analysis ? 1 : 0)
        }
        .animation(.easeInOut(duration: 0.22), value: selection)
    }

    @ViewBuilder
    private func screen(for tab: RootTab) -> some View {
        switch tab {
        case .today:     TodayView()
        case .nutrition: NutritionView()
        case .habits:    HabitsView()
        case .gym:       GymView()
        case .analysis:  AnalysisView()
        }
    }
}

#Preview {
    RootView()
        .preferredColorScheme(.dark)
        .modelContainer(for: UserSettings.self, inMemory: true)
}
