/**
 * LiveActivityBridgePlugin — start / update / end the active-workout
 * Live Activity from JavaScript.
 *
 * From JS:
 *   import { LiveActivity } from "@/lib/native/live-activity";
 *   await LiveActivity.start({ workoutType: "Push", startedAt: Date.now() });
 *   await LiveActivity.update({ setsCompleted: 3, totalVolume: 4250, ... });
 *   await LiveActivity.end();
 *
 * The WorkoutActivityAttributes type is shared with the Widget Extension
 * target — see ios/Shared/WorkoutActivityAttributes.swift.
 */

import ActivityKit
import Capacitor
import Foundation

@available(iOS 16.2, *)
@objc(LiveActivityBridgePlugin)
public class LiveActivityBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityBridgePlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]

    /// Tracks the active activity so subsequent update/end calls can find it
    /// without the JS side passing the activity ID around.
    private var activeActivity: Activity<WorkoutActivityAttributes>?

    @objc func isSupported(_ call: CAPPluginCall) {
        let supported = ActivityAuthorizationInfo().areActivitiesEnabled
        call.resolve(["supported": supported])
    }

    @objc func start(_ call: CAPPluginCall) {
        let workoutType = call.getString("workoutType") ?? "Workout"
        let startedAtMs = call.getDouble("startedAt") ?? Date().timeIntervalSince1970 * 1000
        let startedAt = Date(timeIntervalSince1970: startedAtMs / 1000)

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities not authorized. Settings → Life OS → Live Activities.")
            return
        }

        // End any previous activity first — only one active workout at a time.
        if let existing = activeActivity {
            Task {
                await existing.end(dismissalPolicy: .immediate)
            }
            activeActivity = nil
        }

        let attributes = WorkoutActivityAttributes(
            workoutType: workoutType,
            startedAt: startedAt
        )
        let initialState = WorkoutActivityAttributes.ContentState()

        do {
            let content = ActivityContent(state: initialState, staleDate: nil)
            let activity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
            self.activeActivity = activity
            call.resolve([
                "ok": true,
                "id": activity.id,
            ])
        } catch {
            call.reject("Failed to start Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let activity = activeActivity else {
            call.resolve(["ok": false, "reason": "no_active_activity"])
            return
        }
        let setsCompleted = call.getInt("setsCompleted") ?? 0
        let totalVolume = call.getDouble("totalVolume") ?? 0
        let lastExerciseName = call.getString("lastExerciseName")
        let lastSetSummary = call.getString("lastSetSummary")
        let restEndsAtMs = call.getDouble("restEndsAt")
        let restEndsAt: Date? = restEndsAtMs.map {
            Date(timeIntervalSince1970: $0 / 1000)
        }

        let state = WorkoutActivityAttributes.ContentState(
            setsCompleted: setsCompleted,
            totalVolume: totalVolume,
            lastExerciseName: lastExerciseName,
            lastSetSummary: lastSetSummary,
            restEndsAt: restEndsAt
        )

        Task {
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
            call.resolve(["ok": true])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard let activity = activeActivity else {
            call.resolve(["ok": true, "reason": "no_active_activity"])
            return
        }
        Task {
            await activity.end(dismissalPolicy: .immediate)
            self.activeActivity = nil
            call.resolve(["ok": true])
        }
    }
}
