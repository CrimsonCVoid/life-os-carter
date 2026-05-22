# Life OS — Session handoff (native iOS port)

> Read this in full before issuing any commands. State snapshot for
> resuming where the native-port session ended.

---

## How to launch the next session

```bash
cd ~/Downloads/life-os-hbrady
./scripts/handoff-native.sh
```

That script keeps the Mac awake (`caffeinate`), launches Claude Code
with `--dangerously-skip-permissions`, and primes the prompt to read
this file. Manual invocation:

```bash
caffeinate -dimsu -t 7200 &
claude --dangerously-skip-permissions
# Then in the prompt:
# Read /Users/carterbrady/Downloads/life-os-hbrady/HANDOFF-NATIVE.md in
# full, then continue the native iOS port where it left off.
```

---

## The big pivot (read this first)

This session **abandoned the Capacitor hybrid app** and started a
fresh pure-Swift native iOS rewrite. Two parallel apps now live in
this repo:

| Path | What it is | Status |
|---|---|---|
| `ios/` | Capacitor + Next.js WebView wrapper (the v2 work) | Still works at `life-os-carter.vercel.app`. **Don't delete.** Use as the daily-driver until the native port catches up. |
| `native/` | Pure SwiftUI + SwiftData + XcodeGen | New. Active branch is `native`. |

Why we pivoted: the Capacitor Live Activity bridge had a JS-side bug
we couldn't diagnose remotely (calls to `LiveActivity.start()` never
hit the native plugin). The user opted to go native rather than
keep debugging the bridge.

---

## State (2026-05-22)

**Branch:** `native` on `~/Downloads/life-os-hbrady`
**Tip:** `57d93cc` (Stop XcodeGen auto-creating a WidgetExtension scheme)
**Working tree:** clean
**Pushed to:** all three remotes (`origin`, `carter`, `life-os-dev`) at `57d93cc`

The `main` branch is the older Capacitor + Next.js work, last commit
`5db2ba8`. We deliberately preserved it untouched.

---

## Topology

| Remote | URL | Branches |
|---|---|---|
| `origin` | hbrady7/life-os | native, main, pre-v2-main-backup, pre-v2-port-backup-2026-05-21 |
| `life-os-dev` | Life-Os-Development/life-os-main | native, main |
| `carter` | CrimsonCVoid/life-os-carter | native, main, pre-v2-main-backup, pre-v2-port-backup-2026-05-21 |

Lockstep push pattern after every commit:

```bash
git push origin native && \
  git push carter native && \
  git push life-os-dev native
```

Vercel deploys from `carter/main` (the OLD Capacitor app). It is
**not** rebuilt by pushes to `native`.

---

## Architecture (settled)

| Layer | Choice |
|---|---|
| Project structure | `native/` directory at repo root, XcodeGen-generated `.xcodeproj` from `project.yml` |
| UI | SwiftUI, iOS 17+ deployment, dark theme, Liquid Glass via `.glassEffect()` on iOS 26+ with `.ultraThinMaterial` fallback |
| State | `@Observable` view-model classes (e.g. `ActiveWorkoutStore`) + `@Environment(...)` injection |
| Persistence | SwiftData `@Model` entities, local-first, no CloudKit yet |
| Charts | Swift Charts |
| Backend | Reuse the existing Vercel `/api/*` routes (Gemini, push, weekly-review, etc.) via `APIClient.swift` — **not yet wired**, future work |
| Auth | TBD — not yet wired. Sign in with Apple is the planned first provider. |
| Live Activity | Real ActivityKit, `WorkoutActivityAttributes` shared between App + WidgetExtension targets, iOS 17 `LiveActivityIntent` for interactive buttons |
| HealthKit | `HealthKitManager` service, full read + write (steps, HR, HRV, sleep, weight, water, mindful, workouts) — **auth requested on first launch, screens NOT YET reading from it** |
| App icon | Pre-rendered multi-size set in `native/App/Assets.xcassets/AppIcon.appiconset/` |
| Project generation | `xcodegen` (Homebrew); regenerate via `cd native && xcodegen generate` |
| Active scheme | Exactly one: `LifeOS`. WidgetExtension auto-scheme suppressed via `postGenCommand` |

---

## What landed in this session

```
57d93cc  Stop XcodeGen auto-creating a WidgetExtension scheme
ddd3079  Fix split picker — day templates now actually attach +
         clearer Start affordance
756ed5c  Stats → Analysis: insights-first overhaul + app-wide
         polish pass (cascade reveals, pressable, gradient cards)
e4faf7b  Workout overhaul — splits, templates, PRs, exercise history,
         CSV + bigger Live Activity
2c0ff09  Comprehensive Today overhaul + Nutrition wired up
b5630d9  Native workout flow — sets, supersets, dropsets, RPE, rest,
         plate calculator
8d571c9  Native iOS port — SwiftUI scaffold (drop Capacitor, go all-Swift)
```

