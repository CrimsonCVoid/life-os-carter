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
        let types: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .bodyMass)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        store.requestAuthorization(toShare: nil, read: types) { ok, err in
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
