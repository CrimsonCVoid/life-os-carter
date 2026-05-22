import SwiftUI

/// Top-level tab navigation. Five tabs match the Next.js BottomNav:
/// Today, Nutrition, Habits, Gym, Stats. Settings lives behind a gear
/// icon in the top bar rather than its own tab (iOS HIG: tabs are for
/// primary destinations).
struct RootView: View {
    @State private var selection: Tab = .today

    enum Tab: String, Hashable {
        case today, nutrition, habits, gym, stats
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

            StatsView()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }
                .tag(Tab.stats)
        }
        .tint(LifeOSColor.accent)
        .background(LifeOSColor.base.ignoresSafeArea())
    }
}

#Preview {
    RootView()
        .preferredColorScheme(.dark)
}
