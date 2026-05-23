import Foundation
import SwiftData
import UIKit

/// Thin iOS client for the existing `/api/google-health/*` server
/// routes that proxy Fitbit and Pixel Watch data through Google's
/// Health API (Google bought Fitbit; the old Fitbit Web API is
/// deprecated).
///
/// Connection flow:
///   1. User taps "Connect Google Health" in Settings →
///      `startAuthFlow()` opens /api/google-health/auth in the system
///      browser. Server runs the OAuth dance and sets an httpOnly
///      cookie on the response.
///   2. iOS app comes back to foreground after consent → on next
///      Today appear, `syncToday(in:)` runs.
///   3. `syncToday(in:)` POSTs /api/google-health/sync. Server pulls
///      the last 7 days of sleep/HRV/RHR/steps and returns the
///      latest values; we hydrate them into today's DailyEntry.
///
/// All token storage stays server-side per the original architecture
/// in HANDOFF-NATIVE.md ("client never sees access or refresh
/// tokens — it asks /api/google-health/status for connection
/// metadata and triggers sync via /api/google-health/sync").
@MainActor
final class GoogleHealthClient {
    static let shared = GoogleHealthClient()
    private init() {}

    // MARK: - OAuth handoff

    /// Opens /api/google-health/auth in Safari so the user can consent
    /// to Google's OAuth scopes. We can't keep the user inside the
    /// app — Google blocks OAuth in embedded webviews — so this is a
    /// full-tab handoff. The bearer token is attached via a query
    /// param so the server can attribute the connection to the right
    /// user account.
    func startAuthFlow() {
        guard let token = AuthStore.shared.token else { return }
        let base = APIClient.shared.baseURL.appendingPathComponent("/api/google-health/auth")
        guard var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        comps.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let url = comps.url else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - Status

    struct ConnectionStatus: Decodable {
        let connected: Bool
        let lastSyncAt: Double?
    }

    func fetchStatus() async -> ConnectionStatus? {
        try? await APIClient.shared.get(
            "/api/google-health/status",
            as: ConnectionStatus.self
        )
    }

    func disconnect() async {
        _ = try? await APIClient.shared.delete("/api/google-health/disconnect")
    }

    // MARK: - Sync

    private struct SyncRequest: Encodable { let days: Int }

    private struct SyncResponse: Decodable {
        let connected: Bool?
        let date: String?
        let sleepHours: Double?
        let hrvMs: Double?
        let restingHr: Double?
        let steps: Int?
        let weightLb: Double?
        let activeEnergyKcal: Double?
        let hrvBaseline: Double?
        let rhrBaseline: Double?
    }

    /// Fire the sync request and write whatever the server returns
    /// into today's DailyEntry row + the UserSettings baselines.
    /// Mirrors HealthKitManager.syncToday(in:) so the Today screen
    /// can be source-agnostic: regardless of which side ran, today's
    /// row has fresh values when this returns.
    func syncToday(in ctx: ModelContext) async {
        guard AuthStore.shared.token != nil else { return }
        let body = SyncRequest(days: 7)
        let response: SyncResponse
        do {
            response = try await APIClient.shared.post(
                "/api/google-health/sync",
                body: body,
                as: SyncResponse.self
            )
        } catch {
            print("[GoogleHealth] sync failed: \(error)")
            return
        }

        let todayKey = GHDateFmt.ymd(Date())
        await MainActor.run {
            let descriptor = FetchDescriptor<DailyEntry>(
                predicate: #Predicate { $0.date == todayKey }
            )
            let row = (try? ctx.fetch(descriptor))?.first ?? {
                let r = DailyEntry(date: todayKey)
                ctx.insert(r)
                return r
            }()
            if let v = response.sleepHours    { row.sleepHours = v }
            if let v = response.hrvMs         { row.hrvMs = v }
            if let v = response.restingHr     { row.restingHr = v }
            if let v = response.steps         { row.steps = v }
            if let v = response.weightLb      { row.weightLb = v }

            let settings = UserSettings.loadOrCreate(in: ctx)
            if let v = response.hrvBaseline { settings.hrvBaseline = v }
            if let v = response.rhrBaseline { settings.rhrBaseline = v }
            settings.lastGoogleHealthSyncAt = Date().timeIntervalSince1970 * 1000

            try? ctx.save()
        }
    }
}

private enum GHDateFmt {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    static func ymd(_ d: Date) -> String { formatter.string(from: d) }
}
