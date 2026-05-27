import SwiftUI
import SwiftData

@main
struct LifeOSApp: App {
    @State private var workoutStore = ActiveWorkoutStore()
    @State private var auth = AuthStore.shared
    @State private var syncService = SyncService.shared
    @Environment(\.scenePhase) private var scenePhase
    private let commandConsumer = WorkoutCommandConsumer()

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            DailyEntry.self,
            HabitEntry.self,
            JournalEntry.self,
            MealLog.self,
            LiftSessionEntry.self,
            PersonalRecord.self,
            UserSettings.self,
            SavedMeal.self,
            WorkoutTemplate.self,
            HRDaySeries.self,
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
            RootView()
                .tint(LifeOSColor.accent)
                .environment(workoutStore)
                .environment(auth)
                .environment(syncService)
                .onAppear {
                    Haptics.prepareAll()
                    WorkoutTemplateSeeds.seedIfNeeded(in: sharedModelContainer.mainContext)
                    Task {
                        // HealthKit authorization is harmless to request even
                        // for users on Google Health — they just decline. The
                        // unified HealthSync respects the user's chosen source.
                        await HealthKitManager.shared.requestAuthorization()
                        await HealthSync.syncToday(in: sharedModelContainer.mainContext)
                    }
                    Task {
                        await auth.ensureSignedIn()
                        syncService.attach(modelContainer: sharedModelContainer)
                        await syncService.drainPending()
                    }
                    commandConsumer.start { cmd in
                        workoutStore.apply(cmd)
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        Task {
                            await auth.ensureSignedIn()
                            await syncService.drainPending()
                            // Re-check Google Health connection after a
                            // background → foreground cycle so returning
                            // from the Safari OAuth handoff flips the
                            // connected flag without needing a Settings
                            // visit.
                            await GoogleHealthClient.shared.refreshConnectionStatus(
                                in: sharedModelContainer.mainContext
                            )
                        }
                    }
                }
                .onOpenURL { url in
                    // Google Health OAuth callback returns the user to
                    // the app via the lifeos:// scheme. The host tells
                    // us which integration to refresh.
                    Task {
                        await GoogleHealthClient.shared.handleReturn(
                            url: url,
                            in: sharedModelContainer.mainContext
                        )
                    }
                }
        }
        .modelContainer(sharedModelContainer)
    }
}
