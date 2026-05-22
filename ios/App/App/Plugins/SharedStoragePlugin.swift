/**
 * SharedStoragePlugin — bridges the JS app to the App Group UserDefaults
 * that the Widget Extension + Live Activity reads.
 *
 * The Widget can't call into the JS app to ask "what's today's strain?" —
 * it runs in a separate process at a moment the main app may not even be
 * running. The pattern is: the main JS app writes a snapshot of "today's
 * numbers" into App Group UserDefaults whenever the data changes, and the
 * widget reads it lazily.
 *
 * From JS:
 *
 *   import { SharedStorage } from "@/lib/native/shared-storage";
 *   await SharedStorage.set({
 *     key: "todaySnapshot",
 *     value: JSON.stringify({ strain: 14.2, sleep: 7.5, steps: 8431 }),
 *   });
 *
 * From Swift (in the widget):
 *
 *   let defaults = UserDefaults(suiteName: "group.com.hbrady.lifeos")
 *   let raw = defaults?.string(forKey: "todaySnapshot")
 *
 * Setup:
 *   1. Add "App Groups" capability in Xcode → Signing & Capabilities for
 *      the App target. Use group.com.hbrady.lifeos (matches the
 *      entitlement file alongside this directory).
 *   2. Drag this file into Xcode under the App target's "Plugins" group.
 *   3. The Capacitor build system auto-registers @objc(SharedStoragePlugin)
 *      classes — no Package.swift edit required.
 */

import Foundation
import Capacitor

@objc(SharedStoragePlugin)
public class SharedStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedStoragePlugin"
    public let jsName = "SharedStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private static let appGroup = "group.com.hbrady.lifeos"

    private func defaults() -> UserDefaults? {
        return UserDefaults(suiteName: Self.appGroup)
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key required")
            return
        }
        let value = call.getString("value")
        guard let defaults = defaults() else {
            call.reject("App Group not configured — add 'group.com.hbrady.lifeos' under Signing & Capabilities → App Groups")
            return
        }
        if let value = value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
        call.resolve(["ok": true])
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key required")
            return
        }
        guard let defaults = defaults() else {
            call.reject("App Group not configured")
            return
        }
        let value = defaults.string(forKey: key)
        call.resolve(["value": value as Any])
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key required")
            return
        }
        defaults()?.removeObject(forKey: key)
        call.resolve(["ok": true])
    }
}
