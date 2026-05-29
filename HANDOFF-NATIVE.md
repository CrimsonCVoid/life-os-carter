# Life OS — Session handoff (native iOS port)

> Read this in full before issuing commands. Snapshot for resuming the
> native iOS work.

```bash
cd ~/Downloads/life-os-hbrady && ./scripts/handoff-native.sh
```

---

## State (2026-05-28)

- **Branch:** `native` at `7a344f4`
- **Working tree:** clean
- **Pushed to:** `origin/native`, `life-os-dev/native`, `carter/native:main` — all at `7a344f4`
- **TestFlight:** 1.1 (2) is bumped in `project.yml`. **Multiple iOS-only changes since the last archive** — needs a re-archive to ship the session's app-side work to TestFlight (background sync, light/dark, charts overhaul, manual calorie targets, onboarding ruler, HR graph, etc.).
- **Project version on disk:** MARKETING_VERSION `1.1`, CURRENT_PROJECT_VERSION `2`. Bump CURRENT_PROJECT_VERSION before the next archive.
- **Vercel:** production deploy is the tip of `main` and is healthy.

---

## What this session shipped (since 2026-05-26)

### Auth & Google Health (server) — fully fixed end-to-end
The full Google login + Google Health connect + sync chain was broken in multiple places. Now working:

| Layer | Bug | Fix |
|---|---|---|
| iOS Google login | `unsupported_response_type` on the iOS OAuth client | Auth-code + PKCE in `IdentityLinker` |
| link-identity | 401 missing audience | `GOOGLE_IOS_CLIENT_ID` env var set on Vercel |
| link-identity | 500 "No transactions support in neon-http driver" | Atomic PL/pgSQL `DO` block in `migrateUserIdAndCollapse` |
| link-identity | 42883 `text = uuid` | Bare string literals (no `::uuid` casts), columns adapt |
| GH connect | middleware 307→/signin (bearer in query, not header) | `/api/google-health/auth/start` added to PUBLIC_PATHS |
| GH connect | tokens persisted under raw `google:<sub>`, looked up by hashed UUID | `auth/start` now hashes via `externalIdToUuid` |
| GH sync | 400 `INVALID_DATA_POINT_FILTER_RESTRICTION_COMPARATOR` | Half-open `>=`/`<` ranges (API rejects `<=`) |
| GH sync | 400 "Invalid value at range.start.date" | Structured `google.type.Date`/`TimeOfDay` in `dailyRollUp` body |
| GH sync | 400 "Invalid data type ID" for `cardio-load` | Switched to `active-zone-minutes` |
| GH sync | 200 but `updates:[]` (parsers vs real shapes) | Rewrote parsers — `rollupDataPoints` envelope, structured `civilStartTime`, `steps.countSum`, `weight.weightGramsAvg` (grams!), RHR's `dailyRestingHeartRate.date` object + string bpm |

### New metrics (server + iOS)
- Added to adapter + DailyEntry: **active calories**, **total calories** (14-day window clamp), **distance**, **floors**, **VO₂ max**.
- Active calories now feed StrainCalculator (was hardcoded 0).
- Intraday HR endpoint: `POST /api/google-health/heart-rate { date }` pages the ~1 Hz samples and returns per-minute `avg/min/max` buckets + day stats + restingHr.
- `syncToday` writes **every** synced day to its DailyEntry row (not just today).

### Onboarding (new, gated)
- `UserSettings.hasOnboarded` flag; `RootView` gates the tab UI behind `OnboardingFlow` on first launch.
- 5 steps: welcome → health source (Apple/Google/manual) → biometrics → activity/goal → computed plan.
- Biometrics step uses the new **`RulerPicker`** — horizontal Canvas-drawn number-line with a haptic tick per unit. Height reads "5 ft 10 in" not raw inches.