---

## What works end-to-end (build it, run it, use it)

- **Today tab**: greeting, Peak State hero with halo glow, Apple-style
  Activity Rings, vitals 2×2 with sparklines, MacroRingsCard, workout
  summary card, SleepCard with stage breakdown, HydrationCard with
  quick-log chips, habits roll-up, MoodEnergyCard with 1-10 ladders,
  InsightsCard. All placeholder data; layout is the visual end-state.
- **Gym tab**: split picker (Upper/Lower, PPL, Bro, Arnold, Full Body,
  Custom) with default day seeds; per-day template editor (drag,
  delete, +exercise, rest stepper); "Start workout" loads template
  exercises into the active store in one tap; active workout view
  with sets, supersets via shared group UUID, dropsets, RPE drawer,
  rest banner, plate calculator; PR list (top 5 by est. 1RM);
  exercise history view with volume + 1RM line charts; CSV export
  via ShareSheet.
- **Analysis tab**: 10 insights cards, each phrased as a question;
  range selector (7/30/90/365d); sleep architecture stacked area;
  RHR+HRV dual line; HRV↔Sleep scatter; workout consistency
  heatmap (custom grid); HR zones donut; activity by DOW bars;
  body composition trend; VO₂ max gauge; pattern observations.
- **Live Activity v2**: bigger Lock Screen banner with progress bar,
  stat strip (SETS/VOLUME/KCAL), last-set card with est 1RM, "next
  up" card or rest bar, interactive Set/+30s/Skip buttons; PR pill
  appears when records broken; Dynamic Island expanded view picks
  up kcal + next-up + PR badge.
- **App icon**: real Life OS branded set.
- **Build pipeline**: `xcodegen generate` from `native/project.yml`,
  one shared scheme (LifeOS), iPhone Simulator builds clean.

---

## What's placeholder / not yet wired

- **HealthKit reads** — manager requests auth on launch, but Today
  + Analysis still show static `Sample` enum values. Next big
  task: replace placeholder data with `HealthKitManager.fetchSum/
  fetchAverage` calls.
- **AI coach (Overseer)** — `APIClient` exists, no streaming UI yet.
- **Auth** — no sign-in flow. Sign in with Apple is one
  `SignInWithAppleButton` away.
- **Push notifications** — UserNotifications + APNs token
  registration not yet implemented.
- **Barcode food scan** — VisionKit `DataScannerViewController`
  + OpenFoodFacts lookup planned, placeholder buttons in
  `AddMealSheet.swift`.
- **Photo food scan** — `PhotosPicker` + `APIClient` → existing
  Vercel `/api/food-photo` planned, placeholder button only.
- **Voice journal** — Speech framework integration planned.
- **Weekly review** — not started.
- **Body screen** — not built; would go between Gym and Analysis.
- **Journal tab** — not built.
- **Settings** — bare-bones (HealthKit auth + LA permission).
  Account / sign-out / preferences not wired.

---

## File map — `native/`

