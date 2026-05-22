import Foundation
import SwiftData
import Observation

/// One-way sync from SwiftData (source of truth on-device) → the Vercel
/// + Neon backend. Every syncable `@Model` has a `needsSync: Bool`
/// flag. Mutations set it true; this service walks the pending rows,
/// POSTs each to the matching `/api/data/*` route, and flips the flag
/// false on success. Failures stay pending and retry on the next
/// drain (foreground, post-mutation, or on the periodic timer).
///
/// One service instance lives at the app root and is shared via
/// `@Environment`. Call `attach(modelContainer:)` once at launch so
/// the service has a context for its own work.
@MainActor
@Observable
final class SyncService {
    static let shared = SyncService()
    private init() {}

    /// True while a drain pass is running — surfaces a subtle indicator
    /// in the UI if we want one. No-op otherwise.
    private(set) var isDraining = false
    /// Timestamp of the most recent successful drain attempt (may be a
    /// no-op drain). Used to throttle drains triggered by every screen
    /// re-render.
    private(set) var lastDrainAt: Date?

    private var container: ModelContainer?

    /// Wire the service to the app's `ModelContainer`. Must be called
    /// before the first `drainPending()`.
    func attach(modelContainer: ModelContainer) {
        self.container = modelContainer
    }

    /// Drain every syncable type. Cheap to call from any
    /// `onChange`/`onAppear`/foreground hook — throttles to one
    /// concurrent pass.
    func drainPending() async {
        guard !isDraining else { return }
        guard let container else {
            print("[SyncService] not attached — skipping drain")
            return
        }
        // Auth might not be ready yet on the very first launch — bail
        // and let the next trigger try. Once the bearer JWT lands the
        // app's `.task` paths will retry.
        guard AuthStore.shared.isReady else { return }

        isDraining = true
        defer {
            isDraining = false
            lastDrainAt = Date()
        }

        let context = ModelContext(container)
        await pushLiftSessions(in: context)
        await pushHabits(in: context)
        await pushJournalEntries(in: context)
        await pushMeals(in: context)
        try? context.save()
    }

    // MARK: - Lift sessions

    /// `POST /api/data/lift-sessions` shape:
    ///   { date: "YYYY-MM-DD", raw?: string, exercises: ExerciseDTO[] }
    /// The server stores `exercises` as JSONB so we send the same
    /// `WorkoutExercise` shape that the CSV exporter writes locally.
    private func pushLiftSessions(in context: ModelContext) async {
        let predicate = #Predicate<LiftSessionEntry> { $0.needsSync == true }
        let descriptor = FetchDescriptor<LiftSessionEntry>(predicate: predicate)
        guard let rows = try? context.fetch(descriptor), !rows.isEmpty else { return }

        struct ExerciseDTO: Encodable {
            let name: String
            let sets: [SetDTO]
        }
        struct SetDTO: Encodable {
            let weight: Double
            let reps: Int
            let rpe: Double?
            let completed: Bool
            let isDropSet: Bool
        }
        struct Body: Encodable {
            let date: String
            let raw: String?
            let exercises: [ExerciseDTO]
        }
        struct Resp: Decodable { let id: String }

        for row in rows {
            let decoded = CSVExporter.decodeExercises(row.detailsJSON)
            let body = Body(
                date: row.date,
                raw: row.workoutType,
                exercises: decoded.map { ex in
                    ExerciseDTO(name: ex.name, sets: ex.sets.map { s in
                        SetDTO(
                            weight: s.weight,
                            reps: s.reps,
                            rpe: s.rpe,
                            completed: s.completed,
                            isDropSet: s.isDropSet
                        )
                    })
                }
            )
            do {
                let resp: Resp = try await APIClient.shared.post(
                    "/api/data/lift-sessions",
                    body: body,
                    as: Resp.self
                )
                row.serverID = resp.id
                row.needsSync = false
            } catch {
                print("[SyncService] lift-session push failed: \(error)")
            }
        }
    }

    // MARK: - Habits

    /// `POST /api/data/habits` creates a new habit. We send one POST per
    /// pending row. Habit toggles (completedDates) aren't supported by
    /// this endpoint yet — the create route is enough to round-trip the
    /// row's existence; per-day check-offs will land on `habit-logs`
    /// once that flow is wired.
    private func pushHabits(in context: ModelContext) async {
        let predicate = #Predicate<HabitEntry> { $0.needsSync == true }
        let descriptor = FetchDescriptor<HabitEntry>(predicate: predicate)
        guard let rows = try? context.fetch(descriptor), !rows.isEmpty else { return }

        struct Body: Encodable {
            let name: String
            let icon: String
            let order: Int
        }
        struct Resp: Decodable { let id: String }

        for row in rows {
            let body = Body(name: row.name, icon: row.icon, order: row.order)
            do {
                let resp: Resp = try await APIClient.shared.post(
                    "/api/data/habits",
                    body: body,
                    as: Resp.self
                )
                row.serverID = resp.id
                row.needsSync = false
            } catch {
                print("[SyncService] habit push failed: \(error)")
            }
        }
    }

    // MARK: - Journal entries

    /// `POST /api/data/journal` creates a journal entry. Backend shape:
    ///   { date, text, source: "manual"|"voice"|..., mood?, energy?, ... }
    private func pushJournalEntries(in context: ModelContext) async {
        let predicate = #Predicate<JournalEntry> { $0.needsSync == true }
        let descriptor = FetchDescriptor<JournalEntry>(predicate: predicate)
        guard let rows = try? context.fetch(descriptor), !rows.isEmpty else { return }

        struct Body: Encodable {
            let date: String
            let text: String
            let source: String
            let mood: Int?
        }
        struct Resp: Decodable { let id: String }

        for row in rows {
            let body = Body(
                date: row.date,
                text: row.body,
                source: "manual",
                mood: row.moodScore
            )
            do {
                let resp: Resp = try await APIClient.shared.post(
                    "/api/data/journal",
                    body: body,
                    as: Resp.self
                )
                row.serverID = resp.id
                row.needsSync = false
            } catch {
                print("[SyncService] journal push failed: \(error)")
            }
        }
    }

    // MARK: - Meals

    /// `POST /api/data/meals` creates a meal log. Backend expects:
    ///   { date, time, name, calories, protein, carbs?, fat? }
    /// `time` is "HH:MM" derived from `loggedAt` in the device's
    /// current locale.
    private func pushMeals(in context: ModelContext) async {
        let predicate = #Predicate<MealLog> { $0.needsSync == true }
        let descriptor = FetchDescriptor<MealLog>(predicate: predicate)
        guard let rows = try? context.fetch(descriptor), !rows.isEmpty else { return }

        struct Body: Encodable {
            let date: String
            let time: String
            let name: String
            let calories: Double
            let protein: Double
            let carbs: Double?
            let fat: Double?
        }
        struct Resp: Decodable { let id: String }

        let timeFmt: DateFormatter = {
            let f = DateFormatter()
            f.dateFormat = "HH:mm"
            return f
        }()

        for row in rows {
            let body = Body(
                date: row.date,
                time: timeFmt.string(from: row.loggedAt),
                name: row.name,
                calories: row.calories,
                protein: row.proteinG,
                carbs: row.carbsG,
                fat: row.fatG
            )
            do {
                let resp: Resp = try await APIClient.shared.post(
                    "/api/data/meals",
                    body: body,
                    as: Resp.self
                )
                row.serverID = resp.id
                row.needsSync = false
            } catch {
                print("[SyncService] meal push failed: \(error)")
            }
        }
    }
}