### Interactive heart-rate graph (Phase 4 marquee)
- `HRDaySeries` SwiftData model (per-day JSON blob; registered in `Schema`).
- `HeartRateClient.loadDay` → upserts the day.
- `HeartRateGraphView` — full-screen Swift Charts: per-minute line + min/max band, dashed resting-HR rule, HR-zone coloring (220−age), workout-window overlays from `LiftSessionEntry`, **drag-to-scrub with a moving readout + `Haptics.tick()` once per minute crossed**.
- Reached via tappable Heart Health card on Analysis.

### Smart Strain & Recovery
- **Strain**: cardio is `max()` of active-energy / steps / distance (no double-count). Mechanical load is volume vs 7-day max **scaled by volume-weighted session RPE** (sRPE; neutral 7.0 when none). RPE recovered from `LiftSessionEntry.detailsJSON` via `CSVExporter.decodeExercises`.
- **Recovery**: now requires sleep (no sleep → nil → empty state). Sleep component blends hours-vs-goal with a stage-quality sub-score (rewards deep ~13–23% / REM ~20–25%, penalizes awake >20%). New **prior-day-strain damper** as a Component. Reweighted HRV 35 / RHR 20 / Sleep 25 / Mood 8 / Prior Strain 12.

### Fake-data charts killed (4 found, 4 gone)
1. Activity rings on Today were `0.4/0.4/0.4` placeholders → wired to real steps/sleep/water progress, recolored per metric.
2. `Sample.hrZones` donut → replaced with real Calories Burned card.
3. VO₂ gauge hardcoded `value: 42` → real `vo2MaxTrend` scrubbable card.
4. Performance contributors `+28/+24/+17/+9` invented → real Sleep/Mood/Energy inputs.
- The `Sample` placeholder enum was **deleted entirely**.

### Interactive Analysis overhaul
- New reusable `ScrubbableTrendChart` — generalises the HR graph's `.chartOverlay` + DragGesture + debounced per-day haptic.
- Drag-to-scrub on Performance / Sleep / Weight / Distance / VO₂ / Calories trends.
- Tappable drill-in `TrendDetailView` for Performance, Sleep, Weight, Steps (own 7d/30d/90d/1y range + min/avg/max/latest header).
- New real-data cards: Calories burned (active + total), Distance, VO₂ max — all with empty states.

### Today UX
- Vital tiles fall back to most-recent reading when today's value doesn't exist (e.g. resting HR), with an "as of yesterday" caption. Steps stays today-only (live counter).
- **Calorie display unified between Today and Nutrition** — both now show TOTAL burned as the headline (Today tile relabeled "Calories", active in the caption). Matches Nutrition's burned ring.

### Manual calorie targets in Settings
- `GoalsEditor` now has a **Computed / Manual** toggle. Manual gives ruler dials for calories + protein/carbs/fat with a live 4/4/9 macros-vs-calories cross-check, saving sets `nutritionTargetMethod = "manual"`.
- TDEE wizard preserved as the computed path.
- **MacroRingsCard wired** to `userSettings.{calories,protein,carbs,fat}Goal` (was hardcoded `2200/180/240/75` with a TODO).

### System light/dark mode
- Every `LifeOSColor` token converted to **adaptive** (dark values unchanged byte-for-byte, new premium light palette: white cards, near-black text, deepened accent/semantic/metric hues for white-bg contrast).
- All 4 forced `.preferredColorScheme(.dark)` calls removed (LifeOSApp, RootView ×2, OnboardingFlow).
- `AmbientBackground` mesh anchors use `LifeOSColor.base` instead of literal black so it follows the theme.
- **Known follow-up:** any view using literal `.white`/`.black` text isn't covered (it's a mechanical sweep; only the most glaring core-chrome bits were handled).

