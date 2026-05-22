import SwiftUI
import SwiftData

@main
struct LifeOSApp: App {
    @State private var workoutStore = ActiveWorkoutStore()
    private let commandConsumer = WorkoutCommandConsumer()

    // SwiftData container — local-first persistence for everything the
    // user logs offline. Mirrors the Zustand store shape from the Next.js
    // version. Backend sync via APIClient happens opportunistically when
    // the user is signed in + online.
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            DailyEntry.self,
            HabitEntry.self,
            JournalEntry.self,
            MealLog.self,
            LiftSessionEntry.self,
        ])
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .none
        )
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            // Falling back to in-memory keeps the UI alive instead of
            // crashing on a corrupt store. The user can re-sync from
            // server on next sign-in.
            print("[LifeOS] SwiftData container failed, falling back to in-memory: \(error)")
            return try! ModelContainer(
                for: schema,
                configurations: [ModelConfiguration(isStoredInMemoryOnly: true)]
            )
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .tint(LifeOSColor.accent)
                .environment(workoutStore)
                .onAppear {
                    Task { await HealthKitManager.shared.requestAuthorization() }
                    Haptics.prepareAll()
                    // Drain Live Activity intent commands from the widget
                    // process into the workout store.
                    commandConsumer.start { cmd in
                        workoutStore.apply(cmd)
                    }
                }
        }
        .modelContainer(sharedModelContainer)
    }
}
