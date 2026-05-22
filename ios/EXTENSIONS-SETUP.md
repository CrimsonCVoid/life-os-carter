# iOS native extensions setup

All Swift source is already in this repo. You need to wire it into the
Xcode project — Capacitor doesn't auto-register extension targets the
way it does Capacitor plugins.

Steps in order. Once done, the App Store binary supports:
* Home Screen widget (small / medium / large)
* Lock Screen complications (circular / rectangular / inline)
* Live Activity in the Dynamic Island + Lock Screen, driven by JS
* HealthKit reads from Apple Watch
* Siri / Shortcuts intents
* Push notifications
* App Group shared storage

All widgets + Live Activity views use Liquid Glass (iOS 26
`.glassEffect()` APIs) with `.ultraThinMaterial` fallback on older OS.

---

## 0. Open Xcode

```
npm run ios:sync
npm run ios:open
```

## 1. App Group capability (foundational — do this first)

Selecting the **App** target → Signing & Capabilities tab:
1. **+ Capability** → **App Groups**
2. **+** under the new App Groups row → enter `group.com.hbrady.lifeos`
3. Make sure the checkbox next to it is on

The `App.entitlements` file at `ios/App/App/App.entitlements` already
declares this group — Xcode just needs the project pbxproj record.

## 2. Drag the Capacitor plugins into the App target

In the Xcode project navigator:
1. Right-click the **App** group (inside the App target) → **New Group** → name it `Plugins`
2. Drag these three files from Finder into that group, **with "Copy items if needed" OFF** and **App target checked**:
   * `ios/App/App/Plugins/SharedStoragePlugin.swift`
   * `ios/App/App/Plugins/HealthKitPlugin.swift`
   * `ios/App/App/Plugins/LiveActivityBridgePlugin.swift`

Capacitor auto-discovers `@objc(...Plugin)` classes in the App target —
no Package.swift edit needed.

## 3. Drag App Intents

1. Right-click the App group → **New Group** → name it `AppIntents`
2. Drag in `ios/App/App/AppIntents/LifeOSIntents.swift` (App target checked)

The Shortcuts.app will auto-show "Start workout / Log meal / Today's
stats / Start fast" under "Life OS" after first run.

## 4. HealthKit capability

App target → Signing & Capabilities:
1. **+ Capability** → **HealthKit**
2. Leave Clinical Records OFF

`NSHealthShareUsageDescription` is already in Info.plist.

## 5. Push Notifications capability

App target → Signing & Capabilities:
1. **+ Capability** → **Push Notifications**
2. **+ Capability** → **Background Modes** → check "Remote notifications"

Generate an APNs Auth Key:
1. https://developer.apple.com/account → Certificates IDs & Profiles
2. **Keys** tab → **+** → name it "Life OS APNs" → check "Apple Push Notifications service (APNs)"
3. Download the `.p8`. Note the Key ID + your Team ID.
4. Upload to App Store Connect → Users and Access → Keys → In-App Purchase (yes weird tab) → APNs

## 6. Widget Extension target (the bigger step)

Xcode menu: **File → New → Target**:
1. Choose **Widget Extension**
2. Product name: `WidgetExtension`
3. Bundle ID: `com.hbrady.lifeos.WidgetExtension` (Xcode auto-fills)
4. Language: Swift, Include Configuration Intent: OFF, Include Live Activity: ON
5. Click **Finish**, then **Activate** when prompted to activate the new scheme

Xcode generates a starter widget file. **Delete** the generated:
* `WidgetExtension.swift`
* `WidgetExtensionBundle.swift`
* `WidgetExtensionLiveActivity.swift` (if present)
* `AppIntent.swift` (if present)

Then drag these from Finder into the WidgetExtension group, **WidgetExtension target checked**:
* `ios/WidgetExtension/LifeOSWidget.swift`
* `ios/WidgetExtension/WorkoutActivityWidget.swift`
* `ios/WidgetExtension/WidgetBundle.swift`
* `ios/Shared/WorkoutActivityAttributes.swift` ← **also check the App target**
  (must be in both — App starts the activity, Widget renders it)

Replace the auto-generated `Info.plist` with `ios/WidgetExtension/Info.plist`.

WidgetExtension target → Signing & Capabilities:
1. **+ Capability** → **App Groups** → enable `group.com.hbrady.lifeos`

Replace the auto-generated entitlements with
`ios/WidgetExtension/WidgetExtension.entitlements`.

## 7. Update deployment target to iOS 26.0

App + WidgetExtension targets → General → Minimum Deployments → iOS 26.0
(needed for `.glassEffect`).

If you want to support iOS 17 too, leave at 17.0 — Liquid Glass falls
back to `.ultraThinMaterial` automatically via the
`if #available(iOS 26.0, *)` guards already in the Swift code.

## 8. Sync + run

```
npm run ios:sync     # copy capacitor web assets
npm run ios:open     # already open — Xcode picks up file changes
```

Product → Scheme → **App** → Run on a real device. After first launch:
* Long-press home screen → + → search "Life OS" → add a widget
* Start a workout in the app → Live Activity appears in Dynamic Island
* "Hey Siri, Life OS today" → reads your stats
* Settings → Health → Apps → Life OS → grant whichever data types

---

## What JavaScript can do now

```ts
import { SharedStorage, writeTodaySnapshot } from "@/lib/native/shared-storage";
import { HealthKit } from "@/lib/native/healthkit";
import { LiveActivity } from "@/lib/native/live-activity";

// Snapshot is auto-written by <SnapshotWriter /> mounted in app-shell —
// no manual call needed. Widgets read it automatically.

// Live Activity is auto-started by active-workout-page when a session
// begins, updated on every set, ended on finish/cancel.

// HealthKit one-time auth:
if (await HealthKit.isAvailable()) {
  await HealthKit.requestAuthorization();
  const { value: stepsToday } = await HealthKit.steps();
  const { hours } = await HealthKit.sleep({
    start: Date.now() - 86400_000,
    end: Date.now(),
  });
}
```

---

## App Store Connect

Once the build uploads:
1. App Store Connect → your app → App Privacy → declare HealthKit data
   types you read (Body Measurements / Heart / Sleep / Fitness)
2. TestFlight test on a real device with an Apple Watch paired (HRV /
   resting HR don't populate without one)
3. Submit for review

---

## File map

```
ios/
├── App/App/
│   ├── App.entitlements              ← App Group + APNs + HealthKit
│   ├── Info.plist                    ← Health/URL scheme/Live Activity flags
│   ├── Plugins/                      ← drag into App target
│   │   ├── SharedStoragePlugin.swift
│   │   ├── HealthKitPlugin.swift
│   │   └── LiveActivityBridgePlugin.swift
│   └── AppIntents/
│       └── LifeOSIntents.swift       ← drag into App target
├── Shared/
│   └── WorkoutActivityAttributes.swift  ← drag into BOTH App + WidgetExtension
└── WidgetExtension/                  ← create target in Xcode, then drag in
    ├── LifeOSWidget.swift
    ├── WorkoutActivityWidget.swift
    ├── WidgetBundle.swift
    ├── Info.plist
    └── WidgetExtension.entitlements
```