### Background sync (BGAppRefreshTask)
- New `BackgroundSync.swift`. Registered in `LifeOSApp.init()`, scheduled on `scenePhase == .background` with a 15-min floor.
- Handler ensures auth, runs `HealthSync.syncToday(force: true)`, completes in iOS's ~30s budget.
- `project.yml`: `fetch` added to `UIBackgroundModes`, `BGTaskSchedulerPermittedIdentifiers` includes `com.hbrady.lifeos.healthrefresh`.
- **Realities:** iOS chooses the cadence (typically 30–60 min when used often); doesn't fire on Simulator; user can disable via Settings → Background App Refresh.

### App icon
- New mark: complete mint→sky→violet gradient ring around a centered open-armed emerald figure on dark navy. All 11 sizes regenerated from a Swift CoreGraphics 1024 master (`/tmp/whole_self_icon.swift`).

---

## What works end-to-end (refreshed)

| Feature | Status | Notes |
|---|---|---|
| Device-bound auto-mint on first launch | ✅ | unchanged |
| **Onboarding** | ✅ | gated on `hasOnboarded`; ruler dials with haptics; writes calorie + macro targets |
| Settings → Link Apple ID | 🟡 | SIWA provisioning still on user's TODO |
| Settings → Link Google | ✅ | fully fixed (PKCE + audience + transaction + cast) |
| **Connect Google Health + sync** | ✅ | working end-to-end; data flows for steps/RHR/weight/active+total cal/distance (sleep/HRV/floors/VO₂ depend on whether Fitbit has that data) |
| **Intraday HR graph** | ✅ | scrubbable, zones, workout overlays, haptic per minute |
| **Background health sync** | ✅ | best-effort iOS schedule, ≥15 min floor; needs device build to test |
| Strain / Recovery (smart) | ✅ | sRPE + cardio-blend + sleep-stage quality + prior-day damper; sleep required for Recovery |
| Workout flow (start → log sets → finish) | ✅ | unchanged |
| Live Activity (Info + Controls) | ✅ | unchanged |
| Nutrition (barcode / photo / voice / favorites / quick-add / weekly summary) | ✅ | unchanged |
| **Nutrition rings driven by user goals** | ✅ | fix from the hardcoded `2200/180/240/75` |
| **Today/Nutrition calorie consistency** | ✅ | both use total burned as headline |
| **Analysis** | ✅ | scrub-with-haptics on key trends, drill-in detail views, new Calories/Distance/VO₂ cards, **no fake data anywhere** |
| **Manual calorie/macro targets in Settings** | ✅ | Computed / Manual toggle in GoalsEditor |
| **System light/dark** | ✅ | follows phone; tokens adaptive; ambient mesh follows theme |
| Analysis tab → Coach chat | ✅ | streaming `/api/overseer`; **Gemini key still leaked-and-disabled** until you rotate it |
| SyncService → Neon | ✅ | unchanged |

---

## What's still placeholder / unwired

