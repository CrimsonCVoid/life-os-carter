# Life OS — Session handoff (native iOS port)

> Read in full before issuing commands. Snapshot for resuming the
> native-port work.

```bash
cd ~/Downloads/life-os-hbrady && ./scripts/handoff-native.sh
```

---

## State (2026-05-22, late)

- **Branch:** `native` at `29067ed` (Add Sign in with Apple entitlement to project.yml)
- **Working tree:** clean
- **Pushed to:** origin/native, carter/native, life-os-dev/native, AND carter/main (Vercel's prod source) — all at `29067ed`
- **Older `main` branches on origin + life-os-dev:** still at `5db2ba8` (pre-native-port). Don't deploy from these. Update them only when you also push to `carter:main`.

---

## The honest "what works / what doesn't" matrix

| Area | Status |
|---|---|
| Native app builds clean (Cmd-R works) | ✅ |
| Sign in with Apple — entitlement, capability, mint route | ✅ pipeline complete |
| Bearer JWT auth — Keychain + APIClient interceptor | ✅ |
| Backend `users` row created on first sign-in | ✅ |
| Backend `getCurrentUser()` accepts bearer OR cookie | ✅ |
| SwiftData local persistence (workouts, habits, meals, journal, PRs) | ✅ |
| Live Activity + Dynamic Island during workouts | ✅ |
| Live Activity interactive buttons (iOS 17 LiveActivityIntent) | ✅ |
| App icon, Today screen visual layout, Analysis tab | ✅ visual only |
| HealthKit reads → Today/Analysis | ❌ placeholders only |
| Swift → Neon sync for workouts | ❌ not wired |
| Swift → Neon sync for meals / habits / journal | ❌ schema + sync both missing |
| Gemini Overseer chat from native | ❌ APIClient.stream() exists, no view calls it |
| Gemini food photo / voice journal / briefing | ❌ APIClient.uploadJPEG() exists, no view calls it |
| Cross-device data sync | ❌ depends on the above |
| Push notifications (APNs) | ❌ not started |

---

## CRITICAL — Vercel env vars to set before testing on device

Vercel dashboard → `life-os-carter` project → Settings → Environment
Variables. The native app talks to https://life-os-carter.vercel.app
which deploys from `carter/main`. Without these, sign-in will fail
with 500 and Gemini features return missing-key errors.

```
# REQUIRED for native sign-in
NEXTAUTH_SECRET    = openssl rand -base64 32 → paste output
DATABASE_URL       = Neon pooled connection string

# REQUIRED for AI features (Overseer, food photo, etc.)
GEMINI_API_KEY     = https://aistudio.google.com/apikey → free
```

After adding any env var, **manually redeploy** (Vercel Deployments
→ top entry → ⋯ → Redeploy) — env var changes don't auto-trigger
a rebuild.

**Verify deploy is live:**
```bash
curl -sI https://life-os-carter.vercel.app/api/auth/native-mint
# Expect: HTTP/2 400 + x-matched-path: /api/auth/native-mint
# If x-matched-path shows /api/auth/[...nextauth] → carter/main is
# behind native. Fix: git push carter native:main
```

---

## Topology

| Remote | URL | Branches | Notes |
|---|---|---|---|
| `origin` | hbrady7/life-os | native, main, pre-v2-* backups | |
| `life-os-dev` | Life-Os-Development/life-os-main | native, main | |
| `carter` | CrimsonCVoid/life-os-carter | native, main, pre-v2-* | **Vercel deploys from carter/main** |

**Push pattern when shipping anything that touches `src/` (backend) OR `native/` (iOS):**

```bash
git push origin native && \
  git push carter native && \
  git push life-os-dev native && \
  git push carter native:main          # this one triggers Vercel deploy
```

Alternative: switch Vercel's production branch from `main` to `native`
in dashboard → Settings → Git. Then only the first three pushes
needed, and Vercel auto-deploys on every push to `native`.

---

## Schema state (Neon)

**Tables that exist** (from Capacitor v2 work in `src/lib/db/schema.ts`):

- `users` ← native-mint creates `apple:<sub>` rows here
- `accounts`, `sessions`, `verification_tokens` ← Auth.js
- `lift_sessions` ← workout history; iOS app has matching `LiftSessionEntry` @Model but doesn't sync yet
- `push_subscriptions`
- `workout_hr_series`

**Tables that DON'T exist** (native @Models with no Neon counterpart):

- meals (iOS: `MealLog`)
- habits (iOS: `HabitEntry`)
- journal_entries (iOS: `JournalEntry`)
- daily_entries (iOS: `DailyEntry`) — water/mood/energy/weight/etc.
- personal_records (iOS: `PersonalRecord`)

Adding these = edit `src/lib/db/schema.ts` + `npm run db:push`. Then
create matching `/api/data/<table>` route handlers, then wire the
iOS side to POST after each SwiftData write.

---

## File map — `native/`

```
native/
├── project.yml                         # XcodeGen single source of truth
├── App/
│   ├── LifeOSApp.swift                 # @main, sign-in gate, env injection
│   ├── LifeOS.entitlements             # generated; now includes applesignin
│   ├── Root/RootView.swift             # 5-tab nav
│   ├── Theme/                          # Color tokens, glass modifier
│   ├── Components/                     # Card, Rings, Sparkline, etc.
│   ├── Views/
│   │   ├── TodayView.swift             # placeholders, cascade reveal
│   │   ├── NutritionView.swift         # AddMealSheet works, no sync
│   │   ├── HabitsView.swift            # SwiftData only
│   │   ├── GymView.swift               # freeform start, no template system
│   │   ├── AnalysisView.swift          # 10 insight cards (placeholder data)
│   │   ├── SettingsView.swift          # HealthKit auth toggle only
│   │   ├── SignInView.swift            # Sign in with Apple gate
│   │   ├── AddMealSheet.swift
│   │   └── Workout/                    # ActiveWorkout + ExercisePicker + SetRow + RPE + PlateCalc + ExerciseHistory
│   ├── Models/
│   │   ├── Models.swift                # 5 @Model entities
│   │   ├── ActiveWorkout.swift         # in-flight @Observable store
│   │   ├── PersonalRecord.swift        # PR @Model + Brzycki 1RM
│   │   └── ExerciseLibrary.swift       # 50-row catalog
│   └── Services/
│       ├── APIClient.swift             # bearer auth + GET/POST + stream + uploadJPEG
│       ├── AuthStore.swift             # @Observable, owns Keychain token
│       ├── Keychain.swift              # SecItem wrapper
│       ├── HealthKitManager.swift      # read + write, auth requested on launch
│       ├── LiveActivityManager.swift   # start/update/end with rich state
│       ├── WorkoutCommandConsumer.swift # drains App Group queue from widget intents
│       ├── PersonalRecordsService.swift # PR computation
│       ├── CSVExporter.swift
│       └── Haptics.swift
├── Shared/
│   └── WorkoutActivityAttributes.swift # In BOTH targets
└── WidgetExtension/
    ├── WidgetBundle.swift
    ├── TodaySnapshotWidget.swift
    ├── WorkoutActivityWidget.swift     # Liquid Glass LA UI
    └── WorkoutLiveActivityIntents.swift # Complete Set / +30s / Skip
```

## File map — `src/` (Vercel backend, what's new this session)

```
src/
├── lib/
│   ├── auth-server.ts                  # NEW: bearer-OR-cookie auth
│   ├── native-jwt.ts                   # NEW: HS256 mint/verify (180d TTL)
│   └── apple-token-verify.ts           # NEW: JWKS verify of Apple idToken
└── app/api/auth/native-mint/
    └── route.ts                        # NEW: POST { identityToken, bundleId } → { token, userId }
```

The rest of `src/` (existing `/api/data/*`, `/api/overseer`, etc.)
is untouched. Every existing route auto-accepts the native bearer
token via the updated `requireUser()` — no per-route changes needed.

---

## Standard commands

```bash
# Regenerate xcodeproj from project.yml (after editing it OR adding
# Swift files outside Xcode):
cd native && xcodegen generate

# Open
open native/LifeOS.xcodeproj

# Headless sanity build:
xcodebuild -project native/LifeOS.xcodeproj -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO

# Push (lockstep, INCLUDING the carter/main deploy ref):
git push origin native && \
  git push carter native && \
  git push life-os-dev native && \
  git push carter native:main

# Database migrations (after editing src/lib/db/schema.ts):
npm run db:push
```

---

## Gotchas

1. **`carter/main` is what Vercel deploys.** Pushing to `native`
   alone doesn't trigger a rebuild. You must also `git push carter
   native:main`, OR switch Vercel's production branch to `native`.

2. **XcodeGen overwrites entitlements.** The Sign in with Apple
   entitlement is declared in `project.yml` so it survives
   regeneration. If you ever add a capability via Xcode UI, mirror
   it into `project.yml` immediately or the next `xcodegen` wipes it.

3. **One scheme only — LifeOS.** `project.yml` has a `postGenCommand`
   that deletes the auto-generated WidgetExtension.xcscheme so Xcode
   doesn't keep switching to it (which causes "Unable to launch
   (null)" SpringBoard rejections).

4. **iPhone must be unlocked** while Xcode installs.

5. **SwiftData inverse relationships:** Insert parent + children
   first, THEN wire `parent.children = [...]` and `child.parent =
   parent` explicitly. Setting before insertion silently drops the
   link.

6. **`#Predicate<T>` macro + `enum.rawValue`:** Bind raw values to
   locals first (`let kindRaw = kind.rawValue`) — the macro can't
   always type-check inline enum access.

7. **SourceKit lint noise:** Many Swift files show "Cannot find X in
   scope" errors in Xcode's source-side analyzer. These resolve at
   build time. Trust `xcodebuild ... BUILD SUCCEEDED`.

---

## Open items — priority order

### 1. Verify sign-in works end-to-end (~5 min, USER does this)

After setting `NEXTAUTH_SECRET` + `DATABASE_URL` + `GEMINI_API_KEY`
on Vercel and redeploying:

- Delete Life OS from your iPhone
- Xcode → Product → Clean Build Folder (Cmd-Shift-K)
- Cmd-R → fresh install
- Tap Sign in with Apple → Face ID → should land you in the main app
- Check Neon: `SELECT id, email FROM users WHERE id LIKE 'apple:%';`
  should show a new row

Only after this works should we wire data sync.

### 2. Wire lift session sync (first sync feature — proves the pattern)

The smallest viable cross-device sync. Steps:

1. Add `needsSync: Bool = true` to `LiftSessionEntry` @Model
2. Define `SessionDTO: Codable` matching the existing
   `lift_sessions` Neon table shape
3. In `ActiveWorkoutView.persistAndIngest`, after `modelContext.save()`:
   ```swift
   Task {
       do {
           _ = try await APIClient.shared.post(
               "/api/data/lift-sessions",
               body: dto,
               as: OKResponse.self
           )
           entry.needsSync = false
           try? modelContext.save()
       } catch {
           // Stays needsSync=true; retry later
       }
   }
   ```
4. Add a `SyncService.shared.drainPending()` called on app foreground

~50 lines total. Validates the auth + API path end-to-end.

### 3. Wire HealthKit reads into Today + Analysis

Replace `Sample` enum static data in `TodayView.swift` and
`AnalysisView.swift` with calls to `HealthKitManager.fetchSum/
fetchAverage`. Put results in a `@Observable HealthDataStore`
that's refreshed on `.task` modifiers.

### 4. Extend Neon schema for the missing tables

Edit `src/lib/db/schema.ts`, add tables for: meals, habits,
journal_entries, daily_entries, personal_records. `npm run db:push`.
Add corresponding `/api/data/<table>` route handlers. Then wire
the iOS side per feature (same pattern as #2).

### 5. AI coach (Overseer) streaming

Build `OverseerView` accessible from a floating button. Use
`APIClient.shared.stream("/api/overseer", body: { messages, context })`
to render tokens as they arrive. Existing Vercel route handles
Gemini.

### 6. Food photo + voice journal Gemini paths

Use `APIClient.shared.uploadJPEG("/api/food-photo", image: …)` in
`AddMealSheet`. Voice journal needs Speech.framework on-device →
upload audio to `/api/voice-journal`.

### 7. Push notifications

`UserNotifications` permission + device token registration → POST
to a new `/api/push/register-apns` route (write that route).

### 8. Sync retry queue + offline UX

Once 2+ features sync, generalize the per-feature retry into a
`SyncQueue` that tracks pending writes per @Model type and drains
on connectivity events.

---

## Persistent rules

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push to all four refs (origin/native, carter/native,
  life-os-dev/native, **carter/native:main**) after every commit —
  the last one is what triggers Vercel
- Run `xcodebuild` sanity-build before committing big changes
- No inline hex — use `LifeOSColor.*`
- Use the existing `Card`, `Card(tint:)`, `SectionLabel` primitives
- `.cascadeReveal(index:visible:)` on new scrollable screens
- TypeScript-strict equivalent: respect Swift's type system, no
  force-unwraps in production paths
- No emojis in code/commit messages unless asked

---

## Do NOT do without explicit user authorization

- `git reset --hard` on any pushed branch
- `git push --force` to `main` of any remote (use `--force-with-lease`)
- Delete the `ios/` directory (Capacitor v1 preserved there)
- Rotate `NEXTAUTH_SECRET` on Vercel (invalidates every signed-in
  user's bearer token; everyone gets logged out)
- Anything that costs money

---

## Pre-flight before issuing your first command

```bash
cd ~/Downloads/life-os-hbrady
git status                          # clean tree
git branch --show-current           # 'native'
git log -3 --format='%h %s'         # tip ≥ 29067ed
git fetch --all                     # see if anything pushed since

# Confirm Vercel is current:
curl -sI https://life-os-carter.vercel.app/api/auth/native-mint | head -10
# expect HTTP/2 400 + x-matched-path: /api/auth/native-mint

# Regenerate + sanity build:
cd native && xcodegen generate
xcodebuild -project LifeOS.xcodeproj -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -3
# expect: ** BUILD SUCCEEDED **
```

If `x-matched-path` shows `/api/auth/[...nextauth]` instead of
`/api/auth/native-mint`, carter/main is behind. Fix:
`git push carter native:main`.

---

Good luck.
