import Foundation
import SwiftData
import UIKit

/// iOS client for the server-side Google Health integration that
/// proxies Fitbit + Pixel Watch data through Google's Health API.
/// (Google acquired Fitbit; the legacy Fitbit Web API is deprecated.)
///
/// Architecture summary — important to understand before changing:
///   - Tokens live in the Neon `integrations` table, encrypted at
///     rest via lib/db/encryption.ts. They are NOT in browser
///     cookies (iOS can't see those).
///   - OAuth user attribution is signed-state JWT: /auth/start
///     accepts the iOS Bearer JWT in a `bearer=` query, mints a
///     state JWT containing the userId, embeds in the Google `state`
///     param, and the /callback decodes it to attribute tokens to
///     the right user.
///   - Connection completes via the `lifeos://google-health/connected`
///     deep link. LifeOSApp handles `.onOpenURL` and asks this client
///     to refresh status, which writes through to UserSettings.
///   - Sync route returns `{ updates: [{date, fields}], syncedAt,
///     range, persisted, partialErrors? }`. The decoder below mirrors
///     that exact shape and hydrates today's DailyEntry from the
///     matching `updates[]` row.
@MainActor
final class GoogleHealthClient {
    static let shared = GoogleHealthClient()
    private init() {}

    // MARK: - OAuth handoff

    /// Opens `/api/google-health/auth/start?bearer=…&client=ios` in
    /// Safari so the user can grant Google consent. The server-side
    /// signed-state JWT pins the OAuth flow to this user, and the
    /// callback redirects back into the app via `lifeos://`.
    func startAuthFlow() {
        guard let token = AuthStore.shared.token else { return }
        let base = APIClient.shared.baseURL.appendingPathComponent("/api/google-health/auth/start")
        guard var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        comps.queryItems = [
            URLQueryItem(name: "bearer", value: token),
            URLQueryItem(name: "client", value: "ios"),
        ]
        guard let url = comps.url else { return }
        UIApplication.shared.open(url)
    }

    /// Called from LifeOSApp's `.onOpenURL` when the user returns
    /// from the Safari OAuth handoff. The URL is
    /// `lifeos://google-health/connected?gh=connected` on success
    /// and `lifeos://google-health/connected?gh=error&reason=…` on
    /// failure. We don't trust the query params — just refresh
    /// status from the server to find out the real state.
    func handleReturn(url: URL, in ctx: ModelContext) async {
        guard url.scheme == "lifeos", url.host == "google-health" else { return }
        await refreshConnectionStatus(in: ctx)
        // If we just connected, fire an immediate first sync so
        // today's row populates without waiting on the next idle
        // tab switch.
        let settings = UserSettings.loadOrCreate(in: ctx)
        if settings.googleHealthConnected {
            await syncToday(in: ctx, force: true)
        }
    }

    // MARK: - Status

    struct ConnectionStatus: Decodable {
        let connected: Bool
        let email: String?
        let needsReconnect: Bool
        /// ISO-8601 string. Server omits when never synced.
        let lastSyncedAt: String?
    }

    func fetchStatus() async -> ConnectionStatus? {
        try? await APIClient.shared.get(
            "/api/google-health/status",
            as: ConnectionStatus.self
        )
    }

    /// Round-trip /status and flip the local connected flag
    /// accordingly. Called from the Settings card's onAppear so
    /// returning from Safari immediately reflects the new state,
    /// and from RootView's scenePhase active.
    @discardableResult
    func refreshConnectionStatus(in ctx: ModelContext) async -> Bool {
        guard AuthStore.shared.token != nil else { return false }
        let status = await fetchStatus()
        let settings = UserSettings.loadOrCreate(in: ctx)
        let connected = status?.connected ?? false
        if settings.googleHealthConnected != connected {
            settings.googleHealthConnected = connected
        }
        if let iso = status?.lastSyncedAt, let date = Self.iso8601.date(from: iso) {
            settings.lastGoogleHealthSyncAt = date.timeIntervalSince1970 * 1000
        }
        try? ctx.save()
        return connected
    }

    func disconnect(in ctx: ModelContext) async {
        // Server uses POST for disconnect — original client called
        // DELETE which 404'd. Empty body is fine; the route doesn't
        // read it.
        struct Empty: Encodable {}
        struct DisconnectResponse: Decodable { let ok: Bool }
        _ = try? await APIClient.shared.post(
            "/api/google-health/disconnect",
            body: Empty(),
            as: DisconnectResponse.self
        )
        let settings = UserSettings.loadOrCreate(in: ctx)
        settings.googleHealthConnected = false
        settings.lastGoogleHealthSyncAt = nil
        try? ctx.save()
    }

    // MARK: - Sync

    private struct SyncRequest: Encodable {
        let days: Int
    }

    private struct SyncResponse: Decodable {
        let updates: [DayUpdate]
        let syncedAt: String
        let range: Range
        let persisted: Persisted?
        let partialErrors: [String]?
    }

    private struct DayUpdate: Decodable {
        let date: String           // "YYYY-MM-DD"
        let fields: Fields
    }

