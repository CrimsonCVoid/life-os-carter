# Life OS v2 — Session 3 handoff

> Read this in full before issuing any commands. State snapshot for
> resuming where Session 3 ended.

---

## How to launch the next session

```bash
cd ~/Downloads/life-os-hbrady
./scripts/handoff.sh
```

That script keeps the Mac awake (`caffeinate`), launches Claude Code
with `--dangerously-skip-permissions`, and primes the prompt to read
this file. If you'd rather invoke manually:

```bash
caffeinate -dimsu -t 7200 &
claude --dangerously-skip-permissions
# Then in the prompt:
# Read /Users/carterbrady/Downloads/life-os-hbrady/HANDOFF-V3.md in
# full, then continue the v2 work from where it left off.
```

---

## State (2026-05-21 → 22)

**Branch:** `v2` on `~/Downloads/life-os-hbrady`
**Tip:** `b0d9f9f` (Drop onboarding flow; /signin is now the login + signup gate)
**Working tree:** clean
**Pushed to:** `origin` (hbrady7 v2 + main), `life-os-dev` (v2), `carter` (main) — all four refs at `b0d9f9f`

Backup branches on origin in case main needs rollback:
- `pre-v2-main-backup` — pre-Session-1 state
- `pre-v2-port-backup-2026-05-21` — pre-overwrite state from Session 2

---

## Topology

| Remote | URL | Branches |
|---|---|---|
| `origin` | hbrady7/life-os | v2, main (both at `b0d9f9f`) + 2 backup branches |
| `life-os-dev` | Life-Os-Development/life-os-main | v2 |
| `carter` | CrimsonCVoid/life-os-carter | main |

All three are kept in lockstep — every commit pushed to all four refs.

---

## Architecture (settled)

| Layer | Choice |
|---|---|
| Stack | Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind v4 |
| DB | Neon Postgres + Drizzle ORM. Schema: `src/lib/db/schema.ts` |
| Auth | Auth.js v5, **Google SSO only** (GitHub provider dropped in `d07ffbd`). DrizzleAdapter writes users/accounts/sessions to Postgres on first OAuth |
| Client fetching | SWR + IndexedDB-backed cache provider (`src/components/swr-provider.tsx`) |
| UI state | Zustand 5 with persist middleware (for transient + active-workout state only) |
| AI | `@google/genai` (Gemini 2.5 Flash) server-side only |
| Mobile shell | Capacitor 8 (hosted WebView → `https://life-os-carter.vercel.app`) |
| iOS native | Liquid Glass widgets + Live Activity + HealthKit + App Intents in `ios/` (landed `e30d9ab`) |

**Onboarding is DROPPED.** `/signin` is the single login + signup gate.
DrizzleAdapter auto-creates the user row on first OAuth — no separate
signup flow. `DEFAULT_SETTINGS.hasOnboarded = true` so existing/new
users land straight on `/`.

---

## What landed in Session 3 (this session)

```
b0d9f9f  Drop onboarding flow; /signin is now the login + signup gate
e30d9ab  Comprehensive iOS native extensions — Liquid Glass widgets +
         Live Activity + HealthKit + App Intents
d55a0ad  Barcode scanner: actually fix the iOS ZXing scan loop
1f722e5  Fix barcode scanner — switch ZXing path from one-shot promise
         to continuous callback (incomplete — superseded by d55a0ad)
cfde66f  /stats overhaul — hero summary band + themed section grouping
62fe4e7  Lift sessions cloud sync: REST + SWR hook + dual-write +
         migration card
6bfc719  (brother) chore: re-trigger Vercel deploy
91e2107  /nutrition: lane overhaul — wire in the orphaned Phase 2B
         components
35bdbd6  (brother) feat(gym): Insights section — six charts
44b6a52  (brother) feat(gym): surface imported exercises in picker
c5f633a  (brother) feat(gym): RepCount CSV import — parser + flow
7088668  (brother) chore: re-trigger Vercel deploy
d07ffbd  Auth: Google SSO only — drop GitHub provider
3eafe21  DayHero: more breathing room between the three pillar gauges
e50794f  Fix lane Link wrappers rendering inline
2d96404  Whoop-parity DayHero with tap-into-detail rings + restore
         forward nav up to today
b57da3d  RepCount Premium parity: superset swipe-to-copy + Records card
7a7085a  Mobile + App Store polish: account deletion, viewport keyboard
         hint, home cold-paint Recharts-free
7504045  Overhaul dashboard with lane architecture: Performance ·
         Recovery · Fuel · Movement
6a17b9f  Remove the future-day "Tomorrow" view from the home screen
```

