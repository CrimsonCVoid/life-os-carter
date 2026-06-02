import Foundation
import SwiftData

/// iOS client for the on-demand sleep-segments route. Mirrors
/// `HeartRateClient`: @MainActor singleton, Decodable response structs,
/// fetch-or-create upsert into a `SleepNight` row.
///
/// The passive sync writes per-stage *minutes* onto `DailyEntry`; this
/// fetches the timed *segment* timeline (which stage from when to when)
/// that the hypnogram draws. A night holds dozens of transitions, so the
/// segments live in their own `SleepNight` row with the series JSON-
/// encoded into one column. We only fetch when the user opens the sleep
/// graph, never on the background sync loop.
///
/// `loadNight` returns the decoded value (`Night`) directly in addition
/// to persisting, so callers can render without a live @Query.
@MainActor
final class SleepClient {
    static let shared = SleepClient()
    private init() {}

    // MARK: - Stage

    /// Stage codes match the on-disk + hypnogram convention:
    /// 0 awake, 1 light, 2 deep, 3 rem. `depth` orders the stages on the
    /// hypnogram's y-axis (awake highest, deep lowest) the way Apple
    /// Health / Oura lay them out.
    enum Stage: Int, CaseIterable {
        case awake = 0
        case light = 1
        case deep  = 2
        case rem   = 3

        init(api: String) {
            switch api.uppercased() {
            case "DEEP": self = .deep
            case "REM":  self = .rem
            case "AWAKE", "WAKE": self = .awake
            default:     self = .light
            }
        }

        /// Vertical lane (0 = top). Awake on top, then REM, light, deep
        /// at the bottom — the standard hypnogram ordering.
        var lane: Int {
            switch self {
            case .awake: return 0
            case .rem:   return 1
            case .light: return 2
            case .deep:  return 3
            }
        }

        var label: String {
            switch self {
            case .awake: return "Awake"
            case .rem:   return "REM"
            case .light: return "Light"
            case .deep:  return "Deep"
            }
        }
    }

    // MARK: - Contract types

    private struct Request: Encodable {
        let date: String
    }

    /// Mirrors the `/api/google-health/sleep` response exactly.
    private struct Response: Decodable {
        let date: String
        let segments: [Seg]
        let inBedStartMs: Double
        let wakeEndMs: Double
        let deepMin: Int
        let remMin: Int
        let lightMin: Int
        let awakeMin: Int
    }

    private struct Seg: Decodable {
        let stage: String
        let startMs: Double
        let endMs: Double
    }

    // MARK: - Decoded value model (rendered by the hypnogram)

    /// One timed stage segment, decoded out of the stored JSON.
    struct Segment: Identifiable {
        let stage: Stage
        let start: Date
        let end: Date
        var id: Double { start.timeIntervalSince1970 }
        var durationMin: Double { end.timeIntervalSince(start) / 60 }
    }

    /// A fully-decoded night, suitable for charting.
    struct Night {
        let date: String
        let segments: [Segment]
        let inBed: Date
        let wake: Date
        let deepMin: Int
        let remMin: Int
        let lightMin: Int
        let awakeMin: Int

        var isEmpty: Bool { segments.isEmpty }
        /// Asleep total excludes awake time (matches how trackers report
        /// "time asleep" vs "time in bed").
        var asleepMin: Int { deepMin + remMin + lightMin }
        var inBedMin: Int { asleepMin + awakeMin }
        /// Sleep efficiency — asleep / in-bed, 0...1. nil when in-bed is 0.
        var efficiency: Double? {
            let bed = inBedMin
            return bed > 0 ? Double(asleepMin) / Double(bed) : nil
        }
    }

    // MARK: - Storage shape (what lands in segmentsJSON)

    /// Compact on-disk representation — short keys keep the blob small.
    /// `s` = stage code, `a` = start epoch-ms, `b` = end epoch-ms.
    private struct StoredSeg: Codable {
        let s: Int
        let a: Double
        let b: Double
    }

    // MARK: - Fetch + persist

    /// Load the night's timed stage segments from whichever health source
    /// the user is on, upsert the `SleepNight` row, and return the decoded
    /// `Night`. Apple Health users read HealthKit's `.sleepAnalysis` samples
    /// locally (no server, no auth); Google Health (Fitbit/Pixel) users hit
    /// the sync endpoint. "manual" has no stage source, so returns nil.
    @discardableResult
    func loadNight(_ date: String, in ctx: ModelContext) async -> Night? {
        let source = UserSettings.loadOrCreate(in: ctx).healthDataSource
        if source == "apple_health" {
            return await loadNightFromHealthKit(date, in: ctx)
        }
        guard source == "google_health" else { return nil }
        guard AuthStore.shared.token != nil else { return nil }

        let response: Response
        do {
            response = try await APIClient.shared.post(
                "/api/google-health/sleep",
                body: Request(date: date),
                as: Response.self
            )
        } catch {
            print("[Sleep] loadNight failed: \(error)")
            return nil
        }

        let stored = response.segments.map {
            StoredSeg(s: Stage(api: $0.stage).rawValue, a: $0.startMs, b: $0.endMs)
        }
        let segmentsJSON = (try? JSONEncoder().encode(stored))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"

        upsert(
            date: response.date,
            segmentsJSON: segmentsJSON,
            inBedStartMs: response.inBedStartMs,
            wakeEndMs: response.wakeEndMs,
            deepMin: response.deepMin,
            remMin: response.remMin,
            lightMin: response.lightMin,
            awakeMin: response.awakeMin,
            in: ctx
        )

        return night(
            date: response.date,
            segments: response.segments.map {
                Segment(
                    stage: Stage(api: $0.stage),
                    start: Date(timeIntervalSince1970: $0.startMs / 1000),
                    end: Date(timeIntervalSince1970: $0.endMs / 1000)
                )
            },
            inBedStartMs: response.inBedStartMs,
            wakeEndMs: response.wakeEndMs,
            deepMin: response.deepMin,
            remMin: response.remMin,
            lightMin: response.lightMin,
            awakeMin: response.awakeMin
        )
    }

