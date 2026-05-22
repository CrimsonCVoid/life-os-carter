/**
 * HealthKitPlugin — reads Apple Watch / iPhone health data directly,
 * bypassing Google Health for users on Apple devices.
 *
 * Required Info.plist keys:
 *   NSHealthShareUsageDescription — already in Info.plist
 *
 * Required entitlement:
 *   com.apple.developer.healthkit — already in App.entitlements
 *
 * Setup:
 *   1. Xcode → App target → Signing & Capabilities → + Capability →
 *      HealthKit. Don't check Clinical Records.
 *   2. Drag this Swift file into the App target's Plugins/ group.
 */

import Capacitor
import Foundation
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSteps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRestingHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHRV", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveCalories", returnType: CAPPluginReturnPromise),
        // Writes
        CAPPluginMethod(name: "writeWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWater", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeMindfulSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available on this device")
            return
        }
        let readTypes: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        var writeTypes: Set<HKSampleType> = [
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.quantityType(forIdentifier: .dietaryWater)!,
            HKObjectType.workoutType(),
        ]
        if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
            writeTypes.insert(mindful)
        }
        store.requestAuthorization(toShare: writeTypes, read: readTypes) { ok, err in
            if let err = err {
                call.reject("HealthKit auth failed: \(err.localizedDescription)")
            } else {
                call.resolve(["granted": ok])
            }
        }
    }

    // MARK: - Quantity readers (Date-range sum / average)

    private func dateRange(_ call: CAPPluginCall) -> (Date, Date) {
        let endMs = call.getDouble("end") ?? Date().timeIntervalSince1970 * 1000
        let startMs = call.getDouble("start") ?? (endMs - 86400_000)
        return (Date(timeIntervalSince1970: startMs / 1000),
                Date(timeIntervalSince1970: endMs / 1000))
    }

    private func sumQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, call: CAPPluginCall) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else {
            call.reject("Unknown type \(id.rawValue)"); return
        }
        let (start, end) = dateRange(call)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum
        ) { _, stats, err in
            if let err = err { call.reject(err.localizedDescription); return }
            let value = stats?.sumQuantity()?.doubleValue(for: unit) ?? 0
            call.resolve(["value": value, "start": start.timeIntervalSince1970 * 1000,
                          "end": end.timeIntervalSince1970 * 1000])
        }
        store.execute(query)
    }

    private func averageQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, call: CAPPluginCall) {
        guard let type = HKObjectType.quantityType(forIdentifier: id) else {
            call.reject("Unknown type \(id.rawValue)"); return
        }
        let (start, end) = dateRange(call)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .discreteAverage
        ) { _, stats, err in
            if let err = err { call.reject(err.localizedDescription); return }
            let value = stats?.averageQuantity()?.doubleValue(for: unit) ?? 0
            call.resolve(["value": value])
        }
        store.execute(query)
    }

    @objc func getSteps(_ call: CAPPluginCall) {
        sumQuantity(.stepCount, unit: .count(), call: call)
    }
    @objc func getActiveCalories(_ call: CAPPluginCall) {
        sumQuantity(.activeEnergyBurned, unit: .kilocalorie(), call: call)
    }
    @objc func getHeartRate(_ call: CAPPluginCall) {
        averageQuantity(.heartRate, unit: HKUnit(from: "count/min"), call: call)
    }
    @objc func getRestingHeartRate(_ call: CAPPluginCall) {
        averageQuantity(.restingHeartRate, unit: HKUnit(from: "count/min"), call: call)
    }
    @objc func getHRV(_ call: CAPPluginCall) {
        averageQuantity(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), call: call)
    }
    @objc func getWeight(_ call: CAPPluginCall) {
        averageQuantity(.bodyMass, unit: HKUnit.gramUnit(with: .kilo), call: call)
    }

    // MARK: - Writes

    /// Save a body-mass sample at the given moment (defaults to now).
    /// JS passes weight in pounds; we convert to kg internally to match
    /// HealthKit's canonical bodyMass unit.
    @objc func writeWeight(_ call: CAPPluginCall) {
        guard let type = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("bodyMass type unavailable"); return
        }
        let pounds = call.getDouble("pounds") ?? 0
        guard pounds > 0 else {
            call.reject("pounds must be > 0"); return
        }
        let kg = pounds * 0.45359237
        let when = (call.getDouble("when")).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let quantity = HKQuantity(unit: HKUnit.gramUnit(with: .kilo), doubleValue: kg)
        let sample = HKQuantitySample(type: type, quantity: quantity, start: when, end: when)
        store.save(sample) { ok, err in
            if let err = err { call.reject(err.localizedDescription); return }
            call.resolve(["ok": ok])
        }
    }

    /// Save a dietary water sample (ounces). HealthKit's unit for
    /// dietaryWater is fluid ounce (US) — passed straight through.
    @objc func writeWater(_ call: CAPPluginCall) {
        guard let type = HKObjectType.quantityType(forIdentifier: .dietaryWater) else {
            call.reject("dietaryWater type unavailable"); return
        }
        let ounces = call.getDouble("ounces") ?? 0
        guard ounces > 0 else {
            call.reject("ounces must be > 0"); return
        }
        let when = (call.getDouble("when")).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let quantity = HKQuantity(unit: HKUnit.fluidOunceUS(), doubleValue: ounces)
        let sample = HKQuantitySample(type: type, quantity: quantity, start: when, end: when)
        store.save(sample) { ok, err in
            if let err = err { call.reject(err.localizedDescription); return }
            call.resolve(["ok": ok])
        }
    }

    /// Log a journal entry as a Mindful Session (Health → Mindfulness
    /// minutes). JS passes start + duration in seconds.
    @objc func writeMindfulSession(_ call: CAPPluginCall) {
        guard let type = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
            call.reject("mindfulSession type unavailable"); return
        }
        let startMs = call.getDouble("start") ?? Date().timeIntervalSince1970 * 1000
        let durationSec = call.getDouble("durationSec") ?? 0
        guard durationSec > 0 else {
            call.reject("durationSec must be > 0"); return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = start.addingTimeInterval(durationSec)
        let sample = HKCategorySample(
            type: type,
            value: 0,
            start: start,
            end: end
        )
        store.save(sample) { ok, err in
            if let err = err { call.reject(err.localizedDescription); return }
            call.resolve(["ok": ok])
        }
    }

    /// Log a completed lift session as a HealthKit workout. Falls back
    /// to .functionalStrengthTraining if no other type fits.
    @objc func writeWorkout(_ call: CAPPluginCall) {
        let startMs = call.getDouble("start") ?? Date().timeIntervalSince1970 * 1000
        let endMs = call.getDouble("end") ?? Date().timeIntervalSince1970 * 1000
        let calories = call.getDouble("calories") ?? 0
        let activity = call.getString("activity") ?? "strength"
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)

        let activityType: HKWorkoutActivityType
        switch activity {
        case "cardio", "running":      activityType = .running
        case "cycling":                 activityType = .cycling
        case "walking":                 activityType = .walking
        case "hiit":                    activityType = .highIntensityIntervalTraining
        default:                        activityType = .functionalStrengthTraining
        }

        let energy = calories > 0
            ? HKQuantity(unit: .kilocalorie(), doubleValue: calories)
            : nil
        let workout = HKWorkout(
            activityType: activityType,
            start: start,
            end: end,
            duration: end.timeIntervalSince(start),
            totalEnergyBurned: energy,
            totalDistance: nil,
            metadata: nil
        )
        store.save(workout) { ok, err in
            if let err = err { call.reject(err.localizedDescription); return }
            call.resolve(["ok": ok])
        }
    }

    // MARK: - Sleep (category samples)

    @objc func getSleep(_ call: CAPPluginCall) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("Sleep type unavailable"); return
        }
        let (start, end) = dateRange(call)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, err in
            if let err = err { call.reject(err.localizedDescription); return }
            var asleepSec: Double = 0
            for s in (samples as? [HKCategorySample]) ?? [] {
                // Treat any of the "asleep" stages as sleep time.
                if [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue].contains(s.value) {
                    asleepSec += s.endDate.timeIntervalSince(s.startDate)
                }
            }
            call.resolve(["hours": asleepSec / 3600.0])
        }
        store.execute(query)
    }
}
