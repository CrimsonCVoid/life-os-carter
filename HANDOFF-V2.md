# Life OS v2 — Handoff for fresh Claude Code session

Read this first. It is the **complete** state snapshot for resuming the
v2 port. Ask if anything is unclear.

---

## How to launch the next session

From a fresh terminal:

```bash
cd ~/Downloads/life-os-hbrady
caffeinate -dimsu -t 7200 &
claude --dangerously-skip-permissions
```

`caffeinate` keeps the Mac awake for 2h so the agent doesn't get killed
by the host going to sleep mid-task (we hit this earlier — agents
stalled when the system slept).

`--dangerously-skip-permissions` lets Claude execute Bash / Write /
Edit / Agent without prompting for each call. **Read this file in full
before issuing the first command.** Then proceed against the
prioritized TODO list at the bottom.

If `claude` isn't on PATH, use `npx @anthropic-ai/claude-code` or
`npx claude@latest`.

---

## Topology

This is a **three-way fork** that was rationalized in this session.

| Repo | Role | `main` | `pre-v2-main-backup` |
|---|---|---|---|
| **hbrady7/life-os** | shared canonical (your brother's) | `8f3ce1f` (v2 + carter pure ports) | original hbrady7 main snapshot |
| **CrimsonCVoid/life-os-carter** | your fork | `8f3ce1f` (same) | full carter codebase pre-v2 (every commit from `57fcb1c` → `723e301`) |
| **Life-Os-Development/life-os-main** | shared org | branch `v2` at `15d6903` | n/a |

You work in `~/Downloads/life-os-hbrady` (origin = hbrady7, also has
`carter` and `life-os-dev` remotes). `~/Downloads/life-os-carter` is the
old carter clone — useful as a **read-only source** when copying
components forward, but don't push to its main directly.

### Recovery if v2 main is ever broken

```bash
git push origin pre-v2-main-backup:main --force
```

…from the carter clone. Restores carter's pre-v2 production code.

---

## Architecture (locked in this session)

Per user direction:

| Layer | Choice | Source repo |
|---|---|---|
| **DB** | Drizzle ORM + Neon Postgres | hbrady7 |
| **Auth** | NextAuth (Auth.js v5) + Google **and** GitHub providers + DrizzleAdapter | hbrady7 (Google added in `15d6903`) |
| **Cloud sync** | Per-entity REST under `/api/data/*` | hbrady7 |
| **Client fetching** | **SWR + IndexedDB-backed cache provider** — "best of both": SWR semantics for server truth + optimistic mutations, IDB persistence for instant cold-load paint. Lives in `src/components/swr-provider.tsx`. | New in `068363f` |
| **OAuth secrets** | AES-256-GCM at rest via `src/lib/db/encryption.ts` | hbrady7 |
| **Native** | **Deferred** until Apple Developer Program ($99/yr). PWA-only for now. | n/a |
| **Bodycomp sidecar** | **Dropped** | n/a |
| **Data migration from carter** | **Dropped** — fresh start via OAuth | n/a |

### Required OAuth gate (already enforced)

`src/middleware.ts` uses NextAuth `auth()` wrapper that redirects every
non-public path to `/signin`. No anonymous access. Public paths:
`/signin`, `/api/auth/*`, `/api/fitbit/callback`, `/api/cron/*`.

### Best-of-both client fetching

`src/components/swr-provider.tsx` wraps `SWRConfig` with a custom Map
cache provider that:

1. **Async-hydrates** from IndexedDB on mount (~50ms after first paint)
   so cold loads paint with the last-known state.
2. **Flushes** on `visibilitychange` (hidden) + `beforeunload`.
3. **Optimistic mutations** via standard `mutate(key, optimisticData,
   { rollbackOnError: true, revalidate: true })` — see
   `src/lib/hooks/use-behaviors.ts` for the canonical example.

---

## Three commits landed on `main` so far

1. **`068363f`** — v2 foundation
   - Drizzle schemas added: `behaviors`, `recipes`, `fasting_windows`,
     `workout_hr_series`, `workout_routines`
   - Types in `src/lib/types.ts` extended additively: `MacroTargets`,
     `FastingSettings`, `BehaviorLog`, `BEHAVIOR_FIELDS`, `Recipe`,
     `RecipeIngredient`, `FastingWindow`, `HRSample`, `ZoneMinutes`,
     `WorkoutHRSeries`, `PlannedSet`, `TemplateExerciseEntry`,
     `WorkoutRoutine`. `LiftSet` gains `rpe`, `notes`, `completed`,
     `isDropSet`. `LiftExercise` gains `plannedSets`, `notes`,
     `supersetGroupId`. `Settings` gains `macroTargets`, `fasting`.
   - **SWR provider rewritten with IDB cache** (`src/components/swr-provider.tsx`)
   - **Behaviors end-to-end** as the demo entity:
     - `src/lib/data/behaviors.ts` (drizzle queries, PATCH-merge upsert)
     - `src/app/api/data/behaviors/route.ts` (GET, PUT)
     - `src/app/api/data/behaviors/[date]/route.ts` (DELETE)
     - `src/lib/hooks/use-behaviors.ts` (optimistic `setBehavior`,
       `removeBehavior`)

2. **`15d6903`** — Google OAuth provider added
   - `src/auth.ts` now configures both GitHub and Google providers
     (whichever creds are present)
   - `checkAuthConfig` returns `githubReady` / `googleReady` flags
   - `src/components/sign-in-button.tsx` refactored to accept
     `provider` prop
   - `src/app/signin/page.tsx` renders one button per ready provider

3. **`8f3ce1f`** — Carter's pure libs + UI primitives ported
   - Libs (no Zustand deps): `plate-calculator`, `exercise-library`
     (212 exercises), `sleep-need`, `strain-target`,
     `behavior-correlation`, `pr-detection`, `csv-export`,
     `macro-progress`, `readiness`
   - UI primitives (use existing Modal/Button/Input + haptics):
     `plate-calculator-popup`, `numeric-keypad`,
     `exercise-library-picker`, `hr-overlay-chart`

---

## What's STILL needed (the prioritized backlog)

### Phase 1 — Data layer for the remaining 4 entities (foundational)

For **each** of `recipes`, `fasting_windows`, `workout_routines`,
`workout_hr_series`: create four files following the behaviors pattern
exactly:

```
src/lib/data/<entity>.ts         # drizzle queries (list, create, update, delete)
src/app/api/data/<entity>/route.ts          # GET, POST
src/app/api/data/<entity>/[id]/route.ts     # PATCH, DELETE
src/lib/hooks/use-<entity>.ts    # SWR hook with optimistic mutations
```

**Reference template**: copy `src/lib/data/behaviors.ts` +
`src/app/api/data/behaviors/*` + `src/lib/hooks/use-behaviors.ts`
verbatim, then swap the entity. Behaviors is daily-singleton (composite
PK `userId+date`); the other four are UUID-keyed so they use
list/create/update/delete instead of PATCH-merge upsert.

### Phase 2 — Rewire carter's data-dependent UI to SWR hooks

Each component currently lives at `/Users/carterbrady/Downloads/life-os-carter/src/components/...`
and uses `useStore((s) => s.X)`. Port to v2 by swapping in the SWR hook
+ optimistic mutations. Roughly **30-100 lines of surgery per component**
once the hook exists.

**Today screen cards** (slot into `src/app/page.tsx`):

| Carter source | Port to v2 | Hooks needed |
|---|---|---|
| `components/today/sleep-need-card.tsx` | same path | reads `health` (existing) + `liftSessions` (existing) |
| `components/today/strain-target-card.tsx` | same path | reads `health` + `liftSessions` + settings |
| `components/today/behaviors-card.tsx` | same path | **`useBehaviors()` already exists** ✅ |
| `components/today/macro-rings.tsx` | same path | `useMeals()` (existing) + `useSettings()` (existing macroTargets field) |
| `components/today/pillar-tiles.tsx` | same path | health + liftSessions |

**Nutrition screen** (slot into `src/app/nutrition/page.tsx`):

| Carter source | Port to v2 | Hooks |
|---|---|---|
| `components/nutrition/fasting-timer-card.tsx` | same | `useFasting()` (build in Phase 1) |
| `components/nutrition/recipes-card.tsx` | same | `useRecipes()` (build in Phase 1) |
| `components/nutrition/recipe-builder-modal.tsx` | same | `useRecipes()` |
| `components/nutrition/meal-shortcuts-row.tsx` | same | `useMeals()` + `useSavedMeals()` (existing) + `useRecipes()` |
| `components/nutrition/barcode-quick-add.tsx` | **SKIP** | hbrady7 has its own barcode flow already |

**Stats screen** (slot into `src/app/stats/page.tsx`):

| Carter source | Port to v2 | Hooks |
|---|---|---|
| `components/stats/hrv-trend-card.tsx` | same | `useMetrics({ field: "hrv" })` etc — see existing `src/lib/hooks/use-metrics.ts` |
| `components/stats/muscle-frequency-card.tsx` | same | `useWorkouts()` (existing) — categorizes via `exercise-library.ts` muscleGroup |

**Cross-cutting**:

| Carter source | Port to v2 | Hooks |
|---|---|---|
| `components/universal-search-modal.tsx` | same | All entity hooks. Wire into `components/quick-capture-fab.tsx` (hbrady7 already has the FAB; add Search action) |
| `components/workout/voice-logger-modal.tsx` | same | No data hook needed — just calls a parent `onCommitSet` |
| `app/api/voice-workout/route.ts` | same | Gemini server route, no client data deps |
| `components/workout/detected-session-card.tsx` | same | `useWorkoutHrSeries()` (Phase 1) + creates a LiftSession via existing `/api/data/workouts` |
| `app/api/workout-hr/sync/route.ts` | same | Gemini-free, just google-health adapter calls |
| `app/api/workout-hr/detected-sessions/route.ts` | same | same |
| `lib/integrations/google-health/heart-rate.ts` | same | uses hbrady7's existing token helpers; check `getValidAccessToken` signature — carter's was `getValidAccessToken()` with no args, hbrady7 may differ |

### Phase 3 — The big one: active workout page (RepCount-mimic)

Carter's `src/components/workout/active-workout-page.tsx` is ~1700 lines
of stacked-exercise / supersets / drop-sets / inline +Set / floating
rest pill / RPE drawer / readiness chip layout. It currently reads
`useStore((s) => s.activeWorkout)` and calls Zustand actions like
`addActiveWorkoutSet`, `toggleActiveWorkoutSetComplete`,
`toggleActiveWorkoutSuperset`, etc.

To port to v2:

1. **Active workout state** doesn't fit the per-entity REST model
   cleanly (it's a short-lived session that mutates on every tap). Two
   options:
   - **Option A** (cleaner): keep `activeWorkout` in client-only
     Zustand (use the existing `src/store/index.ts` — Zustand is
     already there for UI state per CLAUDE.md). Persist via the
     existing zustand `persist` middleware to localStorage. On finish,
     POST to `/api/data/workouts` to persist the finished session.
   - **Option B**: add an `active_workouts` Drizzle table, write on
     every set tap. More REST traffic, true cross-device resume.
   - Recommendation: A. Active workout is single-session; carter did
     the same.
2. Once `activeWorkout` slice is in hbrady7's Zustand store, carter's
   component drops in with minor import path adjustments.
3. Subcomponents (`SetRow`, `SupersetBlock`, `FloatingRestPill`,
   `RpeNotesDrawer`, `Header`, `StatsStrip`, `EmptyState`,
   `ExerciseCard`) all transfer with the same `useStore` rewiring.
4. `WorkoutSummary` reads `useWorkoutHrSeries()` after Phase 1's HR
   route is in place — auto-syncs HR on summary open and renders the
   HR overlay chart.

### Phase 4 — Per-exercise deep-dive page

Carter's `src/app/gym/exercise/[name]/page.tsx`. Reads
`useStore((s) => s.liftSessions)` + computes all-time records,
rep-range PRs (uses `lib/pr-detection.ts` already ported), seasonal
year filter, moving average chart, sleep correlation. Port:

1. Switch the store read to `useWorkouts()` SWR hook (existing).
2. The rest is pure derivation from the session list + helper libs.
3. Make sure `format / fromDateStr` imports resolve — both repos
   have `src/lib/date.ts`.

### Phase 5 — Routine editor + schedule

Carter's `src/components/workout/routine-editor.tsx` lets the user
create/edit workout routines (Push/Pull/Legs) with planned sets and
scheduled days. Port:

1. Uses `useWorkoutRoutines()` from Phase 1.
2. The picker for "+ Add exercise" reuses the already-ported
   `exercise-library-picker.tsx`.
3. `components/today/today-routine-card.tsx` (auto-surfaces today's
   scheduled routine) is a small follow-up.

---

## Reference: the pattern to follow

For each NEW entity port:

### a) Drizzle data layer

```ts
// src/lib/data/<entity>.ts
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { <table> } from "@/lib/db/schema";

export async function listX(userId: string) {
  return db.select().from(<table>)
    .where(eq(<table>.userId, userId))
    .orderBy(desc(<table>.createdAt));
}
// + createX, updateX, deleteX
```

### b) REST routes

```ts
// src/app/api/data/<entity>/route.ts
import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import { listX, createX } from "@/lib/data/<entity>";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser((userId) => listX(userId));
}
export async function POST(req: NextRequest) {
  return withUserRequest(req, async ({ userId, body }) => {
    return createX(userId, body as <InputType>);
  });
}
```

`/api/data/<entity>/[id]/route.ts` mirror for PATCH and DELETE.

### c) SWR hook with optimistic mutations

```ts
// src/lib/hooks/use-<entity>.ts
"use client";
import useSWR, { mutate } from "swr";

const KEY = "/api/data/<entity>";

export function useX() {
  const swr = useSWR<XRow[]>(KEY);
  return { items: swr.data ?? [], isLoading: swr.isLoading, error: swr.error };
}

export async function createXItem(input: ...): Promise<void> {
  await mutate<XRow[]>(KEY, async (current) => {
    const list = current ?? [];
    const res = await fetch(KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
    const created: XRow = await res.json();
    return [created, ...list];
  }, {
    optimisticData: (current) => [{ ...input, id: "temp-" + Date.now() } as XRow, ...(current ?? [])],
    rollbackOnError: true,
    revalidate: true,
  });
}
```

### d) Wire the component

Replace every `useStore((s) => s.X)` → `useX()`, and every action call →
`createXItem` / `updateXItem` / `deleteXItem`.

---

## Standard commands

```bash
# In ~/Downloads/life-os-hbrady (the v2 work tree)
npm run dev                    # localhost:3000
npm run typecheck              # tsc --noEmit (required before every commit)
npm run db:push                # apply schema.ts changes to live DB (Drizzle)
npm run db:generate            # write a migration file
npm run lint                   # next lint

git push origin main           # → hbrady7/life-os
git push carter main           # → CrimsonCVoid/life-os-carter
git push life-os-dev v2        # → Life-Os-Development/life-os-main

# Sourcing carter files to port (read-only):
ls ~/Downloads/life-os-carter/src/components/today/
ls ~/Downloads/life-os-carter/src/components/workout/
ls ~/Downloads/life-os-carter/src/components/nutrition/
```

---

## Env vars required (Vercel — set on all 3 environments)

```
DATABASE_URL              # Neon pooled
DATABASE_URL_UNPOOLED     # Neon direct — needed for Auth.js adapter on signin
AUTH_SECRET               # openssl rand -base64 32
AUTH_TRUST_HOST           # true — lets NextAuth accept the Vercel preview-URL host
AUTH_GOOGLE_ID            # Google Cloud Console OAuth client
AUTH_GOOGLE_SECRET        # Google Cloud Console OAuth client
AUTH_GITHUB_ID            # optional; only if GitHub button desired
AUTH_GITHUB_SECRET        # optional
GEMINI_API_KEY            # for AI features (briefing, voice journal, food photo)
NEXTAUTH_URL              # canonical URL for the deployment (prod / preview)

# Optional for Google Health Connect:
GOOGLE_HEALTH_CLIENT_ID
GOOGLE_HEALTH_CLIENT_SECRET
GOOGLE_HEALTH_REDIRECT_URI

# For push:
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT

# For cron auth:
CRON_SECRET
```

The signin page calls `checkAuthConfig()` and surfaces missing names
in plain English — if signin is broken, the page tells you what's
missing.

---

## Google OAuth — Google Cloud Console setup

Authorized JavaScript origins:
```
https://life-os-carter.vercel.app
https://life-os-carter-git-v2-<team-slug>.vercel.app
http://localhost:3000
```

Authorized redirect URIs (always `/api/auth/callback/google`):
```
https://life-os-carter.vercel.app/api/auth/callback/google
https://life-os-carter-git-v2-<team-slug>.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

Team-slug = your Vercel team/user handle (look at any Vercel preview URL).

---

## What carter shipped that's worth porting (priority order)

Ranked by user-stated importance (from this session):

1. **Rep counter** (RepCount-mimic workout flow) — full active-workout
   page with stacked exercise cards, supersets, drop sets, inline +Set,
   floating rest pill, RPE/notes drawer, plate calculator, numeric
   keypad, exercise library picker, voice logger, HR overlay,
   workout summary with PRs. **Pure pieces already ported in `8f3ce1f`.
   Full page rewrite is the deferred Phase 3 above.**

2. **Working barcode scanner** — ✅ hbrady7 already has it via
   `@zxing/library`; carter had a parallel ZXing-WASM variant. No
   port needed; carter's `barcode-scanner-modal.tsx` and
   `barcode-quick-add.tsx` are redundant — skip them.

3. **Haptic wrappers** — ✅ identical files; nothing to port.

4. **Required OAuth gate** — ✅ already enforced via NextAuth
   middleware. No anonymous access possible.

5. **Whoop coaching cards** — sleep-need-card, strain-target-card,
   behaviors-card, pillar-tiles, readiness-hero. Phase 2 above.

6. **Nutrition** — macro rings, recipes (CRUD), fasting timer, meal
   shortcuts. Phase 1 + Phase 2.

7. **Stats** — HRV trend dual-axis chart, muscle frequency heatmap.
   Phase 2.

8. **Universal search** — score-ranked across goals/habits/journal/
   meals/exercises/routines/recipes. Phase 2 (wire into the existing
   QuickCaptureFab).

9. **Deep-dive exercise page** — `/gym/exercise/[name]` with multi-
   metric chart + moving average + grouping (S/W/M/Y) + per-rep-range
   PRs + compound records + seasonal year filter + sleep correlation.
   Phase 4.

10. **HR overlay + Fitbit detected sessions** — `/api/workout-hr/sync`
    + detected-sessions route + chart in workout summary + import
    card on /gym. Phase 2 (depends on the Phase 1 `workout_hr_series`
    routes).

11. **Routine editor** — workout templates with planned sets ×
    scheduled days. Phase 5.

12. **CSV export** — already ported as a lib; wire a button on /gym
    that calls `liftSessionsToCsv(sessions)` from `lib/csv-export.ts`
    and triggers a download. ~30 lines.

---

## Do NOT do without asking

- Force-push to `main` (already done once this session; backups exist)
- `git reset --hard` on any pushed branch
- `--no-verify` on commits
- Schema-destructive Drizzle ops (DROP COLUMN, etc.)
- Rotate live OAuth credentials, Resend keys, Gemini keys without
  user instruction
- Anything that costs money (paid APIs, Apple Developer ID, etc.)

---

## Carter codebase reference (read-only source for ports)

Path: `~/Downloads/life-os-carter`

Key directories with components to port:

```
components/today/
  sleep-need-card.tsx
  strain-target-card.tsx
  behaviors-card.tsx
  pillar-tiles.tsx
  readiness-hero.tsx
  macro-rings.tsx

components/nutrition/
  fasting-timer-card.tsx
  recipes-card.tsx
  recipe-builder-modal.tsx
  meal-shortcuts-row.tsx
  barcode-scanner-modal.tsx        # skip — hbrady7 has its own
  barcode-quick-add.tsx            # skip

components/workout/
  active-workout-page.tsx          # the big one — Phase 3
  workout-summary.tsx
  routine-editor.tsx
  voice-logger-modal.tsx
  detected-session-card.tsx
  # Already ported in 8f3ce1f:
  plate-calculator-popup.tsx ✓
  numeric-keypad.tsx ✓
  exercise-library-picker.tsx ✓
  hr-overlay-chart.tsx ✓

components/stats/
  hrv-trend-card.tsx
  muscle-frequency-card.tsx

components/universal-search-modal.tsx

app/api/voice-workout/route.ts
app/api/workout-hr/sync/route.ts
app/api/workout-hr/detected-sessions/route.ts
app/gym/exercise/[name]/page.tsx

lib/integrations/google-health/heart-rate.ts   # adapter for HR + cardio
```

---

## Final pre-flight checklist for the next session

1. Read this entire file
2. `cd ~/Downloads/life-os-hbrady && git status` — confirm clean working tree on `main`
3. `git log -5 --format='%h %s'` — confirm tip is `8f3ce1f` or later
4. `npm install` if you haven't, then `npm run typecheck` should be clean
5. Start Phase 1 (4 entity REST + hook quads) — reference the
   behaviors triplet (`lib/data/behaviors.ts`, `app/api/data/behaviors/*`,
   `lib/hooks/use-behaviors.ts`) verbatim
6. Commit after each entity quad (4 commits) so review is granular
7. Push to `origin main` + `carter main` after each commit
8. After Phase 1 lands, start Phase 2 (UI rewires) — one card per
   commit
9. Save the active workout page (Phase 3) for last — it's the biggest
   delta

Estimated total wall-clock: 4-6 focused hours to land Phase 1 + 2 + 4.
Phase 3 alone is another 3-4 hours.

Good luck.

---

## AMENDMENT — gaps found in audit

After the first pass, audit revealed these missing items. They are
**hard prerequisites** for the RepCount port and must be done before
Phase 3 (active workout page) will compile.

### Missing pure libs (Wave 0 — before Phase 1)

- **`src/lib/workout-history.ts`** (carter has it) — exports
  `findLastSessionFor(sessions, name)`, `formatDaysAgo(n)`,
  `formatSetsCompact(sets)`. Used by `active-workout-page.tsx` for
  the "Last time · 3d ago · 185×8, 185×8, 175×6" chip above each
  exercise. **Drop in clean** — no Zustand deps.

```bash
cp ~/Downloads/life-os-carter/src/lib/workout-history.ts src/lib/
```

### Missing pillar palette tokens (Wave 0 — before Phase 2)

hbrady7's `src/app/globals.css` does **not** have the `--pillar-*` or
`--readiness-*` tokens that carter's pillar-tiles, strain-target-card,
sleep-need-card, ReadinessChip all reference. They render broken
until added. Carter's set:

```css
@theme {
  /* Pillar palette (Whoop-style) */
  --pillar-recovery: #16C47F;
  --pillar-recovery-2: #5BE3A1;
  --pillar-recovery-soft: rgba(22, 196, 127, 0.14);
  --pillar-strain: #38BDF8;
  --pillar-strain-2: #7DD3FC;
  --pillar-strain-soft: rgba(56, 189, 248, 0.14);
  --pillar-sleep: #8B5CF6;
  --pillar-sleep-2: #A78BFA;
  --pillar-sleep-soft: rgba(139, 92, 246, 0.14);

  /* Readiness brackets */
  --readiness-optimal: #16C47F;
  --readiness-green: #34D399;
  --readiness-yellow: #FBBF24;
  --readiness-red: #FB7185;
}
```

Add these to hbrady7's `src/app/globals.css` `@theme` block before
porting any pillar/strain/sleep/readiness card.

### Missing ActiveWorkoutSession type + Zustand slice (Wave 0 — before Phase 3)

Per the architecture call: keep active workout in client-only Zustand
(short-lived, every-tap mutating). Carter's complete shape:

**Type** (add to `src/lib/types.ts`):

```ts
export type ActiveWorkoutSession = {
  id: string;
  startedAt: string;
  lastSetAt?: string;
  workoutType?: string;
  exercises: LiftExercise[];
  restTargetSeconds?: number;
  restDismissedAt?: string;
};
```

**Store actions** (add to `src/store/index.ts` — hbrady7 already uses
Zustand for UI state per its CLAUDE.md):

```ts
// State slice
activeWorkout: ActiveWorkoutSession | null;

// Actions (all the carter actions, distilled):
startActiveWorkout: (workoutType?: string) => void;
cancelActiveWorkout: () => void;
finishActiveWorkout: () => Promise<LiftSessionRow | null>;  // POSTs to /api/data/workouts then clears
addActiveWorkoutSet: (
  exerciseName: string,
  weight: number,
  reps: number,
  options?: { completed?: boolean }
) => void;
addActiveWorkoutExercise: (exerciseName: string) => void;
removeActiveWorkoutSet: (exerciseId: string, order: number) => void;
removeActiveWorkoutExercise: (exerciseId: string) => void;
updateActiveWorkoutSet: (
  exerciseId: string,
  order: number,
  patch: Partial<LiftSet>
) => void;
toggleActiveWorkoutSetComplete: (exerciseId: string, order: number) => void;
setActiveWorkoutRestTarget: (seconds: number) => void;
dismissActiveWorkoutRest: () => void;
toggleActiveWorkoutSuperset: (exerciseIdA: string, exerciseIdB: string) => void;
breakActiveWorkoutSuperset: (exerciseId: string) => void;
startWorkoutFromTemplate: (templateId: string) => void;  // seeds from a WorkoutRoutine
```

Carter's full implementations live in
`~/Downloads/life-os-carter/src/store/index.ts` — search for each
action name and copy the body. The `finishActiveWorkout` needs one
change: instead of writing to a Zustand `liftSessions` array, POST
to `/api/data/workouts` (returns the persisted row, then triggers
`mutate(KEY_WORKOUTS)` so the SWR hook refreshes).

Persist the `activeWorkout` slice via Zustand's `persist` middleware
to localStorage so a closed PWA mid-workout doesn't lose state.

### Missing component (Wave 2 — alongside the Phase 3 page port)

- **`src/components/workout/active-workout-banner.tsx`** (carter has it) —
  persistent banner shown across every screen while a workout session
  is live. Fixed-position above BottomNav on mobile, top-right chip on
  desktop. Tap → opens the active-workout-page. Already wired into
  carter's root layout. Port pattern: copy verbatim, swap any
  `useStore` → existing v2 hook equivalents.

```bash
cp ~/Downloads/life-os-carter/src/components/workout/active-workout-banner.tsx src/components/workout/
```

Mount in `src/app/layout.tsx` (or wherever hbrady7 mounts its persistent
chrome) so it renders globally.

### Missing /gym page wiring (Wave 2 — Phase 5)

Carter's `src/app/gym/page.tsx` slots in five sections that the v2
version needs added:

```tsx
<TodayRoutineCard />          // auto-surfaces a routine scheduled for today
<DetectedSessionCard />        // Fitbit-detected workout import prompt
<StartWorkoutCTA />            // primary CTA (Start workout / Continue workout)
<RoutinesSection />            // routine list with edit + start (uses useWorkoutRoutines)
<ExportCsvButton />            // CSV export using lib/csv-export.ts (already ported)
```

Full source at `~/Downloads/life-os-carter/src/app/gym/page.tsx`.
Port the function bodies, swap Zustand reads for SWR hooks.

### Missing pre-workout ReadinessChip (inside active-workout-page)

Carter's active-workout-page has a `<ReadinessChip />` between the
header and stats strip — shows today's composite readiness score
(uses `computeReadiness` from `lib/readiness.ts`, already ported in
`8f3ce1f`). Make sure it's preserved during the Phase 3 port.

### Voice logger details (Phase 2)

- API route `app/api/voice-workout/route.ts` uses Gemini's audio
  input. Server-side only. Reuse hbrady7's existing
  `resolveGeminiApiKey()` + `@google/genai` pattern. The route
  parses spoken sets ("10 reps at 185 for bench") into structured
  ParsedSet[] using a grounded prompt with the active workout's
  known exercise names.

- Component `voice-logger-modal.tsx` uses MediaRecorder with
  dynamic mimeType (`audio/webm;codecs=opus` preferred), base64
  encodes, POSTs to the route, surfaces a preview UI with
  per-set include/exclude checkboxes, commits via parent
  `onCommitSet` callback (which calls `addActiveWorkoutSet` from
  the Zustand slice).

### Voice-journal vs Voice-workout

Carter has BOTH `voice-journal-modal.tsx` (journal entries, already
in hbrady7) and `voice-logger-modal.tsx` (sets logging, NEW).
Don't conflate — they're separate flows.

### CSV export wiring (~10 lines, can ship anytime)

`lib/csv-export.ts` is already ported. To activate, add a button on
/gym (or as a settings action):

```tsx
import { liftSessionsToCsv, downloadCsv } from "@/lib/csv-export";
import { useWorkouts } from "@/lib/hooks/use-workouts";  // existing

function ExportCsvButton() {
  const { workouts } = useWorkouts();  // adapt to actual hook shape
  if (!workouts.length) return null;
  return (
    <Button onClick={() => {
      const csv = liftSessionsToCsv(workouts);
      downloadCsv(`life-os-workouts-${todayStr()}.csv`, csv);
    }}>
      Export CSV
    </Button>
  );
}
```

### Updated phase order

The corrected order (replacing the earlier "Phase 1 first" advice):

1. **Wave 0** — add pillar palette tokens to globals.css, copy
   workout-history.ts, add ActiveWorkoutSession type + Zustand slice
2. **Phase 1** — 4 entity REST + hook quads (recipes, fasting,
   workout_routines, workout_hr_series)
3. **Phase 2** — port the data-dependent Today/Nutrition/Stats cards
   + universal-search-modal + voice-workout API + voice-logger-modal
4. **Phase 3** — port `active-workout-page.tsx` (now possible because
   Wave 0 + Phase 1 are done) + `active-workout-banner.tsx`
5. **Phase 4** — per-exercise deep-dive page
6. **Phase 5** — routine editor + /gym page wiring +
   `today-routine-card` + `detected-session-card` + CSV button

Wave 0 is small (~1h). Phase 1 is the bulk of the REST/hook work
(~2h). Phase 2 is wide but mechanical (~2-3h). Phase 3 is the single
biggest port (~3-4h). Phases 4 + 5 are smaller (~1-2h each).