    /// Build the night from Apple HealthKit's timed `.sleepAnalysis`
    /// samples for the night ending on `date`, upsert, and return it. An
    /// empty result still writes a zeroed row so the view shows a real
    /// "no stage data" state rather than spinning (e.g. iPhone-only users
    /// who have in-bed time but no Apple Watch stage breakdown).
    private func loadNightFromHealthKit(_ date: String, in ctx: ModelContext) async -> Night? {
        guard let day = Self.dateOnly.date(from: date) else { return nil }
        let samples = await HealthKitManager.shared.fetchSleepSegments(forNightEnding: day)

        let segments: [Segment] = samples.map {
            Segment(
                stage: Stage(rawValue: $0.stageCode) ?? .light,
                start: $0.start,
                end: $0.end
            )
        }

        var deep = 0.0, rem = 0.0, light = 0.0, awake = 0.0
        for s in segments {
            switch s.stage {
            case .deep:  deep += s.durationMin
            case .rem:   rem += s.durationMin
            case .light: light += s.durationMin
            case .awake: awake += s.durationMin
            }
        }
        let inBedMs = (segments.first?.start.timeIntervalSince1970 ?? 0) * 1000
        let wakeMs = (segments.last?.end.timeIntervalSince1970 ?? 0) * 1000

        let stored = segments.map {
            StoredSeg(
                s: $0.stage.rawValue,
                a: $0.start.timeIntervalSince1970 * 1000,
                b: $0.end.timeIntervalSince1970 * 1000
            )
        }
        let segmentsJSON = (try? JSONEncoder().encode(stored))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"

        upsert(
            date: date,
            segmentsJSON: segmentsJSON,
            inBedStartMs: inBedMs,
            wakeEndMs: wakeMs,
            deepMin: Int(deep),
            remMin: Int(rem),
            lightMin: Int(light),
            awakeMin: Int(awake),
            in: ctx
        )

        return night(
            date: date,
            segments: segments,
            inBedStartMs: inBedMs,
            wakeEndMs: wakeMs,
            deepMin: Int(deep),
            remMin: Int(rem),
            lightMin: Int(light),
            awakeMin: Int(awake)
        )
    }

    private static let dateOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Read a previously-persisted night back out of SwiftData so the
    /// view can render instantly before the network refresh. Returns nil
    /// when no row exists.
    func cachedNight(_ date: String, in ctx: ModelContext) -> Night? {
        guard let row = fetchRow(date: date, in: ctx) else { return nil }
        return night(
            date: row.date,
            segments: Self.decodeSegments(row.segmentsJSON),
            inBedStartMs: row.inBedStartMs,
            wakeEndMs: row.wakeEndMs,
            deepMin: row.deepMin,
            remMin: row.remMin,
            lightMin: row.lightMin,
            awakeMin: row.awakeMin
        )
    }

    // MARK: - Decode helper

    /// Read the stored segment series back out as chartable segments.
    /// Returns an empty array on malformed/empty JSON.
    static func decodeSegments(_ json: String) -> [Segment] {
        guard let data = json.data(using: .utf8),
              let stored = try? JSONDecoder().decode([StoredSeg].self, from: data)
        else { return [] }
        return stored.map {
            Segment(
                stage: Stage(rawValue: $0.s) ?? .light,
                start: Date(timeIntervalSince1970: $0.a / 1000),
                end: Date(timeIntervalSince1970: $0.b / 1000)
            )
        }
    }

    // MARK: - Builders

    private func night(
        date: String,
        segments: [Segment],
        inBedStartMs: Double,
        wakeEndMs: Double,
        deepMin: Int,
        remMin: Int,
        lightMin: Int,
        awakeMin: Int
    ) -> Night {
        Night(
            date: date,
            segments: segments,
            inBed: Date(timeIntervalSince1970: inBedStartMs / 1000),
            wake: Date(timeIntervalSince1970: wakeEndMs / 1000),
            deepMin: deepMin,
            remMin: remMin,
            lightMin: lightMin,
            awakeMin: awakeMin
        )
    }

    // MARK: - SwiftData helpers

    private func fetchRow(date: String, in ctx: ModelContext) -> SleepNight? {
        let descriptor = FetchDescriptor<SleepNight>(
            predicate: #Predicate { $0.date == date }
        )
        return (try? ctx.fetch(descriptor))?.first
    }

    private func upsert(
        date: String,
        segmentsJSON: String,
        inBedStartMs: Double,
        wakeEndMs: Double,
        deepMin: Int,
        remMin: Int,
        lightMin: Int,
        awakeMin: Int,
        in ctx: ModelContext
    ) {
        let row = fetchRow(date: date, in: ctx) ?? {
            let r = SleepNight(date: date)
            ctx.insert(r)
            return r
        }()
        row.segmentsJSON = segmentsJSON
        row.inBedStartMs = inBedStartMs
        row.wakeEndMs = wakeEndMs
        row.deepMin = deepMin
        row.remMin = remMin
        row.lightMin = lightMin
        row.awakeMin = awakeMin
        row.updatedAt = Date()
        try? ctx.save()
    }
}