---

## Open items / what's next (priority order)

### 1. Xcode UI setup for iOS extensions (USER WORK — Claude can't do this)

Everything Swift is in `ios/` but the WidgetExtension target hasn't
been created in Xcode and the new Swift files haven't been dragged into
their targets. Full step-by-step is at `ios/EXTENSIONS-SETUP.md`.
Quick summary:

1. `npm run ios:sync && npm run ios:open`
2. App target → Signing & Capabilities → + App Groups
   (`group.com.hbrady.lifeos`), + HealthKit, + Push Notifications,
   + Background Modes (Remote notifications)
3. Drag `ios/App/App/Plugins/*.swift` (3 files) into App target
4. Drag `ios/App/App/AppIntents/LifeOSIntents.swift` into App target
5. File → New → Target → Widget Extension → name "WidgetExtension",
   check "Include Live Activity"
6. Delete the auto-generated Swift files in the new target, drag in
   `ios/WidgetExtension/*.swift` + `ios/Shared/WorkoutActivityAttributes.swift`
   (Shared must be in BOTH App and WidgetExtension targets)
7. WidgetExtension → Signing & Capabilities → + App Groups
8. Both targets → General → Min Deployments → iOS 26.0

### 2. Push notification client-side wiring

`@capacitor/push-notifications` is installed and the entitlement is
in `App.entitlements`. Still missing:

- TS bootstrap call: `PushNotifications.requestPermissions()` +
  `register()` on first launch, then POST the device token to
  `/api/push/register-apns`
- New server route `/api/push/register-apns` that stores APNs tokens
  alongside the existing web-push subscriptions in
  `push_subscriptions` table
- Server-side branching in the push-send code (cron/insights/etc.)
  that detects APNs vs VAPID and sends through the right pipeline
  (`apn` npm package vs the existing `web-push`)
- APNs Auth Key generated in Apple Developer portal and uploaded to
  App Store Connect (Keys tab)

### 3. Apple Watch companion app

Massive surface area, lots of value for a workout/health app. Add a
watchOS target in the same Xcode project (SwiftUI / WatchKit). Use
`WCSession` to talk to the iPhone app. Reads HR + sends per-set data.
Don't start until #1 and #2 are done and tested.

### 4. CarPlay

Low value for a workout/nutrition app. Skip unless explicitly asked.

### 5. UI screens not yet touched

`/habits`, `/journal`, `/body` are still using their pre-v2 layouts.
The lane treatment pattern from `/`, `/nutrition`, `/stats` would
work for all three. ~1-2h each.

### 6. Push notifications UX

Local-reminder scheduling (morning briefing nudge, evening reflection,
hydration reminders) — `@capacitor/local-notifications` is already
installed; needs TS wiring + a "Reminders" tab in Settings.

### 7. Database — workouts table cleanup

`lift_sessions` is now cloud-synced (commit `62fe4e7`) but the old
`workouts` table still exists with daily-meta-only data. Could be
collapsed into `lift_sessions` (or made a thin view). Not urgent —
both coexist fine.

### 8. Legacy `src/components/today/nutrition.tsx` cleanup

846-line file no longer imported anywhere (commit `91e2107` removed
the last import). Safe to delete; left in case helpers like
`TargetsModal` / `EditMealModal` are worth salvaging.