```
native/
├── project.yml                    # XcodeGen single source of truth
├── README.md                      # Build instructions
├── App/
│   ├── LifeOSApp.swift            # @main, ModelContainer, ActiveWorkoutStore env injection
│   ├── Info.plist                 # generated from project.yml
│   ├── LifeOS.entitlements        # generated from project.yml
│   ├── Root/
│   │   └── RootView.swift         # TabView with 5 tabs
│   ├── Theme/
│   │   ├── LifeOSColor.swift      # color tokens (mirror globals.css)
│   │   └── GlassModifier.swift    # .glass / .glassCard helpers
│   ├── Components/
│   │   ├── Card.swift             # Card primitive, SectionLabel, PillarTile, cascadeReveal, pressable, glow modifiers
│   │   ├── Rings.swift            # ProgressRing, ActivityRings, ScoreRing
│   │   ├── MacroRings.swift       # MacroRingsCard
│   │   ├── Sparkline.swift        # Sparkline + VitalTile
│   │   ├── SleepCard.swift        # stage breakdown card
│   │   ├── InsightsCard.swift
│   │   ├── HydrationCard.swift
│   │   └── MoodEnergyCard.swift
│   ├── Views/
│   │   ├── TodayView.swift        # 11 cards, sample data
│   │   ├── NutritionView.swift    # Macro rings + Today's meals list + quick capture strip
│   │   ├── HabitsView.swift       # SwiftData habits with seed defaults
│   │   ├── GymView.swift          # Split + day cards + PRs + recent sessions + CSV
│   │   ├── AnalysisView.swift     # 10 insights cards
│   │   ├── SettingsView.swift     # HealthKit auth + LA permission state
│   │   ├── AddMealSheet.swift     # Manual + barcode/photo/voice placeholders
│   │   └── Workout/
│   │       ├── ActiveWorkoutView.swift
│   │       ├── ExercisePickerView.swift
│   │       ├── SetRow.swift
│   │       ├── RPEDrawer.swift
│   │       ├── PlateCalculator.swift
│   │       ├── SplitPickerView.swift
│   │       ├── TemplateEditorView.swift
│   │       └── ExerciseHistoryView.swift
│   ├── Models/
│   │   ├── Models.swift           # DailyEntry, HabitEntry, JournalEntry, MealLog, LiftSessionEntry @Models
│   │   ├── ActiveWorkout.swift    # @Observable store + WorkoutSet/Exercise/Summary types
│   │   ├── WorkoutSplit.swift     # WorkoutSplit, WorkoutTemplate @Models, SplitKind enum + defaults, PersonalRecord @Model, estimate1RM()
│   │   └── ExerciseLibrary.swift  # 50-row curated catalog
│   └── Services/
│       ├── APIClient.swift        # URLSession → existing Vercel /api/*
│       ├── HealthKitManager.swift # Full read + write surface
│       ├── LiveActivityManager.swift
│       ├── WorkoutCommandConsumer.swift  # Drains App Group queue from widget intents
│       ├── PersonalRecordsService.swift  # PR computation from finished workouts
│       ├── CSVExporter.swift
│       └── Haptics.swift          # Prepared UIImpactFeedbackGenerators
├── Shared/
│   └── WorkoutActivityAttributes.swift   # In BOTH App + WidgetExtension targets
└── WidgetExtension/
    ├── WidgetBundle.swift          # @main, registers Today + Workout widgets
    ├── TodaySnapshotWidget.swift   # Home / Lock screen widget reading App Group snapshot
    ├── WorkoutActivityWidget.swift # Live Activity UI (Lock Screen + Dynamic Island)
    ├── WorkoutLiveActivityIntents.swift  # CompleteCurrentSet / AddRest / SkipRest LiveActivityIntents
    ├── Info.plist                  # generated
    └── WidgetExtension.entitlements # generated
```

---

## Standard commands

```bash
# Regenerate Xcode project from project.yml (run after edits to it
# OR after adding/removing Swift files outside of Xcode):
cd native && xcodegen generate

# Open in Xcode
open native/LifeOS.xcodeproj

# Headless sanity build (no signing, simulator):
xcodebuild -project native/LifeOS.xcodeproj \
  -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO

# Git lockstep push (after every commit):
git push origin native && \
  git push carter native && \
  git push life-os-dev native
```

---

## Gotchas / things that have bitten us

1. **Active scheme:** The xcodeproj `xcshareddata/xcschemes/` directory
   contains only `LifeOS.xcscheme`. If Xcode ever offers a
   WidgetExtension scheme in the dropdown, you ran into the regression
   we fixed in `57d93cc` — `project.yml` includes a `postGenCommand`
   that wipes it after every `xcodegen generate`. Don't manually
   re-create it.

2. **SwiftData inverse relationships:** Bit us in the split picker.
   When inserting a parent + children, you MUST insert both into the
   context FIRST, then wire both directions of the relationship
   explicitly. See `SplitPickerView.choose(_:)` for the pattern.

3. **`#Predicate<T>` macro and enum.rawValue:** SwiftData's macro
   can't always type-check expressions that use `enum.rawValue`
   inline. Bind the raw value to a local first
   (`let kindRaw = kind.rawValue`), then use the local in the
   predicate body. See `PersonalRecordsService.promoteIfBeats(_:)`.

4. **Xcode auto-copy on drag-in:** Don't drag Swift files into Xcode
   manually — XcodeGen handles all source-list management. If a file
   exists on disk under `native/App/...`, the next `xcodegen` picks it
   up. Avoid the Xcode "Copy items if needed" dialog entirely.

5. **macOS SourceKit lint noise:** Many Swift files show "Cannot find
   X in scope" errors in the Xcode source-side analyzer because
   SourceKit doesn't always understand module-level imports when files
   are reviewed individually. These resolve at iOS build time. If
   `xcodebuild` succeeds with `BUILD SUCCEEDED`, the project is fine
   regardless of in-editor diagnostics.

