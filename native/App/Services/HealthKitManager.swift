import Foundation
import HealthKit

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
}
