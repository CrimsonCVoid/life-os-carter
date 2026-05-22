import SwiftUI
import SwiftData

@main
struct LifeOSApp: App {
    @State private var workoutStore = ActiveWorkoutStore()
    @State private var auth = AuthStore.shared
    private let commandConsumer = WorkoutCommandConsumer()

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            DailyEntry.self,
            HabitEntry.self,
            JournalEntry.self,
            MealLog.self,
            LiftSessionEntry.self,
            PersonalRecord.self,
        ])
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .none
        )
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            print("[LifeOS] SwiftData container failed: \(error)")
            return try! ModelContainer(
                for: schema,
                configurations: [ModelConfiguration(isStoredInMemoryOnly: true)]
            )
        }
    }()

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.isSignedIn {
                    RootView()
                        .transition(.opacity)
                } else {
                    SignInView()
                        .transition(.opacity)
                }
            }
            .preferredColorScheme(.dark)
            .tint(LifeOSColor.accent)
            .environment(workoutStore)
            .environment(auth)
            .animation(.easeInOut(duration: 0.35), value: auth.isSignedIn)
            .onAppear {
                Task { await HealthKitManager.shared.requestAuthorization() }
                Haptics.prepareAll()
                commandConsumer.start { cmd in
                    workoutStore.apply(cmd)
                }
            }
        }
        .modelContainer(sharedModelContainer)
    }
}
