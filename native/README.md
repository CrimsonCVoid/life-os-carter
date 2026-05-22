# Life OS — Native iOS

Pure-Swift port of the Life OS app. SwiftUI, SwiftData, Liquid Glass.
Replaces the Capacitor + Next.js WebView setup that lived in `../ios/`.

## Build

One-time tool install:

```bash
brew install xcodegen
```

Then any time `project.yml` changes:

```bash
cd native
xcodegen
open LifeOS.xcodeproj
```

Hit Cmd-R in Xcode. Min deployment is iOS 17 — needed for the
interactive Live Activity buttons and Swift Charts.

## Why XcodeGen

The Xcode project file (`.xcodeproj/project.pbxproj`) is a 5000-line
binary plist that GitHub can't diff and merge conflicts shred. XcodeGen
keeps the project as a readable `project.yml` and regenerates the
pbxproj on demand. Every file you drop into `App/` or `WidgetExtension/`
gets picked up automatically — no more "drag this file in, check these
boxes" Xcode dance.

## Structure

```
native/
├── project.yml                # XcodeGen config — single source of truth
├── App/                       # Main iOS app target
│   ├── LifeOSApp.swift        # @main entry point
│   ├── Root/                  # Top-level navigation
│   ├── Theme/                 # Colors, type, Liquid Glass modifiers
│   ├── Views/                 # Screen-level SwiftUI views
│   ├── Models/                # @Model SwiftData entities + DTOs
│   ├── Services/              # API client, HealthKit, LiveActivity, Haptics
│   ├── Info.plist
│   └── LifeOS.entitlements
├── WidgetExtension/           # Lock Screen / Home Screen widgets + Live Activity
│   ├── WidgetBundle.swift
│   ├── WorkoutActivityWidget.swift
│   └── Info.plist
└── Shared/                    # Files in BOTH targets
    └── WorkoutActivityAttributes.swift
```

## Backend

Auth, server-side AI (Gemini), and Postgres still live at the existing
Vercel deploy (`https://life-os-carter.vercel.app`). The native app
calls the same `/api/*` routes via `APIClient.swift`. Long-term we can
replace those with CloudKit / on-device Foundation Models, but the
existing backend is free fuel until we need to.

## State of the port

This is a fresh scaffold. The architecture, navigation shell, theme,
Live Activity, HealthKit, App Intents, and Widget Extension are in
place. Each screen is currently a polished placeholder — fill them in
incrementally. Nothing here re-imports the old Next.js code.
