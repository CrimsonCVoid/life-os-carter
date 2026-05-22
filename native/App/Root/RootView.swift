import SwiftUI

/// Top-level tab navigation. Five tabs match the existing nav:
/// Today, Nutrition, Habits, Gym, Analysis. Settings lives behind a
/// gear icon in the top bar of Today rather than its own tab (iOS HIG:
/// tabs are for primary destinations).
struct RootView: View {
    @State private var selection: Tab = .today

    enum Tab: String, Hashable {
        case today, nutrition, habits, gym, analysis
    }

    var body: some View {
        TabView(selection: $selection) {
            TodayView()
                .tabItem { Label("Today", systemImage: "house.fill") }
                .tag(Tab.today)

            NutritionView()
                .tabItem { Label("Nutrition", systemImage: "fork.knife") }
                .tag(Tab.nutrition)

            HabitsView()
                .tabItem { Label("Habits", systemImage: "checkmark.circle.fill") }
                .tag(Tab.habits)

            GymView()
                .tabItem { Label("Gym", systemImage: "dumbbell.fill") }
                .tag(Tab.gym)

            AnalysisView()
                .tabItem { Label("Analysis", systemImage: "waveform.path.ecg") }
                .tag(Tab.analysis)
        }
        .tint(LifeOSColor.accent)
        .background(LifeOSColor.base.ignoresSafeArea())
        .onChange(of: selection) { _, _ in
            Haptics.tick()
        }
    }
}

#Preview {
    RootView()
        .preferredColorScheme(.dark)
}
