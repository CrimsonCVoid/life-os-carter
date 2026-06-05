import Foundation
import SwiftUI

/// On-device training-periodization analytics off completed LiftSessionEntry
/// rows. @MainActor (CSVExporter.decodeExercises is main-actor). Pure of its
/// inputs apart from `asOf`. Small-N honest — every section gates on a real
/// sample and returns empty rather than guessing.
struct PeriodizationSnapshot {
    /// Weekly volume by muscle group, last `weeks` ISO weeks (oldest → newest).
    let weeklyVolume: [WeekVolume]
    /// Per-lift estimated-1RM progression, top `maxLifts` by data density.
    let liftProgressions: [LiftProgression]
    /// PR timeline — chronological PersonalRecord highlights (1RM bumps).
    let prTimeline: [PRMilestone]
    /// Detected current phase off ACWR + 3-week volume slope.
    let phase: Phase
    let phaseRationale: String
    /// Deload suggestion when the gate fires (sustained ramp + high ACWR/monotony).
    let deload: DeloadSuggestion?

    struct WeekVolume: Identifiable, Hashable {
        let id: Date            // week-start (Mon), continuous-x safe
        let weekStart: Date
        let total: Double
        let byMuscle: [MuscleVolume]
    }
    struct MuscleVolume: Identifiable, Hashable {
        var id: String { muscle.rawValue }
        let muscle: ExerciseCatalogItem.Muscle
        let volume: Double
    }
    struct LiftProgression: Identifiable, Hashable {
        let id: String          // exercise display name
        let name: String
        let points: [TrendPoint]     // value = best-set estimated 1RM that day
        let startE1RM: Double
        let currentE1RM: Double
        var deltaPct: Double { startE1RM > 0 ? (currentE1RM - startE1RM) / startE1RM * 100 : 0 }
    }
    struct PRMilestone: Identifiable, Hashable {
        let id: Date
        let day: Date
        let exercise: String
        let e1RM: Double
        let gainLb: Double       // over the previous best for this lift
    }
    enum Phase: String {
        case accumulation = "Accumulation"
        case intensification = "Intensification"
        case deload = "Deload"
        case maintenance = "Maintenance"
        case building = "Building"
        var tint: Color {
            switch self {
            case .accumulation: return LifeOSColor.Metric.strain
            case .intensification: return LifeOSColor.warning
            case .deload: return LifeOSColor.success
            case .maintenance, .building: return LifeOSColor.Metric.peak
            }
        }
        var icon: String {
            switch self {
            case .accumulation: return "chart.line.uptrend.xyaxis"
            case .intensification: return "flame.fill"
            case .deload: return "arrow.down.circle.fill"
            case .maintenance: return "equal.circle.fill"
            case .building: return "hammer.fill"
            }
        }
    }
    struct DeloadSuggestion {
        let reason: String
        let confident: Bool
    }

    static let empty = PeriodizationSnapshot(
        weeklyVolume: [], liftProgressions: [], prTimeline: [],
        phase: .building, phaseRationale: "Log a few weeks of training to detect your phase.",
        deload: nil
    )
}

@MainActor
enum PeriodizationEngine {

    static func compute(
        sessions: [LiftSessionEntry],
        prs: [PersonalRecord],
        acwr: Double?,
        monotony: Double?,
        weeks: Int = 12,
        maxLifts: Int = 4,
        asOf: Date = Date()
    ) -> PeriodizationSnapshot {
        guard !sessions.isEmpty else { return .empty }
        let cal = Calendar(identifier: .iso8601)
        let today = cal.startOfDay(for: asOf)

        // ---- Weekly volume by muscle (last `weeks` ISO weeks)
        func weekStart(_ d: Date) -> Date {
            cal.dateInterval(of: .weekOfYear, for: d)?.start ?? cal.startOfDay(for: d)
        }
        let cutoff = cal.date(byAdding: .weekOfYear, value: -weeks, to: today) ?? today
        var perWeek: [Date: [ExerciseCatalogItem.Muscle: Double]] = [:]
        for s in sessions where s.startedAt >= cutoff {
            let ws = weekStart(s.startedAt)
            for ex in CSVExporter.decodeExercises(s.detailsJSON) {
                guard let m = MuscleResolver.resolve(ex.name) else { continue }
                let vol = ex.sets.filter(\.completed).reduce(0.0) { $0 + $1.weight * Double($1.reps) }
                perWeek[ws, default: [:]][m, default: 0] += vol
            }
        }
        let weeklyVolume: [PeriodizationSnapshot.WeekVolume] = perWeek
            .map { ws, byM in
                let mv = byM.filter { $0.value > 0 }
                    .map { PeriodizationSnapshot.MuscleVolume(muscle: $0.key, volume: $0.value) }
                    .sorted { $0.volume > $1.volume }
                return .init(id: ws, weekStart: ws, total: mv.reduce(0) { $0 + $1.volume }, byMuscle: mv)
            }
            .sorted { $0.weekStart < $1.weekStart }

        // ---- Per-lift e1RM progression (≥ 4 distinct days)
        var byLift: [String: [Date: Double]] = [:]
        for s in sessions where s.startedAt >= cutoff {
            let day = cal.startOfDay(for: s.startedAt)
            for ex in CSVExporter.decodeExercises(s.detailsJSON) {
                let best = ex.sets.filter { $0.completed && $0.weight > 0 }
                    .map { estimate1RM(weight: $0.weight, reps: $0.reps) }.max() ?? 0
                guard best > 0 else { continue }
                byLift[ex.name, default: [:]][day] = max(byLift[ex.name]?[day] ?? 0, best)
            }
        }
        let progressions: [PeriodizationSnapshot.LiftProgression] = byLift
            .compactMap { name, dayMap -> PeriodizationSnapshot.LiftProgression? in
                guard dayMap.count >= 4 else { return nil }
                let pts = dayMap.map { TrendPoint(day: $0.key, value: $0.value) }
                    .sorted { $0.day < $1.day }
                return .init(id: name, name: name, points: pts,
                             startE1RM: pts.first!.value, currentE1RM: pts.last!.value)
            }
            .sorted { $0.points.count > $1.points.count }
            .prefix(maxLifts).map { $0 }

        // ---- PR timeline (1RM bumps, chronological, last `weeks`)
        let oneRMs = prs.filter { $0.prKind == .oneRepMax && $0.achievedAt >= cutoff }
            .sorted { $0.achievedAt < $1.achievedAt }
        var running: [String: Double] = [:]
        var prTimeline: [PeriodizationSnapshot.PRMilestone] = []
        for pr in oneRMs {
            let prev = running[pr.exerciseKey] ?? 0
            let gain = prev > 0 ? pr.value - prev : pr.value
            running[pr.exerciseKey] = max(prev, pr.value)
            prTimeline.append(.init(id: pr.achievedAt, day: pr.achievedAt,
                                    exercise: pr.exerciseDisplayName, e1RM: pr.value, gainLb: gain))
        }
        prTimeline = Array(prTimeline.suffix(8).reversed())   // newest first, cap 8

        // ---- Phase detection + deload
        let (phase, rationale) = detectPhase(weeklyVolume: weeklyVolume, acwr: acwr)
        let deload = deloadSuggestion(phase: phase, acwr: acwr, monotony: monotony, weeklyVolume: weeklyVolume)

        return .init(weeklyVolume: weeklyVolume, liftProgressions: progressions,
                     prTimeline: prTimeline, phase: phase, phaseRationale: rationale, deload: deload)
    }