---

## Critical env vars

### Required for app to function

```
DATABASE_URL              # Neon pooled
DATABASE_URL_UNPOOLED     # Neon direct (only needed for drizzle-kit)
NEXTAUTH_SECRET           # openssl rand -base64 32
AUTH_GOOGLE_ID            # Google Cloud → Credentials → Web client 1
AUTH_GOOGLE_SECRET        # same dialog (rotate via "+ Add secret" if lost)
GEMINI_API_KEY            # aistudio.google.com/apikey — free tier 1500 req/day
```

Currently set on Vercel for Production + Preview. User confirmed
client ID is `1043141878345-mk9b8ejtc6uvqivp8tjlcu6atqrsa1d7.apps.googleusercontent.com`.

### Optional / per-feature

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY    # required for web-push subscription
VAPID_PRIVATE_KEY               # already set on Vercel
VAPID_SUBJECT                   # already set on Vercel
CRON_SECRET                     # already set
GOOGLE_HEALTH_CLIENT_ID         # Fitbit/Pixel Watch sync (separate from SSO)
GOOGLE_HEALTH_CLIENT_SECRET     # ditto
GOOGLE_HEALTH_REDIRECT_URI      # https://life-os-carter.vercel.app/api/google-health/callback
```

Brother's leftover vars that v2 doesn't read (safe to leave or delete):
`PASSKEY_SETUP_TOKEN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `WEBAUTHN_RP_NAME`,
`BLOB_READ_WRITE_TOKEN`.

---

## Standard commands

```bash
# Dev
npm run dev -- -H 0.0.0.0       # bind all interfaces — works on iPhone over LAN
npm run typecheck               # tsc --noEmit (REQUIRED before every commit)
npm run lint
npm run build

# Database (Drizzle)
npm run db:push                 # quick dev sync against DATABASE_URL_UNPOOLED
npm run db:generate             # write a migration file
npm run db:studio

# iOS
npm run ios:sync                # copy web + config into ios/
npm run ios:open                # open Xcode workspace
npm run ios:run                 # build & run on connected device

# Git (push everywhere)
git push origin v2 && \
  git push origin v2:main && \
  git push life-os-dev v2 && \
  git push carter v2:main
```

---

## Do NOT do without explicit user authorization

- `git reset --hard` on any pushed branch
- `git push --force` to main of any remote (use `--force-with-lease`)
- `--no-verify` on commits
- Schema-destructive Drizzle (DROP COLUMN, etc.)
- Rotate live OAuth credentials, Gemini keys, VAPID keys
- Anything that costs money (paid APIs, Apple services, etc.)

---

## Persistent rules (from CLAUDE.md — read it in full)

- Match existing patterns before inventing new ones
- Commit after every major change; never amend unless asked
- Push after committing — Vercel verifies build
- Update both `partialize` AND `merge` in `store/index.ts` for new persisted fields
- No inline hex — `var(--color-*)`, `metricColors(m)`, or `metricHex(m)` for Recharts SVG
- Use existing primitives (`Button`, `Card`, `Modal`, `Input`)
- TypeScript strict — no `any`
- Default to no new files
- Lucide icons only
- No emojis in code/comments/commit messages
- Don't add tests "for safety"; project has no tests
- Don't add console.log in shipped code
- Don't introduce dependencies for things solvable with what's installed
- Don't refactor unrelated code in a feature commit

---

## Pre-flight before issuing your first command

```bash
cd ~/Downloads/life-os-hbrady
git status                       # confirm clean working tree
git log -5 --format='%h %s'      # confirm tip is b0d9f9f or later
git fetch --all                  # see if brother pushed since
npm run typecheck                # should pass clean
```

If origin is ahead, `git pull --rebase origin v2`. If `carter/main`
or `life-os-dev/v2` diverged, that's normal — those mirror v2 via
periodic force-push-with-lease.

---

Good luck.