6. **iPhone must be unlocked** while Xcode installs. The
   `Unable to launch (null) because the device was not, or could not
   be, unlocked` error from SpringBoard means the phone is locked.

---

## Open items / what's next (priority order)

### 1. Wire HealthKit reads into Today + Analysis (highest leverage)

Replace the `Sample` enum static data in `TodayView.swift` and
`AnalysisView.swift` with real `HealthKitManager` calls. The manager
already has `fetchSum(of:in:from:to:)` and `fetchAverage(...)` — just
needs to be called inside `.task` modifiers and the results stored in
`@State` or a dedicated `@Observable` HealthDataStore.

### 2. Sign in with Apple

`SignInWithAppleButton` in a new `SignInView` shown when a
`@AppStorage("user_signed_in")` flag is false. Token exchange against
the existing Vercel `/api/auth/callback/apple` (or just store the
identity locally for now — backend sync isn't critical for v0).

### 3. AI coach (Overseer) streaming

Build an `OverseerView` accessible from a floating button. Stream
from the existing Vercel `/api/overseer` endpoint via `URLSession`
SSE. Reuse the existing context-builder logic on the server side —
the native app just sends `{ messages, context }` and renders tokens.

### 4. Barcode + photo food scanning

- Barcode: `DataScannerViewController` wrapped in
  `UIViewControllerRepresentable`, recognizes EAN-13/UPC-A, look up
  via OpenFoodFacts REST API, pre-fill `AddMealSheet`.
- Photo: `PhotosPicker` + `APIClient.post("api/food-photo", ...)`
  to the existing Gemini route.

### 5. Push notifications

`UserNotifications` permission request + `application(_:didRegister
ForRemoteNotificationsWithDeviceToken:)` → POST device token to
`/api/push/register-apns` (route would need to be created on the web
backend; can fold into existing `web-push.ts`).

### 6. Body measurements + Journal screens

Two more tabs OR fold into a unified "Me" tab. Body should
write `bodyMass` + `bodyFatPercentage` to HealthKit. Journal entries
should optionally write as `mindfulSession` (already supported in
the HealthKitManager).

### 7. Settings expansion

Account / sign out, units (lb vs kg), macro target editor, notification
preferences, data export, danger zone (clear all SwiftData).

### 8. Apple Watch companion (massive)

WatchKit app target, `WCSession` bridge, complications, real-time HR
during workouts. Out of scope until 1-3 are done.

---

## Critical env vars (Vercel backend, unchanged from v2)

These belong to the OLD Capacitor app's backend but the native app
will reuse them via `APIClient`:

```
DATABASE_URL              # Neon pooled
DATABASE_URL_UNPOOLED     # Neon direct
NEXTAUTH_SECRET           # openssl rand -base64 32
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_APPLE_ID             # new this session (Sign in with Apple)
AUTH_APPLE_SECRET
GEMINI_API_KEY            # aistudio.google.com/apikey
```

The native app reads none of these directly. The Vercel deploy at
`life-os-carter.vercel.app` does.

---

## Do NOT do without explicit user authorization

- `git reset --hard` on any pushed branch
- `git push --force` to `main` of any remote (use `--force-with-lease`)
- Delete the `ios/` directory (Capacitor app still functional)
- Delete the `main` branch (older work preserved there)
- `--no-verify` on commits
- Rotate live OAuth credentials, Gemini key
- Anything that costs money

---

## Persistent rules

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push to all three remotes (`origin`, `carter`, `life-os-dev`) on the
  `native` branch after every commit
- Run `xcodebuild` sanity-build before committing big changes
- No inline hex — use `LifeOSColor.*` tokens
- Use the existing primitives (`Card`, `Card(tint:)`, `SectionLabel`,
  `PillarTile`)
- `.cascadeReveal(index:visible:)` for new scrollable screens
- `.pressable()` on hero cards
- TypeScript-strict equivalent: no `Any` casts; respect Swift's
  type system
- Default to no new files — extend existing ones
- No emojis in code/commit messages unless asked

---

## Pre-flight before issuing your first command

```bash
cd ~/Downloads/life-os-hbrady
git status                       # confirm clean working tree
git branch --show-current        # should be 'native'
git log -5 --format='%h %s'      # confirm tip is 57d93cc or later
git fetch --all                  # see if anything pushed since

cd native
xcodegen generate                # regenerate project from project.yml
xcodebuild -project LifeOS.xcodeproj -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -5
# Expect: ** BUILD SUCCEEDED **
```

If any remote ref diverged, `git pull --rebase origin native`. The
`main` branch is the older Capacitor work — don't merge `native` into
`main` unless explicitly told to.

---

Good luck.
