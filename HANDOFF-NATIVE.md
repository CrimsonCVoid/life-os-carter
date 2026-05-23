# Life OS — Session handoff (native iOS port)

> Read this in full before issuing commands. Snapshot for resuming after
> the long auth + Live Activity + nutrition + database-migration session.

```bash
cd ~/Downloads/life-os-hbrady && ./scripts/handoff-native.sh
```

---

## State (2026-05-22, end-of-day)

- **Branch:** `native` at `3fe5849` (Remove leaked .env.vercel from repo + tighten .gitignore)
- **Working tree:** clean
- **Pushed to:** origin/native, carter/native, life-os-dev/native, carter/main — all at `3fe5849`
- **26 commits since the previous handoff at `31cb2b4`**

---

## 🚨 CRITICAL: SECRETS LEAKED — ROTATE BEFORE ANYTHING ELSE

Commit `cab68ea` accidentally contained `.env.vercel` (a `vercel env pull` artifact) with real
production secrets. The file is gone from `HEAD` (`3fe5849` removed it) but the secrets are still
recoverable from git history on **all four remotes** via `git show cab68ea:.env.vercel`.

**Also** the Neon DB password `npg_Hy4dM9ezZFxm` was pasted into the chat directly, and an old
Gemini API key (`AIzaSyDCMRqmvy1O64AP3EbVahIHEnFDAkmcPXo`, flagged in `.env.local` as compromised
2026-05-21) was reread into chat context this session.

| Secret | Where to rotate |
|---|---|
| **Neon DB password** | Neon dashboard → Connection Details → Reset password → update `DATABASE_URL` + `DATABASE_URL_UNPOOLED` on Vercel + `.env.local` |
| **GEMINI_API_KEY** | aistudio.google.com/apikey → delete old, create new → update Vercel + `.env.local` |
| **NEXTAUTH_SECRET** | `openssl rand -base64 32` — everyone logged out on rotation |
| **CRON_SECRET** | `openssl rand -base64 32` |
| **AUTH_GOOGLE_SECRET** | console.cloud.google.com → "Edge Auth" web client → Reset secret |
| **BLOB_READ_WRITE_TOKEN** | Vercel Storage → Blob → regenerate |
| **VAPID_PRIVATE_KEY** | `npx web-push generate-vapid-keys` → update both public + private |
| **PASSKEY_SETUP_TOKEN** | `openssl rand -base64 32` |

After every rotation: Vercel dashboard → Settings → Environment Variables → update → Deployments
→ Redeploy. Until you redeploy, the old (leaked) value is still live.

If you ever plan to make the repo public, also run `git filter-repo` on `.env.vercel` + force-push
to scrub history.

---

## The big infrastructure pivot this session

The live Neon database the old Capacitor app pointed at had drifted materially from
`src/lib/db/schema.ts`. Every new `/api/data/*` call from the native app surfaced a different
column-missing or constraint-mismatch error (`name`, `archived_at`, `photo_indexeddb_key`,
`exercises`, etc.). After a few cycles of whack-a-mole patching, we **created a fresh Neon project
and pushed schema.ts cleanly**:

- New Neon project: `ep-billowing-thunder-apmp5h9d.c-7.us-east-1.aws.neon.tech`
- 48 tables created via `npm run db:push` — matches `schema.ts` exactly
- Old Neon project: dead, do not point at it
- **Vercel env vars `DATABASE_URL` + `DATABASE_URL_UNPOOLED` need to be updated to the new project**
  (after the Neon password rotation above)

The data-layer functions (`createMeal`, `createHabit`, `createLiftSession`) still use raw SQL
bypasses I wrote during the drift period — they work against either schema. Once the new DB is
fully wired and password-rotated, those can be reverted to clean Drizzle in a follow-up.

---

## Architecture decisions made this session

