# Life OS — Session handoff (native iOS port)

> Read this in full before issuing commands. Snapshot for resuming the
> native iOS work.

```bash
cd ~/Downloads/life-os-hbrady && ./scripts/handoff-native.sh
```

---

## State (2026-05-26)

- **Branch:** `native` at `a32ecaf`
- **Working tree:** clean
- **Pushed to:** origin/native, life-os-dev/native, carter/native:main — all at `a32ecaf`
- **TestFlight:** 1.0 (1) shipped May 22. 1.1 (2) is bumped in `project.yml` — awaiting Xcode Archive + Upload (no CI yet)
- **Project version on disk:** MARKETING_VERSION `1.1`, CURRENT_PROJECT_VERSION `2`

---

## Session arcs that landed since 2026-05-22

This is what's true today on top of the prior state:

**1. Data backbone is real.** Every Today/Analysis chart reads from `DailyEntry` /
`LiftSessionEntry` / `MealLog` / `HabitEntry` now. The `Sample.*` placeholders are
gone from the productive paths. `AnalysisDataProvider` is the central snapshot
function — pure-functional, cached in `@State` and refreshed via `.onChange` on
range/count keys so chart cards don't re-walk 30 days every body eval.

**2. Recovery + Strain are computed.** `RecoveryCalculator` (0–100, HRV/RHR/sleep/
mood weighted) and `StrainCalculator` (0–21, lift volume + active energy) feed
the `RecoveryStrainHero` on Today. `RecoveryAdvice` derives a one-line training
recommendation that pairs with the hero (green=push, yellow=moderate, red=rest).

**3. HealthKit + Google Health both real.** `HealthKitManager.syncToday(in:)`
hydrates today's DailyEntry from HK (sleep totals + per-stage breakdown,
HRV/RHR/steps/weight). `HealthSync` switches between Apple Health / Google
Health / Manual per `UserSettings.healthDataSource`. **The CPU pegging on tab
switch was caused by this:** sync ran unconditionally on every appear, rewrote
SwiftData fields, triggered @Query churn across every screen. Now throttled to
60s (force-bypass via pull-to-refresh).

