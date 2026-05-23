import Foundation
import HealthKit
import SwiftData

/// Single shared HealthKit interface — handles auth, reads, writes.
/// Mirrors the surface of the Capacitor HealthKitPlugin so screen code
/// reads identically: `HealthKitManager.shared.fetchSteps(...)`.
@MainActor
final class HealthKitManager {
    static let shared = HealthKitManager()

    let store = HKHealthStore()

    private init() {}

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Read set — what we look at.
    private var readTypes: Set<HKObjectType> {
        var set: Set<HKObjectType> = []
        for id in [
            HKQuantityTypeIdentifier.stepCount,
            .heartRate,
            .restingHeartRate,
            .heartRateVariabilitySDNN,
            .activeEnergyBurned,
            .bodyMass,
            .dietaryWater,
        ] {
            if let t = HKObjectType.quantityType(forIdentifier: id) {
                set.insert(t)
            }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            set.insert(sleep)
        }
        return set
    }

    /// Write set — what we contribute to Health.
    private var writeTypes: Set<HKSampleType> {
        var set: Set<HKSampleType> = [
            HKObjectType.workoutType(),
        ]
        for id in [HKQuantityTypeIdentifier.bodyMass, .dietaryWater] {
            if let t = HKObjectType.quantityType(forIdentifier: id) {
                set.insert(t)
            }
        }
        if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
            set.insert(mindful)
        }
        return set
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: writeTypes, read: readTypes)
            return true
        } catch {
            print("[HealthKit] auth request failed: \(error)")
            return false
        }
    }

    // MARK: - Reads

    /// Sum a cumulative-quantity (steps, active calories, water).
    func fetchSum(
        of identifier: HKQuantityTypeIdentifier,
        in unit: HKUnit,
        from start: Date,
        to end: Date = Date()
    ) async -> Double {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return 0 }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return await withCheckedContinuation { (cont: CheckedContinuation<Double, Never>) in
            let q = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    func fetchAverage(
        of identifier: HKQuantityTypeIdentifier,
        in unit: HKUnit,
        from start: Date,
        to end: Date = Date()
    ) async -> Double {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return 0 }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return await withCheckedContinuation { (cont: CheckedContinuation<Double, Never>) in
            let q = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .discreteAverage
            ) { _, stats, _ in
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    // MARK: - Writes

    @discardableResult
    func writeWeight(pounds: Double, at date: Date = Date()) async -> Bool {
        guard pounds > 0,
              let type = HKObjectType.quantityType(forIdentifier: .bodyMass) else { return false }
        let kg = pounds * 0.45359237
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: HKUnit.gramUnit(with: .kilo), doubleValue: kg),
            start: date,
            end: date
        )
        return await save(sample)
    }

    @discardableResult
    func writeWater(ounces: Double, at date: Date = Date()) async -> Bool {
        guard ounces > 0,
              let type = HKObjectType.quantityType(forIdentifier: .dietaryWater) else { return false }
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: .fluidOunceUS(), doubleValue: ounces),
            start: date,
            end: date
        )
        return await save(sample)
    }

    @discardableResult
    func writeMindfulSession(start: Date, durationSec: TimeInterval) async -> Bool {
        guard durationSec > 0,
              let type = HKObjectType.categoryType(forIdentifier: .mindfulSession) else { return false }
        let sample = HKCategorySample(
            type: type,
            value: 0,
            start: start,
            end: start.addingTimeInterval(durationSec)
        )
        return await save(sample)
    }

    private func save(_ sample: HKObject) async -> Bool {
        await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            store.save(sample) { ok, err in
                if let err = err { print("[HealthKit] save failed: \(err)") }
                cont.resume(returning: ok)
            }
        }
    }

    // MARK: - Typed convenience reads

    /// Sleep hours for the night that ENDED on the given calendar date.
    /// Sums any sleep stage value (asleep core/REM/deep) across the
    /// 6pm-prior-day → noon-current-day window — the standard "last
    /// night's sleep" semantics every health app uses.
    func fetchSleepHours(forNightEnding date: Date) async -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: date)
        let start = cal.date(byAdding: .hour, value: -6, to: dayStart) ?? dayStart
        let end = cal.date(byAdding: .hour, value: 12, to: dayStart) ?? dayStart
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        return await withCheckedContinuation { (cont: CheckedContinuation<Double?, Never>) in
            let q = HKSampleQuery(
                sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, _ in
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                ]
                var totalSec: TimeInterval = 0
                for s in (samples as? [HKCategorySample] ?? []) where asleepValues.contains(s.value) {
                    totalSec += s.endDate.timeIntervalSince(s.startDate)
                }
                cont.resume(returning: totalSec > 0 ? totalSec / 3600.0 : nil)
            }
            self.store.execute(q)
        }
    }

    /// Most recent HRV (SDNN) sample within the last 24h, in ms.
    /// HRV is sampled overnight on Apple Watch; the latest reading is
    /// the morning value Whoop/Oura use for recovery math.
    func fetchLatestHRV(within hours: Int = 24) async -> Double? {
        await fetchLatestSample(
            of: .heartRateVariabilitySDNN,
            unit: HKUnit.secondUnit(with: .milli),
            within: hours
        )
    }

    func fetchLatestRHR(within hours: Int = 24) async -> Double? {
        await fetchLatestSample(
            of: .restingHeartRate,
            unit: HKUnit.count().unitDivided(by: .minute()),
            within: hours
        )
    }

    func fetchLatestWeightLb(within hours: Int = 24 * 30) async -> Double? {
        guard let kg = await fetchLatestSample(
            of: .bodyMass,
            unit: HKUnit.gramUnit(with: .kilo),
            within: hours
        ) else { return nil }
        return kg / 0.45359237
    }

    private func fetchLatestSample(
        of id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        within hours: Int
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        let start = Date().addingTimeInterval(-Double(hours) * 3600)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return await withCheckedContinuation { (cont: CheckedContinuation<Double?, Never>) in
            let q = HKSampleQuery(
                sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]
            ) { _, samples, _ in
                let v = (samples?.first as? HKQuantitySample)?
                    .quantity.doubleValue(for: unit)
                cont.resume(returning: v)
            }
            self.store.execute(q)
        }
    }

    /// Rolling N-day average of a discrete-quantity sample type.
    /// Used to build the recovery-score baseline so today's HRV/RHR can
    /// be compared against the user's own normal, not a population
    /// average. Returns nil when there's no data in the window.
    func fetchBaseline(
        of id: HKQuantityTypeIdentifier,
        unit: HKUnit,
        days: Int
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        let cal = Calendar.current
        let end = cal.startOfDay(for: Date())
        guard let start = cal.date(byAdding: .day, value: -days, to: end) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        return await withCheckedContinuation { (cont: CheckedContinuation<Double?, Never>) in
            let q = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .discreteAverage
            ) { _, stats, _ in
                let avg = stats?.averageQuantity()?.doubleValue(for: unit)
                cont.resume(returning: avg)
            }
            self.store.execute(q)
        }
    }

    // MARK: - syncToday

    /// One-shot pull of today's headline metrics from HealthKit into
    /// the SwiftData DailyEntry row for today. Also updates UserSettings
    /// baselines so the recovery score can compare today against the
    /// rolling 14-day normals. Called from app onAppear and from the
    /// Today screen's pull-to-refresh.
    ///
    /// Respects manual overrides: if a value is already set in
    /// DailyEntry (mood, energy, water — user-entered) we don't
    /// overwrite it. HealthKit reads (sleep, HRV, RHR, steps, weight)
    /// always trust HealthKit since that's the authoritative source.
    func syncToday(in ctx: ModelContext) async {
        guard isAvailable else { return }
        let cal = Calendar.current
        let now = Date()
        let todayKey = HealthKitDateFmt.ymd(now)
        let dayStart = cal.startOfDay(for: now)

        async let sleep = fetchSleepHours(forNightEnding: now)
        async let hrv = fetchLatestHRV()
        async let rhr = fetchLatestRHR()
        async let weight = fetchLatestWeightLb()
        async let stepsD = fetchSum(of: .stepCount, in: HKUnit.count(), from: dayStart)
        async let waterOz = fetchSum(of: .dietaryWater, in: .fluidOunceUS(), from: dayStart)
        async let hrvBase = fetchBaseline(of: .heartRateVariabilitySDNN,
                                          unit: HKUnit.secondUnit(with: .milli), days: 14)
        async let rhrBase = fetchBaseline(of: .restingHeartRate,
                                          unit: HKUnit.count().unitDivided(by: .minute()), days: 14)

        let (sleepV, hrvV, rhrV, weightV, stepsV, waterV, hrvBaseV, rhrBaseV) =
            await (sleep, hrv, rhr, weight, stepsD, waterOz, hrvBase, rhrBase)

        await MainActor.run {
            // Locate (or create) today's DailyEntry row.
            let desc = FetchDescriptor<DailyEntry>(
                predicate: #Predicate { $0.date == todayKey }
            )
            let row = (try? ctx.fetch(desc))?.first ?? {
                let r = DailyEntry(date: todayKey)
                ctx.insert(r)
                return r
            }()

            row.sleepHours = sleepV
            row.hrvMs = hrvV
            row.restingHr = rhrV
            row.weightLb = weightV ?? row.weightLb
            row.steps = stepsV > 0 ? Int(stepsV) : row.steps
            // HealthKit water > 0 wins; otherwise preserve any in-app log.
            if waterV > 0 { row.waterOz = waterV }

            let settings = UserSettings.loadOrCreate(in: ctx)
            settings.hrvBaseline = hrvBaseV ?? settings.hrvBaseline
            settings.rhrBaseline = rhrBaseV ?? settings.rhrBaseline

            try? ctx.save()
        }
    }
}

// MARK: - Date helper (kept private to this file so it doesn't compete
// with HabitDateFmt's identical surface elsewhere)

private enum HealthKitDateFmt {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    static func ymd(_ d: Date) -> String { formatter.string(from: d) }
}