- **Body screen** — not built
- **APNs / push** — entitlement set, no device-token registration code
- **Recipe builder + searchable food database** — MFP-killer features still missing
- **Sleep coach + auto-detect HK workouts + HR zones** — sleep stages render but no recommended-bedtime / next-day-strain coach yet
- **Apple Watch companion** — separate target, not started
- **Xcode Cloud workflow** — `ci_scripts/ci_post_clone.sh` is in place but no workflow yet
- **Light-mode literal-color sweep** — token-driven surfaces adapt cleanly, but any view using literal `.white`/`.black` for text/iconography hasn't been audited
- **LiDAR food photo pipeline** — *intentionally not built* (advised against; LiDAR is Pro-iPhone-only, depth-to-volume of irregular food is unreliable, marginal benefit over Gemini's vision guess)

---

## Open items (priority order)

1. **Rotate the leaked `GEMINI_API_KEY`.** Google scanner caught it, key is disabled. Create new key at `aistudio.google.com/apikey`; on the user's terminal run `vercel env rm GEMINI_API_KEY production preview` then `vercel env add` (paste at prompt, **not** in chat); redeploy. Every AI feature (Coach, voice/photo capture, correlations, insights) 403s until done.
2. **Re-archive 1.2 (or 1.1 build 3) for TestFlight.** Big session-side iOS changes need a new build. Bump `CURRENT_PROJECT_VERSION` first. Widget extension's `CFBundleVersion` is still `1` while the app is `2` — bump that too if Xcode complains.
3. **Verify background sync on a real device.** Won't fire on Simulator. Use the LLDB simulate trick (`e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.hbrady.lifeos.healthrefresh"]`).
4. **Light-mode literal-color sweep** if any screen looks off in light mode (mechanical fixup; user reports the screen, do a quick grep for `Color.white`/`Color.black`/`.white`/`.black` in that file).
5. **Rotate `NEXTAUTH_SECRET` and `GOOGLE_HEALTH_CLIENT_SECRET`** eventually (other pasted secrets). NEXTAUTH rotation logs out all iOS users **and** breaks encrypted Google-Health tokens in Neon (AES key is HKDF-derived from it) — coordinate carefully.
6. **Body screen**, **APNs**, **Recipe builder**, **Sleep coach**, **Apple Watch** — open feature work.
7. **Revert raw-SQL bypasses to clean Drizzle** — only safe after confirming the live Neon DB matches `schema.ts`. Files: `src/lib/data/{meals,habits,workouts}.ts`, `src/app/api/auth/{device-mint,native-mint,link-identity}/route.ts`, `src/lib/auth-server.ts`, `src/lib/user-id.ts`.

---

## Vercel env vars

Set on **Production / Preview / Development**, redeploy after changes:

| Env var | Status | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | pooled, runtime |
| `DATABASE_URL_UNPOOLED` | ✅ | for `db:push` DDL |
| `NEXTAUTH_SECRET` | ✅ | bearer JWT signing key; also HKDF source for AES of Google Health tokens |
| `GEMINI_API_KEY` | ❌ **REVOKED/LEAKED** | rotate ASAP, redeploy |
| `GOOGLE_IOS_CLIENT_ID` | ✅ | `778767465909-49jj6q2nd2gcn4qocvnlmgvbv8lhknuk.apps.googleusercontent.com`; can be Sensitive — read server-side only |
| `GOOGLE_HEALTH_CLIENT_ID` | ✅ | `778767465909-8o8pcgqa81j1hp81hef48jkvi4eq3la4.apps.googleusercontent.com` |
| `GOOGLE_HEALTH_CLIENT_SECRET` | ✅ | rotate eventually (pasted in chat earlier) |
| `GOOGLE_HEALTH_REDIRECT_URI` | ✅ | exactly `https://life-os-carter.vercel.app/api/fitbit/callback` |
| `CRON_SECRET`, `VAPID_*`, `AUTH_GOOGLE_*`, `BLOB_READ_WRITE_TOKEN` | Optional | Legacy / web — no iOS impact |

OAuth consent screen (GCP project `778767465909`): in **Testing** mode; `williamcbrady00@gmail.com` is a test user. Refresh tokens **expire every 7 days in Testing** — Google Health connection breaks weekly until the app is verified or moved to production (heavyweight for restricted health scopes).

---

## Gotchas accumulated this session

(In addition to the ones from the prior handoff.)

1. **Google Health API filter language only supports `>=` and `<`** on time fields. Passing `<=` returns 400 `INVALID_DATA_POINT_FILTER_RESTRICTION_COMPARATOR`. Always use half-open `[start, nextDay(end))` ranges.
2. **`dailyRollUp` request body wants structured `google.type.Date` + `TimeOfDay` objects**, not "YYYY-MM-DD"/"HH:MM:SS" strings.
3. **Civil times in GH responses are structured objects** (`{date:{year,month,day}, time:{hours?,minutes?,seconds?}}`), not strings. Time components are **omitted when zero**.
4. **`total-calories` queries cap at a 14-day window.** Other types are 30+. We clamp `fetchTotalCalories` independently.
5. **`cardio-load` isn't a real data type.** Use `active-zone-minutes` (the AZM parser path).
6. **Weight rollup reports `weightGramsAvg` in grams**, not `averageKilograms`. Divide by 1000 first.
7. **`heart-rate` samples are ~1 Hz on Fitbit.** A full day = ~86k points; the intraday endpoint pages with `nextPageToken` and buckets to per-minute.
8. **Neon-http driver can't do `db.transaction()`.** "No transactions support in neon-http driver." Use a PL/pgSQL `DO $$ BEGIN ... END $$` block as one statement for atomic multi-statement work.
9. **Live Neon users.id / user_id columns are `text`**, not uuid. Use bare string literals (`unknown` type adapts) — `::uuid` casts trip `text = uuid` (42883).
10. **`auth/start` for OAuth flows opened in Safari** needs both: a middleware whitelist (no `Authorization` header possible) and to **hash the bearer's prefixed external id to UUID** before signing into the state JWT, so the callback persists tokens under the same key `status`/`sync` look them up by.
11. **`BGTaskScheduler.register` MUST run before `application(_:didFinishLaunchingWithOptions:)` returns.** Do it in `LifeOSApp.init()`. Identifier must also be in `BGTaskSchedulerPermittedIdentifiers` in Info.plist.
12. **Background tasks never fire in the iOS Simulator.** Test on device, or use the LLDB `_simulateLaunchForTaskWithIdentifier:` trick.
13. **SwiftData models referenced in a Schema must include every `@Model` you `ctx.insert`** — inserting an unregistered model crashes hard (not a catchable error). `HRDaySeries.self` is now in the Schema; add new models there too.
14. **`scrollPosition(id:)` + `.viewAligned`** doesn't always update continuously during drag — for true per-tick haptic feedback (e.g. the RulerPicker), use a custom `DragGesture` with manual position tracking and Canvas drawing.
15. **`abs(Int) * Double`** can stall the Swift type-checker with "compiler unable to type-check in reasonable time" — explicit `Double(...)` conversion fixes it.

---

## File map — `native/` (new/changed this session)

```
native/
├── project.yml                                # +BGTaskScheduler permitted ids, +fetch UIBackgroundMode
├── App/
│   ├── LifeOSApp.swift                        # init() registers BackgroundSync; HRDaySeries in Schema; no forced .dark
│   ├── Components/
│   │   ├── AmbientBackground.swift            # mesh anchored on adaptive base
│   │   └── RulerPicker.swift                  # NEW — Canvas number-line, haptic per unit
│   ├── Models/
│   │   ├── Models.swift                       # +activeEnergyKcal, +totalCaloriesKcal, +distanceMeters, +floors, +vo2Max on DailyEntry; +HRDaySeries
│   │   └── UserSettings.swift                 # +hasOnboarded
│   ├── Root/RootView.swift                    # onboarding gate; no forced .dark
│   ├── Services/
│   │   ├── BackgroundSync.swift               # NEW — BGAppRefreshTask
│   │   ├── GoogleHealthClient.swift           # PKCE not relevant (this is GH); decodes new fields; writes all days
│   │   ├── HeartRateClient.swift              # NEW — calls /api/google-health/heart-rate
│   │   ├── IdentityLinker.swift               # iOS Google login: auth-code + PKCE (not implicit)
│   │   ├── RecoveryCalculator.swift           # +sleep-stage quality, +prior-day-strain; sleep required (now also contains StrainCalculator)
│   │   └── …
│   ├── Theme/LifeOSColor.swift                # FULLY ADAPTIVE light/dark
│   └── Views/
│       ├── AnalysisView.swift                 # scrubbable trends, drill-ins, real Calories/Distance/VO2 cards; Sample.* deleted
│       ├── Analysis/
│       │   ├── HeartRateGraphView.swift       # NEW — scrubbable HR + zones + workout overlays + haptic per minute
│       │   ├── ScrubbableTrendChart.swift     # NEW — reusable
│       │   └── TrendDetailView.swift          # NEW — drill-in detail
│       ├── Habits/HabitComponents.swift       # HabitHeatmapStrip shrinks to fit width
│       ├── NutritionView.swift                # macroSummary wired to user goals + today's burned
│       ├── Onboarding/OnboardingFlow.swift    # NEW — 5-step onboarding with ruler dials
│       ├── Settings/GoalsEditor.swift         # Computed/Manual toggle, ruler-based manual editor
│       ├── Today/RecoveryStrainHero.swift     # sublabel surfaces driving Component
│       └── TodayView.swift                    # activity rings real data, calories unified to total, vital-tile most-recent fallback
└── App/Assets.xcassets/AppIcon.appiconset/    # all 11 sizes regenerated
```

---

## File map — `src/` (new/changed this session)

```
src/
├── middleware.ts                              # /api/google-health/auth/start in PUBLIC_PATHS
├── lib/integrations/google-health/
│   ├── adapter.ts                             # parsers rewritten to real shapes; new fetchActiveEnergy/TotalCalories/Distance/Floors/Vo2Max/IntradayHeartRate
│   └── config.ts                              # +activeEnergy/totalCalories/distance/floors/vo2Max/heartRate ids; cardioLoad -> active-zone-minutes
├── lib/migrate-user-id.ts                     # atomic DO block, bare literals (no ::uuid)
└── app/api/
    ├── auth/link-identity/route.ts            # response no longer includes rowsMoved
    ├── google-health/auth/start/route.ts      # hashes external id to UUID before signing state
    ├── google-health/heart-rate/route.ts      # NEW — POST { date } -> per-minute buckets
    └── google-health/sync/route.ts            # parallel-fetches all 11 metric types
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
npx tsc --noEmit          # faster typecheck

# Push to three refs. carter:main is the production deploy.
git push origin native && \
  git push life-os-dev native && \
  git push carter native:main

# Force-run the background sync (lldb on real device, app paused)
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.hbrady.lifeos.healthrefresh"]

# Pull production env vars from Vercel
vercel env pull .env.local --environment=production
```

---

## Persistent rules

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push to three refs (`origin/native`, `life-os-dev/native`, `carter/native:main`) — skip `carter/native` to avoid duplicate Vercel build
- Run `xcodebuild` sanity-build before committing significant Swift changes
- No inline hex — `LifeOSColor.*` tokens (now adaptive)
- Reuse existing primitives (`Card`, `RulerPicker`, `ScrubbableTrendChart`, `VitalTile`, `Haptics.*`)
- No emojis in code/commit messages unless asked
- `.swipeActions` doesn't work in `VStack` — use `.contextMenu` or custom `DragGesture`
- Drizzle `.returning()` defaults to `RETURNING *` — explicit column projection or raw SQL
- Never commit `.env*` files
- New SwiftData `@Model`s MUST be added to the `Schema([...])` in `LifeOSApp.swift`

---

## Do NOT do without explicit user authorization

- `git reset --hard` on any pushed branch
- `git push --force` to `main` of any remote (use `--force-with-lease`)
- Delete `ios/` (Capacitor v1 preserved there)
- `--no-verify` on commits
- Rotate `NEXTAUTH_SECRET` on Vercel (logs everyone out + breaks encrypted GH tokens)
- Anything that costs money
- Add LiDAR pipeline to Nutrition (user advised against by recommendation)

---

## Pre-flight before issuing your first command

```bash
cd ~/Downloads/life-os-hbrady
git status                          # clean tree
git branch --show-current           # 'native'
git log -3 --format='%h %s'         # tip >= 7a344f4
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

---

Good luck.