    /// Mirrors `SyncedFields` on the server (adapter.ts). New fields
    /// from a server-side schema change land here as optional and the
    /// app picks them up automatically on next decode — no client
    /// release required.
    private struct Fields: Decodable {
        let sleepHours: Double?
        let wakeTime: String?
        let sleepStages: SleepStages?
        let steps: Int?
        let weight: Double?               // lb (server converts from kg)
        let restingHeartRate: Double?     // bpm
        let heartRateVariability: Double? // ms (rMSSD-style)
        let cardioLoad: Double?
        let activeEnergyKcal: Double?
        let totalCaloriesKcal: Double?
        let distanceMeters: Double?
        let floors: Int?
        let vo2Max: Double?
    }

    private struct SleepStages: Decodable {
        let lightMin: Int?
        let deepMin: Int?
        let remMin: Int?
        let wakeMin: Int?
    }

    private struct Range: Decodable {
        let startDate: String
        let endDate: String
    }

    private struct Persisted: Decodable {
        let restingHeartRate: Int?
    }

    /// Fire the sync request and write everything matching today's
    /// date into today's DailyEntry. Other dates in `updates[]`
    /// could be persisted too — left as a follow-up since the recovery
    /// baselines compute off DailyEntry history and back-filling those
    /// would change every recovery score retroactively. For now we
    /// only mirror today + leave historical rows untouched.
    func syncToday(in ctx: ModelContext, force: Bool = false) async {
        guard AuthStore.shared.token != nil else { return }
        let settings = UserSettings.loadOrCreate(in: ctx)
        guard settings.googleHealthConnected else { return }

        let body = SyncRequest(days: force ? 30 : 7)
        let response: SyncResponse
        do {
            response = try await APIClient.shared.post(
                "/api/google-health/sync",
                body: body,
                as: SyncResponse.self
            )
        } catch APIClient.APIError.unauthenticated {
            // Server says session expired or needs reconnect. Flip
            // local state so the Settings card surfaces "Reconnect"
            // and we stop retrying on every tab switch.
            settings.googleHealthConnected = false
            try? ctx.save()
            return
        } catch {
            print("[GoogleHealth] sync failed: \(error)")
            return
        }

        // Update the synced-at timestamp regardless of whether any day
        // had data — the round-trip itself succeeded, which is what
        // the UI cares about.
        if let date = Self.iso8601.date(from: response.syncedAt) {
            settings.lastGoogleHealthSyncAt = date.timeIntervalSince1970 * 1000
        }

        // Mirror every returned day into its DailyEntry row, not just
        // today. Fitbit/Pixel data lags — a sync frequently lands only
        // yesterday's resting HR / steps / weight, and dropping the
        // non-today rows meant that data never reached the Today tile or
        // the Analysis history that read DailyEntry.
        for update in response.updates {
            await Self.applyToDailyEntry(
                fields: update.fields,
                date: update.date,
                in: ctx
            )
        }

        // Pull rolling 14-day baselines for recovery math from the
        // synced history, so iOS Recovery score behaves the same on
        // Fitbit users as on Apple Watch users.
        Self.updateBaselines(from: response.updates, settings: settings)
        try? ctx.save()
    }

    // MARK: - Persistence helpers

    private static func applyToDailyEntry(
        fields: Fields,
        date: String,
        in ctx: ModelContext
    ) async {
        await MainActor.run {
            let descriptor = FetchDescriptor<DailyEntry>(
                predicate: #Predicate { $0.date == date }
            )
            let row = (try? ctx.fetch(descriptor))?.first ?? {
                let r = DailyEntry(date: date)
                ctx.insert(r)
                return r
            }()
            if let v = fields.sleepHours       { row.sleepHours = v }
            if let v = fields.steps            { row.steps = v }
            if let v = fields.restingHeartRate { row.restingHr = v }
            if let v = fields.heartRateVariability { row.hrvMs = v }
            if let v = fields.weight           { row.weightLb = v }
            if let v = fields.activeEnergyKcal { row.activeEnergyKcal = v }
            if let v = fields.totalCaloriesKcal { row.totalCaloriesKcal = v }
            if let v = fields.distanceMeters   { row.distanceMeters = v }
            if let v = fields.floors           { row.floors = v }
            if let v = fields.vo2Max           { row.vo2Max = v }
            if let s = fields.sleepStages {
                if let l = s.lightMin { row.sleepLightMin = l }
                if let d = s.deepMin  { row.sleepDeepMin = d }
                if let r = s.remMin   { row.sleepREMMin = r }
                if let w = s.wakeMin  { row.sleepAwakeMin = w }
            }
            try? ctx.save()
        }
    }

    /// 14-day rolling averages of HRV + RHR, computed off the values
    /// the sync just returned. Skipped when fewer than 3 days of data
    /// exist (recovery math falls back to the neutral 50% per-component
    /// score in that window).
    private static func updateBaselines(
        from updates: [DayUpdate],
        settings: UserSettings
    ) {
        let hrvs = updates.compactMap { $0.fields.heartRateVariability }
        let rhrs = updates.compactMap { $0.fields.restingHeartRate }
        if hrvs.count >= 3 {
            settings.hrvBaseline = hrvs.reduce(0, +) / Double(hrvs.count)
        }
        if rhrs.count >= 3 {
            settings.rhrBaseline = rhrs.reduce(0, +) / Double(rhrs.count)
        }
    }

    // MARK: - Date helpers

    private static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