    /// Phase off the 3-week volume slope vs the prior 3-week mean + the ACWR band.
    private static func detectPhase(weeklyVolume: [PeriodizationSnapshot.WeekVolume], acwr: Double?)
        -> (PeriodizationSnapshot.Phase, String) {
        let active = weeklyVolume.filter { $0.total > 0 }
        guard active.count >= 4 else {
            return (.building, "Building a base — \(active.count) lifting weeks so far. Phase detection unlocks at 4.")
        }
        let recent = Array(active.suffix(3)).map(\.total)
        let prior = Array(active.dropLast(3).suffix(3)).map(\.total)
        let rMean = recent.reduce(0, +) / Double(recent.count)
        let pMean = prior.isEmpty ? rMean : prior.reduce(0, +) / Double(prior.count)
        let change = pMean > 0 ? (rMean - pMean) / pMean : 0
        let lastVsBase = pMean > 0 ? (active.last!.total - pMean) / pMean : 0

        if lastVsBase <= -0.35 {
            return (.deload, "This week's volume is \(pct(lastVsBase)) below your recent base — a clear deload.")
        }
        if change >= 0.10 {
            return (.accumulation, "Volume is up \(pct(change)) over your prior 3 weeks — you're accumulating work\(acwrTail(acwr)).")
        }
        if change <= -0.10 {
            return (.intensification, "Volume is easing \(pct(change)) while load holds — an intensification block\(acwrTail(acwr)).")
        }
        return (.maintenance, "Volume is steady week to week — maintaining your current base\(acwrTail(acwr)).")
    }

    /// Suggest a deload when load has ramped AND ACWR or monotony is hot.
    private static func deloadSuggestion(
        phase: PeriodizationSnapshot.Phase, acwr: Double?, monotony: Double?,
        weeklyVolume: [PeriodizationSnapshot.WeekVolume]
    ) -> PeriodizationSnapshot.DeloadSuggestion? {
        guard phase != .deload else { return nil }
        let rampWeeks = consecutiveRising(weeklyVolume.filter { $0.total > 0 }.map(\.total))
        let hotACWR = (acwr ?? 0) >= 1.3
        let hotMono = (monotony ?? 0) >= 2.0
        guard rampWeeks >= 3 || hotACWR || hotMono else { return nil }
        var reasons: [String] = []
        if rampWeeks >= 3 { reasons.append("\(rampWeeks) straight weeks of rising volume") }
        if hotACWR, let a = acwr { reasons.append("ACWR at \(String(format: "%.2f", a))") }
        if hotMono, let m = monotony { reasons.append("monotony at \(String(format: "%.1f", m))") }
        let reason = "You've accumulated " + reasons.joined(separator: " and ")
            + ". A planned easy week now banks the adaptation and cuts injury risk."
        return .init(reason: reason, confident: hotACWR)
    }

    private static func consecutiveRising(_ xs: [Double]) -> Int {
        guard xs.count >= 2 else { return 0 }
        var n = 0
        for i in stride(from: xs.count - 1, to: 0, by: -1) {
            if xs[i] > xs[i - 1] { n += 1 } else { break }
        }
        return n
    }
    private static func acwrTail(_ a: Double?) -> String {
        guard let a else { return "" }
        return " (ACWR \(String(format: "%.2f", a)))"
    }
    private static func pct(_ f: Double) -> String { "\(Int((abs(f) * 100).rounded()))%" }
}