**4. Google Health is end-to-end wired for iOS.** Tokens moved out of httpOnly
cookies (iOS couldn't see them) into the Neon `integrations` table, AES-256-
GCM encrypted via `lib/db/encryption.ts`. OAuth user attribution via signed
state JWT (`state-jwt.ts`) — iOS hits `/api/google-health/auth/start?bearer=<JWT>&client=ios`,
server signs `{userId, nonce}` into the OAuth state, callback (`/api/fitbit/callback`)
decodes + persists tokens under that user. Returns via `lifeos://google-health/connected`
deep link. `GoogleHealthClient.handleReturn` + `LifeOSApp.onOpenURL` close the
loop. Sync decoder matches the real `{ updates: [{date, fields}], syncedAt,
range, persisted }` server shape — old decoder expected top-level fields that
never existed.

**5. UI overhaul layer 1.** Floating Liquid Glass tab bar replaces stock
`TabView`; ambient mesh-gradient background (iOS 18+ MeshGradient, iOS 17
LinearGradient fallback); `LiquidGlassBackground` modifier with depth-aware
shadow + tint-aware radial glow; `Card` delegates to it; sheen overlay; soft
halo behind hero rings; cross-fading tab content (220ms ease-in-out); skeleton
shimmer for async cards (CorrelationsCard / NutritionInsightsCard);
`HeroSectionLabel` with gradient hairline; `EmptyStateCard` premium empty state;
`TrendDelta` direction-aware pill (upIsGood vs upIsBad); `VitalTile` upgrade
with content-transitions + bigger numbers.

**6. Habits overhaul.** Custom cadence (daily/weekdays/weekends/specific
days/N-per-week), count-based habits with +/-, categories, archived state,
30-day heatmap strip, detail view with stats grid, editor sheet, themed seed
packs. `HabitCore.swift` + `HabitComponents.swift` carry the primitives.

**7. PR celebration overlay.** Mid-workout: when a completed set beats all-time
top weight or estimated 1RM, an animated trophy card pops with double haptic.
Auto-dismisses at 2.4s.

**8. Workout templates + muscle volume.** Six built-in templates (Push/Pull/
Legs/Upper/Lower/Full Body) seeded on first launch. Tap Start → picker sheet.
`MuscleVolumeRollup` aggregates 7-day per-muscle volume (cached in @State for
perf). Last-performance banner under each exercise in active workout.

**9. Nutrition: saved meals, quick-add, weekly summary, meal categorization.**
SavedMeal favorites with usage-count ranking; QuickAddCaloriesSheet for ad-hoc
logging; meals grouped Breakfast/Lunch/Dinner/Snack via time-of-day derive +
manual override; WeeklyNutritionSummary screen pushed from toolbar.

**10. TDEE wizard.** Sex/age/height/weight/activity/goal → Mifflin-St Jeor BMR
× activity × goal modifier → 40/30/30 (maintain) or 40/40/20 (cut) or 30/45/25
(bulk) macro split. Writes through to UserSettings.

**11. Behavior correlation engine.** New `/api/correlations` route. iOS sends
30-day daily snapshot + journal flags + workout/meal counts; Gemini returns
3-5 correlations with effect size, sample sizes, confidence qualifier. Lazy
loaded from CorrelationsCard on Analysis tab.

---

## Architecture decisions made this session

| Decision | Why |
|---|---|
| **No CloudKit, stay on Vercel+Neon** | iOS-only target now, but keeping one DB makes future surfaces (web mirror, multi-device read) cheaper. |
| **Hybrid auth: device-bound default + optional Apple/Google link** | SIWA provisioning was blocking app launch entirely. App now opens with zero friction; Settings has opt-in "Link Apple ID" / "Link Google" that migrates existing data to an identity-bound user. |
| **JWT subject = prefixed external ID; DB id = hashed UUID** | Live `users.id` was uuid-typed; prefixed strings like `device:<uuid>` 22P02'd. SHA-1-hash the prefixed string into a deterministic UUID at the SQL boundary. iOS keeps the prefix via `AuthStore.identityProvider`. |
| **Middleware allows bearer-token /api/* through** | Was 307'ing every iOS API call to /signin → surfaced as "Failed to find Server Action" client-side. Cookie-gate now only applies to non-bearer requests on page routes. |
| **Two Live Activities with relevanceScore stacking** | One card couldn't fit all the elements. iOS doesn't let us prevent LA stacking; we use relevanceScore (Controls=100, Info=50) so the system places Controls on top. Each card has a peek-strip designed for the back-of-stack case. |
| **Branding scrub: no "Gemini" or "OpenFoodFacts" in UI** | Generic "AI estimate" / "Pulled from the label". Backend route comments still mention providers — not user-visible. |

---

## What works end-to-end

| Feature | Status | Notes |
|---|---|---|
| App launches with zero friction | ✅ | Device UUID → JWT auto-mints on first launch via `/api/auth/device-mint` |
| Settings → Link Apple ID | 🟡 | Backend works (`/api/auth/link-identity` 200s); client-side blocked by SIWA capability on dev account until provisioning is sorted |
| Settings → Link Google | 🟡 | iOS OAuth client ID lives in `project.yml`; `GOOGLE_IOS_CLIENT_ID` env var must be set on Vercel for audience-check to pass |
| Workout flow (start → log sets → finish) | ✅ | Drop sets indented + chipped, swipe-to-delete (custom drag in `SetRow.swift` since `.swipeActions` doesn't work outside a List), superset menu, plate calc, RPE drawer |
| Per-session detail screen with charts | ✅ | Tap any row in Gym → Recent sessions |
| Live Activity (Info + Controls cards) | ✅ | Controls on top, info peeks, parallel `Activity.update` for ~halved latency, 50ms pulse-clear tick |
| Lock-screen tap → haptic + button pulse | ✅ | Haptic fires inside intent (main app process), pulse via `lastAction` + `lastActionAt` in `WorkoutContentState` |
| Nutrition: barcode (camera) | ✅ | VisionKit DataScanner → OpenFoodFacts → servings stepper review sheet (macros read-only) |
| Nutrition: photo (camera OR library) | ✅ | UIImagePickerController for camera + PhotosPicker for library |
| Nutrition: voice (hold-to-record) | ✅ | AVAudioRecorder → `/api/voice-meal` |
| Meal edit + delete | ✅ | Tap row → edit sheet, long-press → context menu |
| Analysis tab → Overseer coach chat | ✅ | Streams from `/api/overseer`, no provider named in UI |
| SyncService → Neon | ✅ | lift_sessions, habits, journal_entries, meals (raw-SQL data-layer) |
| Mock data seeder (Settings → Test Data) | ✅ | Throwaway. Populate generates 30d of realistic data, Wipe nukes the local SwiftData store |
| Delete PRs (long-press on PR row) | ✅ | Context menu in GymView |

---

## What's still placeholder / unwired

- **Body screen** — not built
- **Push notifications (APNs)** — entitlement set, no device-token registration code
- **Recipe builder + searchable food database** — MFP-killer features still missing. Capture is barcode + AI estimate + favorites only
- **Sleep coach + auto-detect HK workouts + HR zones** — sleep stages render but no recommended-bedtime / next-day-strain coach yet
- **Apple Watch companion** — separate target, not started
- **Xcode Cloud workflow not created.** `ci_scripts/ci_post_clone.sh` is in place (installs xcodegen + regen on each cloud build), but no workflow exists yet to trigger on push. User must `Product → Xcode Cloud → Create Workflow` in Xcode once; see "Xcode Cloud setup" below
- **Google Health connect flow being verified on device.** Env vars `GOOGLE_HEALTH_CLIENT_ID / SECRET / REDIRECT_URI` need to be set on Vercel (Web OAuth client created in Google Cloud project `778767465909`; redirect URI must be exactly `https://life-os-carter.vercel.app/api/fitbit/callback`). On last test the OAuth was hitting an unrelated "Edge Finder" project — root cause was stale/missing Vercel env. Redeploy after env changes

---

## Vercel env vars

Set on **Production / Preview / Development**, then **Deployments → latest → Redeploy**:

| Env var | Required? | What breaks without it |
|---|---|---|
| `DATABASE_URL` | YES | Every `/api/*` 500 |
| `DATABASE_URL_UNPOOLED` | YES (for `db:push`) | drizzle-kit DDL ops |
| `NEXTAUTH_SECRET` | YES (32+ char random, `openssl rand -base64 32`) | Every bearer JWT 401 |
| `GEMINI_API_KEY` | YES | Voice/photo/Coach all 500 |
| `GOOGLE_IOS_CLIENT_ID` | YES (`778767465909-49jj6q2nd2gcn4qocvnlmgvbv8lhknuk.apps.googleusercontent.com`) | Link Google in Settings 401s |
| `GOOGLE_HEALTH_CLIENT_ID` | YES for Fitbit/Pixel users (`778767465909-8o8pcgqa81j1hp81hef48jkvi4eq3la4.apps.googleusercontent.com`) | Connect Google Health → 500 / "unsupported_response_type" |
| `GOOGLE_HEALTH_CLIENT_SECRET` | YES for Fitbit/Pixel users | OAuth callback can't exchange code |
| `GOOGLE_HEALTH_REDIRECT_URI` | YES for Fitbit/Pixel users (must be `https://life-os-carter.vercel.app/api/fitbit/callback` — matches Google Cloud Console registered URI) | OAuth "redirect_uri_mismatch" |
| `CRON_SECRET`, `VAPID_*`, `AUTH_GOOGLE_*`, `BLOB_READ_WRITE_TOKEN` | Optional | Legacy/web features only — confirmed via grep, no iOS impact |

---

## Open items (priority order)

1. **Verify Google Health connect flow on device.** Add `GOOGLE_HEALTH_*` env vars on Vercel
   → redeploy → open iOS app → Settings → Health Source → Google Health → Connect → consent in
   Safari → returns via `lifeos://` deep link → "synced" shows in Settings. On the last attempt
   it errored with "unsupported_response_type" from an unrelated "Edge Finder" project —
   meaning `GOOGLE_HEALTH_CLIENT_ID` on Vercel was stale/wrong. Re-check the saved value.
2. **Upload 1.1 (2) to TestFlight.** `Product → Archive` in Xcode (destination: Any iOS Device),
   Organizer → Distribute App → App Store Connect → Upload. ~15 min processing. Or follow
   "Xcode Cloud setup" below to automate future uploads.
3. **Rotate three secrets that were pasted in chat.** `NEXTAUTH_SECRET`, `GEMINI_API_KEY`,
   `GOOGLE_HEALTH_CLIENT_SECRET`. NEXTAUTH_SECRET rotation logs out all iOS users + breaks
   encrypted Google Health tokens in Neon (the AES key is HKDF-derived from it) — pick a quiet
   moment, update Vercel + local in lockstep.
4. **Body screen** — unbuilt. Weight trend, body comp, photos.
5. **APNs token registration + push** — `UserNotifications` permission,
   `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`, POST to
   `/api/push/register-apns`.
6. **Recipe builder + searchable food database** — biggest remaining MFP gap.
7. **Sleep coach + auto-detect HK workouts + HR zones** — biggest remaining Whoop gap.
8. **Revert raw-SQL bypasses to clean Drizzle** — only safe AFTER confirming the new Neon DB
   matches `schema.ts` (which it does, post-`db:push`). Files to revert:
   `src/lib/data/{meals,habits,workouts}.ts`,
   `src/app/api/auth/{device-mint,native-mint,link-identity}/route.ts`,
   `src/lib/auth-server.ts`, `src/lib/user-id.ts`.

---

## Xcode Cloud setup (one-time, ~10 min)

Once configured, every push to `carter:main` auto-archives + uploads to TestFlight.

1. Open `native/LifeOS.xcodeproj` in Xcode
2. **Product → Xcode Cloud → Create Workflow**
3. Wizard:
   - Authorize Apple's GitHub app on `CrimsonCVoid/life-os-carter`
   - Workflow name: `TestFlight`
   - Start condition: Branch → `main`
   - Environment: macOS latest, Xcode latest
   - Actions: delete default Build → add **Archive** → **Deployment Preparation: Internal Testing** → pick your `test` group
4. Run manually once from the Xcode Cloud panel to verify `ci_scripts/ci_post_clone.sh`
   installs xcodegen + regenerates the project (script lives at repo root; auto-discovered)
5. Before every push, bump `CURRENT_PROJECT_VERSION` in `native/project.yml` — TestFlight
   rejects duplicate build numbers

---

## Gotchas accumulated this session

1. **`.swipeActions` only works inside `List`** — every SetRow / MealRow / etc. that lives in a
   `LazyVStack` needs a `.contextMenu` (long-press) or a custom DragGesture instead. `SetRow.swift`
   has the canonical custom-drag implementation; copy that pattern when you need swipe-to-delete
   outside a List.

2. **Drizzle's `.returning()` with no args = `RETURNING *`** which references every schema column —
   if the live DB is missing one, every insert 500s. Use `.returning({id: table.id})` or raw SQL
   when you can't fully trust the live schema. With the new Neon DB this should be fine; the raw-SQL
   bypasses are defensive.

3. **iOS won't unstack two Live Activities for one app.** No API for "render side by side." Best
   you can do is `relevanceScore` to control which floats on top + peek-strip design on the back
   card.

4. **LiveActivityIntent runs in the main app process** — so `UIImpactFeedbackGenerator` and
   `UINotificationFeedbackGenerator` work from inside `perform()`. Fire haptics BEFORE awaiting
   `Activity.update` so the user feels confirmation before the visual lands.

5. **Push two activities in parallel via `async let`** — each `Activity.update` is a ~50-100ms IPC.
   Awaiting serially doubles per-tap latency.

6. **`vercel env pull` defaults to `development` environment** which only has `VERCEL_OIDC_TOKEN`.
   Use `--environment=production` for the real env vars.

7. **Next.js middleware was bouncing every bearer-bearing /api/* to /signin** until the fix in
   `src/middleware.ts`. If you add new public-ish routes, mind the matcher there.

8. **The Neon `users.id` column type is `text`** in the new DB — `schema.ts` is the source of
   truth. The `externalIdToUuid` hashing is defensive code in case it ever goes back to uuid.

9. **iOS Live Activity height cap** — ~220pt on pre-26 devices, ~260pt on iPhone 17 + iOS 26. The
   current twin-card layout uses ~140pt per card. Don't add more rows.

10. **SwiftData `@Query` only re-runs when the predicate changes** — if you toggle a `@State` flag
    inside a row's button handler expecting the list to refresh, it won't unless you also dirty the
    underlying model. `try? modelContext.save()` after every mutation is the safe path.

---

## File map — `native/`

```
native/
├── project.yml                         # XcodeGen source. DEVELOPMENT_TEAM empty (line 28)
├── App/
│   ├── LifeOSApp.swift                 # @main, no auth gate, ensureSignedIn() on appear
│   ├── Services/
│   │   ├── APIClient.swift             # bearer auth + GET/POST + stream + uploadJPEG + uploadAudio
│   │   ├── AuthStore.swift             # device-bound auto-mint + identityProvider
│   │   ├── IdentityLinker.swift        # Apple SIWA + Google OAuth via ASWebAuthenticationSession
│   │   ├── Keychain.swift              # SecItem wrapper
│   │   ├── SyncService.swift           # SwiftData → Neon: lift_sessions, habits, journal, meals
│   │   ├── MockDataSeeder.swift        # Throwaway test-data populator (DELETE BEFORE PUBLIC)
│   │   ├── HealthKitManager.swift
│   │   ├── LiveActivityManager.swift   # Two activities (Info + Controls) with relevanceScore
│   │   ├── WorkoutCommandConsumer.swift
│   │   ├── PersonalRecordsService.swift
│   │   ├── CSVExporter.swift
│   │   └── Haptics.swift
│   ├── Views/
│   │   ├── TodayView.swift             # placeholder data
│   │   ├── NutritionView.swift         # quick-capture chips launch directly; + opens manual sheet
│   │   ├── HabitsView.swift            # SwiftData + drain SyncService on toggle
│   │   ├── GymView.swift               # freeform start, NO splits, PR delete via long-press
│   │   ├── AnalysisView.swift          # 10 insight cards + Coach chat at top
│   │   ├── SettingsView.swift          # ACCOUNT (linking) + INTEGRATIONS + TEST DATA
│   │   ├── AddMealSheet.swift          # Manual entry + edit existing meal
│   │   ├── Analysis/
│   │   │   └── CoachChatView.swift     # Streaming chat against /api/overseer
│   │   ├── Nutrition/
│   │   │   ├── BarcodeScannerView.swift
│   │   │   ├── MealCaptureDTO.swift
│   │   │   ├── MealReviewSheet.swift   # Servings stepper for barcode, editable form for AI
│   │   │   ├── OpenFoodFactsClient.swift
│   │   │   ├── PhotoMealSheet.swift    # Camera OR library
│   │   │   └── VoiceRecorderSheet.swift
│   │   └── Workout/
│   │       ├── ActiveWorkoutView.swift # Supersets, history-seeded sets, content-shape add-exercise
│   │       ├── ExercisePickerView.swift # No "Recent" section (dropped per user feedback)
│   │       ├── ExerciseHistoryView.swift
│   │       ├── PlateCalculator.swift
│   │       ├── RPEDrawer.swift
│   │       ├── SetRow.swift            # Custom DragGesture swipe-to-delete + drop-set chip
│   │       └── WorkoutDetailView.swift # Per-session breakdown with charts
│   └── Models/
│       ├── Models.swift                # @Models with needsSync + serverID flags
│       ├── ActiveWorkout.swift
│       ├── ExerciseLibrary.swift
│       └── PersonalRecord.swift
└── WidgetExtension/
    ├── WidgetBundle.swift              # Registers WorkoutActivityWidget + WorkoutControlsWidget
    ├── TodaySnapshotWidget.swift
    ├── WorkoutActivityWidget.swift     # INFO card — header + hero (timer/last-set/next-up)
    ├── WorkoutControlsWidget.swift     # CONTROLS card — three pulse buttons + peek strip
    └── WorkoutLiveActivityIntents.swift # Haptic + parallel async-let dual update
```

---

## File map — `src/` (Vercel backend)

```
src/
├── middleware.ts                       # Bearer-token /api/* whitelist
├── lib/
│   ├── auth-server.ts                  # getCurrentUser: bearer OR cookie, hashes prefix → UUID
│   ├── native-jwt.ts                   # HS256 mint/verify, 180d TTL, key from NEXTAUTH_SECRET
│   ├── apple-token-verify.ts           # SIWA JWKS verify
│   ├── google-token-verify.ts          # Google JWKS verify, audience-checked
│   ├── user-id.ts                      # externalIdToUuid (SHA-1 → UUID format)
│   ├── migrate-user-id.ts              # Transactional FK migration across 45 tables
│   ├── api-helpers.ts                  # withUser / withUserRequest chokepoints
│   ├── data/                           # createMeal/createHabit/createLiftSession use raw SQL
│   └── db/schema.ts                    # Source of truth, matches new Neon DB exactly
└── app/api/
    ├── auth/
    │   ├── device-mint/route.ts        # Anonymous per-device JWT, raw SQL upsert
    │   ├── native-mint/route.ts        # SIWA → JWT, raw SQL
    │   └── link-identity/route.ts      # Upgrade device user to Apple/Google
    ├── data/                           # ~30 existing routes, work as-is
    ├── food-photo/route.ts             # Multipart JPEG → AI → macros
    ├── voice-meal/route.ts             # Multipart audio → AI → meal macros
    ├── voice-journal/route.ts          # Multipart audio → AI → journal entry
    └── overseer/route.ts               # Streaming chat, empty-context-tolerant
```

---

## Standard commands

```bash
# Regenerate xcodeproj from project.yml
cd native && xcodegen generate

# Headless sanity build
xcodebuild -project native/LifeOS.xcodeproj -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO

# Web build (TypeScript check)
npm run build

# Push to three refs. carter:main is the production deploy.
# Do NOT also push to carter:native — both branches resolve to the
# same Vercel project and you end up with a Production build PLUS a
# queued Preview build for the same SHA, doubling deploy time.
git push origin native && \
  git push life-os-dev native && \
  git push carter native:main

# Database migrations against the new Neon project
npm run db:push          # uses DATABASE_URL_UNPOOLED from .env.local

# Pull production env vars from Vercel (after vercel link)
vercel env pull .env.local --environment=production
```

---

## Persistent rules

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push to three refs (origin/native, life-os-dev/native, carter/native:main) — skip carter/native to avoid duplicate Vercel build
- Run `xcodebuild` sanity-build before committing big changes
- No inline hex — use `LifeOSColor.*` tokens
- Use existing primitives (`Card`, `SectionLabel`, `PillarTile`, `.cascadeReveal`, `.pressable`)
- No emojis in code/commit messages unless asked
- `.swipeActions` doesn't work in `VStack` — use `.contextMenu` or custom `DragGesture`
- Drizzle `.returning()` defaults to `RETURNING *` — explicit column projection or raw SQL
- iOS will stack Live Activities; design for it, can't prevent it
- Never commit `.env*` files

---

## Do NOT do without explicit user authorization

- `git reset --hard` on any pushed branch
- `git push --force` to `main` of any remote (use `--force-with-lease`)
- Delete `ios/` (Capacitor v1 preserved there)
- `--no-verify` on commits
- Rotate `NEXTAUTH_SECRET` on Vercel (logs everyone out)
- Anything that costs money

---

## Pre-flight before issuing your first command

```bash
cd ~/Downloads/life-os-hbrady
git status                          # clean tree
git branch --show-current           # 'native'
git log -3 --format='%h %s'         # tip ≥ dcf339b
git fetch --all                     # see if anything pushed since

cd native && xcodegen generate
xcodebuild -project LifeOS.xcodeproj -scheme LifeOS \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -3
# expect: ** BUILD SUCCEEDED **

cd ..
curl -sX POST https://life-os-carter.vercel.app/api/auth/device-mint \
  -H 'content-type: application/json' \
  -d '{"deviceId":"550e8400-e29b-41d4-a716-446655440000"}' \
  -w '\nHTTP %{http_code}\n' | tail -3
# expect: 200 with {"token":"...","userId":"device:..."}
```

If device-mint returns 500 with `password authentication failed`, Vercel's DATABASE_URL still
points at the old (broken) Neon project — update `DATABASE_URL` + `DATABASE_URL_UNPOOLED` env vars
to the new project and redeploy.

---

Good luck.