| Decision | Why |
|---|---|
| **No CloudKit, stay on Vercel+Neon** | iOS-only target, but the web app still uses the same backend; cleaner to keep one DB. |
| **Hybrid auth: device-bound default + optional Apple/Google link** | SIWA provisioning was blocking app launch. App now opens with zero friction; Settings has opt-in "Link Apple ID" / "Link Google" that migrates existing data to an identity-bound user. |
| **JWT subject = prefixed external ID; DB id = hashed UUID** | Live `users.id` was uuid-typed; prefixed strings like `device:<uuid>` 22P02'd. SHA-1-hash the prefixed string into a deterministic UUID at the SQL boundary. iOS keeps the prefix via `AuthStore.identityProvider`. |
| **Middleware allows bearer-token /api/* through** | Was 307'ing every iOS API call to /signin → surfaced as "Failed to find Server Action" client-side. |
| **Two Live Activities with relevanceScore stacking** | One card couldn't fit all the elements; user explicitly accepted iOS's stacking limitation. Controls (relevanceScore 100) floats on top, Info (50) peeks below. Each card has a peek-strip designed for the back-of-stack case. |
| **Branding scrub: no Gemini, no OpenFoodFacts in UI** | Generic "AI estimate" / "Pulled from the label". Backend route comments still mention providers — not user-visible. |

---

## What works end-to-end (verified this session)

| Feature | Status | Notes |
|---|---|---|
| App launches with zero friction | ✅ | Device UUID → JWT auto-mints on first launch |
| Settings → Link Apple ID | 🟡 needs SIWA provisioning on dev account | Backend works (`/api/auth/link-identity` 200s); client-side blocked by Apple developer team capabilities |
| Settings → Link Google | 🟡 needs `GOOGLE_IOS_CLIENT_ID` rotation post-leak | iOS client ID is `778767465909-49jj6q2nd2gcn4qocvnlmgvbv8lhknuk.apps.googleusercontent.com` |
| Workout flow (start → log sets → finish) | ✅ | Drop sets indented + chipped, swipe-to-delete (custom drag in SetRow.swift since `.swipeActions` doesn't work in VStack), superset menu, plate calc, RPE drawer |
| Per-session detail screen with charts | ✅ | Tap any row in Gym → Recent sessions |
| Live Activity (Info + Controls cards) | ✅ | Controls on top, info peeks, parallel `Activity.update` for ~halved latency, 50ms pulse-clear tick |
| Lock-screen tap → haptic + button pulse | ✅ | Haptic fires inside intent (main app process), pulse via `lastAction` + `lastActionAt` in `WorkoutContentState` |
| Nutrition: barcode (camera) | ✅ | VisionKit DataScanner → OpenFoodFacts → servings stepper review sheet (macros read-only) |
| Nutrition: photo (camera OR library) | ✅ | UIImagePickerController for camera + PhotosPicker for library |
| Nutrition: voice (hold-to-record) | ✅ | AVAudioRecorder → `/api/voice-meal` |
| Meal edit + delete | ✅ | Tap row → edit sheet, long-press → context menu |
| Analysis tab → Overseer coach chat | ✅ | Streams from `/api/overseer`, no provider branded in UI |
| SyncService → Neon | ✅ | lift_sessions, habits, journal_entries, meals (raw-SQL data-layer) |
| Mock data seeder (Settings → Test Data) | ✅ | Throwaway — Populate generates 30d of realistic data, Wipe nukes the local SwiftData store |
| Delete PRs (long-press on PR row) | ✅ | Context menu in GymView |
| Live Activity twin-card | ✅ | Controls on top via relevanceScore 100 vs Info's 50 |

---

## What's still placeholder / unwired

- **HealthKit reads on Today + Analysis** — manager has `fetchSum`/`fetchAverage` but every screen uses `Sample.*` static values
- **Body screen** — not built
- **Push notifications (APNs)** — entitlement set, no device-token registration code
- **Day-entry direct-input flows** — water/sleep/mood/weight/steps logs have Neon routes but no iOS UI writes to them yet (only TodayView sample data)
- **TestFlight** — `DEVELOPMENT_TEAM` still empty in `project.yml` (line 28). User has a paid Apple Developer membership; needs to paste the 10-char Team ID

---

## Vercel env var checklist

After Neon password + Gemini key rotation, every env var below must be set on **Production /
Preview / Development** then Redeploy. Without all of these the native app cannot use the backend.

| Env var | Required? | What breaks without it |
|---|---|---|
| `DATABASE_URL` | YES | Every `/api/*` 500 |
| `DATABASE_URL_UNPOOLED` | YES (for future `db:push`) | drizzle-kit DDL ops |
| `NEXTAUTH_SECRET` | YES | Every bearer JWT 401 |
| `GEMINI_API_KEY` | YES (rotated) | Voice/photo/Coach all 500 |
| `GOOGLE_IOS_CLIENT_ID` | YES (`778767465909-49jj6q2nd2gcn4qocvnlmgvbv8lhknuk.apps.googleusercontent.com`) | Link Google in Settings 401s |
| `CRON_SECRET`, `VAPID_*`, `AUTH_GOOGLE_*`, `BLOB_READ_WRITE_TOKEN` | Optional | Legacy/web features only |

---

## Open items (priority order)

1. **Rotate the leaked secrets above** (you, not Claude — can't paste back into Vercel from here).
   After each rotation, redeploy on Vercel and the runtime picks up the new value.
2. **Update Vercel `DATABASE_URL` + `DATABASE_URL_UNPOOLED` to the new Neon project** (the leaked
   one in chat is the right value temporarily, but rotate the Neon password first then update with
   the post-rotation string).
3. **Wire HealthKit reads into Today + Analysis** — replace `Sample.*` static data with
   `HealthKitManager.fetchSum/fetchAverage` calls. Probably an `@Observable HealthDataStore` keyed
   off range selector.
4. **Set `DEVELOPMENT_TEAM` in `project.yml:28`** + create App Store Connect record + first
   TestFlight archive. Full recipe in this doc's earlier turn (search "TestFlight" in chat).
5. **Day-entry direct-input flows on Today screen** — water/weight/mood/etc. UI that writes to
   `DailyEntry` (SwiftData) and the matching `/api/data/{water,weight,mood}-logs` routes (Neon).
6. **APNs token registration + push** — `UserNotifications` permission, `application(_:didRegister
   ForRemoteNotificationsWithDeviceToken:)`, POST to `/api/push/register-apns`.
7. **Body + Journal screens** — fully unbuilt.
8. **Revert raw-SQL bypasses to clean Drizzle** — only safe AFTER you confirm the new Neon DB
   matches schema.ts (which it does, from db:push). Files: `src/lib/data/{meals,habits,workouts}.ts`,
   `src/app/api/auth/{device-mint,native-mint,link-identity}/route.ts`,
   `src/lib/auth-server.ts`, `src/lib/user-id.ts`.

---

## Gotchas accumulated this session

1. **`.swipeActions` only works inside `List`** — every SetRow / MealRow / etc. that lives in
   a `LazyVStack` needs a `.contextMenu` (long-press) or a custom DragGesture instead. SetRow has
   the custom-drag implementation; treat it as the canonical pattern.

2. **Drizzle's `.returning()` with no args = `RETURNING *`** which references every schema column
   — if the live DB is missing one, every insert 500s. Use `.returning({id: table.id})` or raw SQL
   when you can't trust the live schema. With the new Neon DB this isn't an immediate problem but
   the bypasses are still in place.

3. **iOS won't unstack two Live Activities for one app.** No API for "render side by side." Best
   you can do is `relevanceScore` to control which floats on top + peek-strip design on the back
   card.

4. **LiveActivityIntent runs in the main app process** — so `UIImpactFeedbackGenerator` and
   `UINotificationFeedbackGenerator` work from inside `perform()`. Fire haptics BEFORE awaiting
   `Activity.update` so user feels confirmation before the visual lands.

5. **Push two activities in parallel via `async let`** — each `Activity.update` is a ~50-100ms
   IPC. Awaiting serially doubles per-tap latency.

6. **`vercel env pull` defaults to `development` environment** which only has `VERCEL_OIDC_TOKEN`.
   Use `--environment=production` for the real env vars.

7. **Don't commit `vercel env pull` output.** The `.env*` line in `.gitignore` was added this
   session; older `.env.vercel` is in history.

8. **Next.js middleware was bouncing every bearer-bearing /api/* to /signin** until `30a61b7`.
   If you add new public-ish routes, mind the matcher in `src/middleware.ts`.

9. **The Neon `users.id` column type is `text`** in the new DB — schema.ts is the source of truth.
   The `externalIdToUuid` hashing is still defensive code in case it ever goes back to uuid.

10. **iOS Live Activity height cap** — ~220pt on pre-26 devices, ~260pt on iPhone 17 + iOS 26. The
    current twin-card layout uses ~140pt per card. Don't add more rows.

---

## File map — `native/`

```
native/
├── project.yml                         # XcodeGen source. DEVELOPMENT_TEAM is empty (line 28)
├── App/
│   ├── LifeOSApp.swift                 # @main, no auth gate, ensureSignedIn() on appear
│   ├── Services/
│   │   ├── APIClient.swift             # bearer auth + GET/POST + stream + uploadJPEG + uploadAudio
│   │   ├── AuthStore.swift             # device-bound auto-mint + identityProvider
│   │   ├── IdentityLinker.swift        # Apple SIWA + Google OAuth via ASWebAuthenticationSession
│   │   ├── Keychain.swift              # SecItem wrapper
│   │   ├── SyncService.swift           # SwiftData → Neon for lift_sessions, habits, journal, meals
│   │   ├── MockDataSeeder.swift        # NEW: throwaway test-data populator (DELETE BEFORE PUBLIC)
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
│   │   ├── SettingsView.swift          # ACCOUNT card (linking) + INTEGRATIONS + TEST DATA
│   │   ├── AddMealSheet.swift          # manual entry + edit existing meal
│   │   ├── Analysis/
│   │   │   └── CoachChatView.swift     # NEW: streaming chat against /api/overseer
│   │   ├── Nutrition/
│   │   │   ├── BarcodeScannerView.swift
│   │   │   ├── MealCaptureDTO.swift
│   │   │   ├── MealReviewSheet.swift   # Servings stepper for barcode, editable form for AI
│   │   │   ├── OpenFoodFactsClient.swift
│   │   │   ├── PhotoMealSheet.swift    # camera OR library
│   │   │   └── VoiceRecorderSheet.swift
│   │   └── Workout/
│   │       ├── ActiveWorkoutView.swift # supersets, history-seeded sets, content-shape add-exercise
│   │       ├── ExercisePickerView.swift # NO "Recent" section (dropped per user feedback)
│   │       ├── ExerciseHistoryView.swift
│   │       ├── PlateCalculator.swift
│   │       ├── RPEDrawer.swift
│   │       ├── SetRow.swift            # custom DragGesture swipe-to-delete + drop-set chip
│   │       └── WorkoutDetailView.swift # per-session breakdown with charts
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
    └── WorkoutLiveActivityIntents.swift # haptic + parallel async-let dual update
```

---

## File map — `src/` (Vercel backend)

```
src/
├── middleware.ts                       # Bearer-token /api/* whitelist (30a61b7)
├── lib/
│   ├── auth-server.ts                  # getCurrentUser: bearer OR cookie, hashes prefix → UUID
│   ├── native-jwt.ts                   # HS256 mint/verify, 180d TTL, key from NEXTAUTH_SECRET
│   ├── apple-token-verify.ts           # SIWA JWKS verify
│   ├── google-token-verify.ts          # Google JWKS verify, audience-checked
│   ├── user-id.ts                      # externalIdToUuid (SHA-1 → UUID format)
│   ├── migrate-user-id.ts              # transactional FK migration across 45 tables
│   ├── api-helpers.ts                  # withUser / withUserRequest chokepoints
│   ├── data/                           # createMeal/createHabit/createLiftSession use raw SQL
│   └── db/schema.ts                    # source of truth, matches new Neon DB exactly
└── app/api/
    ├── auth/
    │   ├── device-mint/route.ts        # Anonymous per-device JWT, raw SQL upsert
    │   ├── native-mint/route.ts        # SIWA → JWT, raw SQL
    │   └── link-identity/route.ts      # Upgrade device user to Apple/Google
    ├── data/                           # ~30 existing routes, work as-is
    ├── food-photo/route.ts             # multipart JPEG → Gemini Vision
    ├── voice-meal/route.ts             # multipart audio → Gemini → meal macros
    ├── voice-journal/route.ts          # multipart audio → Gemini → journal entry
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

# Push to all four refs (carter:main is what triggers Vercel)
git push origin native && \
  git push carter native && \
  git push life-os-dev native && \
  git push carter native:main

# Database migrations against the new Neon project
npm run db:push          # uses DATABASE_URL_UNPOOLED from .env.local

# Pull production env vars from Vercel (after vercel link)
vercel env pull .env.vercel --environment=production
```

---

## Persistent rules

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push to all four refs (origin/native, carter/native, life-os-dev/native, carter/native:main)
- Run `xcodebuild` sanity-build before committing big changes
- No inline hex — use `LifeOSColor.*` tokens
- Use existing primitives (`Card`, `SectionLabel`, `PillarTile`, `.cascadeReveal`, `.pressable`)
- No emojis in code/commit messages unless asked
- `.swipeActions` doesn't work in VStack — use `.contextMenu` or custom DragGesture
- Drizzle `.returning()` defaults to `RETURNING *` — explicit column projection or raw SQL
- iOS will stack Live Activities; design for it, can't prevent it

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
git log -3 --format='%h %s'         # tip ≥ 3fe5849
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
# expect: 200 with {token, userId}
```

If device-mint returns 500 with `password authentication failed`, the Vercel DATABASE_URL still
points at the old (broken) Neon project — user needs to update Vercel env vars to the rotated new
Neon connection string.

---

Good luck.
