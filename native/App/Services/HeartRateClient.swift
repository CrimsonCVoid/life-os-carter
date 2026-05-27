import Foundation
import SwiftData

/// iOS client for the on-demand intraday heart-rate route. Mirrors
/// GoogleHealthClient's conventions: @MainActor singleton, Decodable
/// response structs, fetch-or-create upsert into a SwiftData row.
///
/// Unlike the passive sync (which writes day-aggregate fields onto
/// DailyEntry), intraday HR is bulky — up to 1,440 minute buckets per
/// day — so it lives in its own `HRDaySeries` row with the per-minute
/// series JSON-encoded into a single column. We only fetch it when the
/// user opens the heart-rate graph, never on the background sync loop.
///
/// `loadDay` returns the decoded value (`Day`) directly in addition to
/// persisting, so callers can render without depending on a live
/// @Query over HRDaySeries.
@MainActor
final class HeartRateClient {
    static let shared = HeartRateClient()
    private init() {}

    // MARK: - Contract types

    private struct Request: Encodable {
        let date: String
    }

    /// Mirrors the `/api/google-health/heart-rate` response exactly.
    private struct Response: Decodable {
        let date: String
        let samples: [Sample]
        let min: Int
        let max: Int
        let avg: Int
        let count: Int
        let restingHr: Int?
    }

    private struct Sample: Decodable {
        let minute: Int   // minute-of-day, 0...1439
        let avg: Int
        let min: Int
        let max: Int
    }

    // MARK: - Decoded value model (rendered by the graph view)

    /// One per-minute bucket, already decoded out of the stored JSON.
    struct Bucket: Identifiable {
        let minute: Int   // minute-of-day, 0...1439
        let avg: Int
        let min: Int
        let max: Int
        var id: Int { minute }
    }

    /// A fully-decoded day of intraday HR, suitable for charting.
    struct Day {
        let date: String
        let buckets: [Bucket]
        let dayMin: Int
        let dayMax: Int
        let dayAvg: Int
        let count: Int
        let restingHr: Int?

        var isEmpty: Bool { buckets.isEmpty }
    }

    // MARK: - Storage shape (what lands in samplesJSON)

    /// Compact on-disk representation — short keys keep the blob small
    /// since a day can hold ~1,440 of these. Decoded back via
    /// `decodeSamples`.
    private struct StoredBucket: Codable {
        let m: Int
        let avg: Int
        let min: Int
        let max: Int
    }

    // MARK: - Fetch + persist

    /// POST the contract for `date`, decode, upsert the HRDaySeries row
    /// (encoding the per-minute series to JSON), and save. Returns the
    /// decoded `Day` on success, or nil on any failure. Tolerates an
    /// empty `samples` array (writes a row with zeroed aggregates so the
    /// view can show a real "no intraday data" state rather than a
    /// perpetual spinner).
    @discardableResult
    func loadDay(_ date: String, in ctx: ModelContext) async -> Day? {
        guard AuthStore.shared.token != nil else { return nil }

        let response: Response
        do {
            response = try await APIClient.shared.post(
                "/api/google-health/heart-rate",
                body: Request(date: date),
                as: Response.self
            )
        } catch {
            print("[HeartRate] loadDay failed: \(error)")
            return nil
        }

        let stored = response.samples.map {
            StoredBucket(m: $0.minute, avg: $0.avg, min: $0.min, max: $0.max)
        }
        let samplesJSON = (try? JSONEncoder().encode(stored))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"

        upsert(
            date: response.date,
            samplesJSON: samplesJSON,
            dayMin: response.min,
            dayMax: response.max,
            dayAvg: response.avg,
            count: response.count,
            restingHr: response.restingHr,
            in: ctx
        )

        return Day(
            date: response.date,
            buckets: response.samples.map {
                Bucket(minute: $0.minute, avg: $0.avg, min: $0.min, max: $0.max)
            },
            dayMin: response.min,
            dayMax: response.max,
            dayAvg: response.avg,
            count: response.count,
            restingHr: response.restingHr
        )
    }

    /// Read a previously-persisted day back out of SwiftData (e.g. to
    /// render instantly before the network round-trip refreshes it).
    /// Returns nil when no row exists.
    func cachedDay(_ date: String, in ctx: ModelContext) -> Day? {
        guard let row = fetchRow(date: date, in: ctx) else { return nil }
        return Day(
            date: row.date,
            buckets: Self.decodeSamples(row.samplesJSON),
            dayMin: row.dayMin,
            dayMax: row.dayMax,
            dayAvg: row.dayAvg,
            count: row.count,
            restingHr: row.restingHr
        )
    }

    // MARK: - Decode helper

    /// Read the stored per-minute series back out as chartable buckets.
    /// Returns an empty array on malformed/empty JSON.
    static func decodeSamples(_ json: String) -> [Bucket] {
        guard let data = json.data(using: .utf8),
              let stored = try? JSONDecoder().decode([StoredBucket].self, from: data)
        else { return [] }
        return stored.map {
            Bucket(minute: $0.m, avg: $0.avg, min: $0.min, max: $0.max)
        }
    }

    // MARK: - SwiftData helpers

    private func fetchRow(date: String, in ctx: ModelContext) -> HRDaySeries? {
        let descriptor = FetchDescriptor<HRDaySeries>(
            predicate: #Predicate { $0.date == date }
        )
        return (try? ctx.fetch(descriptor))?.first
    }

    private func upsert(
        date: String,
        samplesJSON: String,
        dayMin: Int,
        dayMax: Int,
        dayAvg: Int,
        count: Int,
        restingHr: Int?,
        in ctx: ModelContext
    ) {
        let row = fetchRow(date: date, in: ctx) ?? {
            let r = HRDaySeries(date: date)
            ctx.insert(r)
            return r
        }()
        row.samplesJSON = samplesJSON
        row.dayMin = dayMin
        row.dayMax = dayMax
        row.dayAvg = dayAvg
        row.count = count
        row.restingHr = restingHr
        row.updatedAt = Date()
        try? ctx.save()
    }
}
