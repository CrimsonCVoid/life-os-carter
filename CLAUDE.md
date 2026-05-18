# CLAUDE.md

> Read this first. It captures the stack, design system, conventions, and the persistent rules for working on Life OS. Match what's already in the codebase before inventing new patterns.

## What Life OS is

A mobile-first PWA personal command center: goals, habits, mood/sleep/water/weight/steps, nutrition, workouts, journal, and a Gemini-powered AI coach ("Overseer") that sees the whole picture. Dark, premium, fast. **No backend, no auth, no DB** — everything persists to `localStorage` under the key `life-os:v2`.

---

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind v4** — CSS-first theme tokens (no `tailwind.config.js`; tokens live in `src/app/globals.css` under `@theme`)
- **Neon Postgres** (free tier, scale-to-zero) + **Drizzle ORM** + **drizzle-kit** for migrations. Schema lives in `src/lib/db/schema.ts`; client in `src/lib/db/index.ts`. Pooled URL at runtime, unpooled URL for migrations.
- **Auth.js v5** (`next-auth@beta`) with the GitHub provider + `@auth/drizzle-adapter` against the Neon `users / accounts / sessions / verification_tokens` tables. App is fully gated behind sign-in.
- **SWR** for client data fetching (chosen over TanStack Query for bundle size + simpler optimistic-update story; the personal-PWA scale doesn't need TanStack's caching power).
- **Zustand 5** for UI-only state (modal opens, transient form state, derived selectors). Synced data (anything user-scoped that needs to survive a device wipe) lives in Neon. Persist middleware is reserved for purely-local prefs we don't care to round-trip to the server.
- **Motion 12** (formerly framer-motion) for springs, gestures, and presence
- **@dnd-kit** for drag reorder (PointerSensor with activation distance to avoid stealing input focus)
- **Recharts 3** for charts. NOTE: SVG attrs don't resolve `var(--...)` — use `metricHex()` for `stroke` / `fill`.
- **lucide-react** for icons
- **date-fns 4** for date math (alongside our `src/lib/date.ts` helpers + `DateStr` = `"YYYY-MM-DD"` string)
- **@google/genai** (Gemini 2.5 Flash) — **server-side only**, route handlers under `src/app/api/`
- **idb** for IndexedDB blob stores (audio, photos, meal photos). **Blobs never move to Neon** — only their keys land in Postgres (`photo_indexeddb_key`, `voice_indexeddb_key`).
- **PWA**: `manifest.webmanifest` via Next metadata API, programmatic gradient icons, `public/sw.js` (network-first HTML, SWR assets, never caches `/api/*`, prod-only)

Run scripts: `npm run dev`, `npm run build`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`, `npm run db:generate`, `npm run db:push`, `npm run db:studio`.

### Database workflow

1. Edit `src/lib/db/schema.ts`.
2. `npm run db:generate` → drizzle-kit writes a SQL file into `src/lib/db/migrations/`.
3. `npm run db:push` for quick dev sync, or `npm run db:migrate` to apply migration files in order.
4. Both commands hit `DATABASE_URL_UNPOOLED` (direct connection — the Neon pooler doesn't accept some DDL).
5. App-time queries use `DATABASE_URL` (pooled, HTTP-only via `@neondatabase/serverless`).

### Auth / data-access discipline

- Every API route handler under `src/app/api/data/*` must call `getCurrentUser()` from `src/lib/auth-server.ts` before any query. There must be no path to a query that doesn't filter by the session's `userId`.
- OAuth tokens for third-party integrations (e.g. Google Health) are AES-256-GCM-encrypted via `src/lib/db/encryption.ts` before insert. The encryption key is derived from `NEXTAUTH_SECRET` via HKDF — no separate `ENCRYPTION_KEY` env var.

---

## File structure conventions

```
src/
  app/                         # Next App Router pages + API
    page.tsx                   # Today screen (Day screen; uses DayProvider)
    layout.tsx                 # Root layout, fonts, providers, BottomNav
    globals.css                # Theme tokens + utilities + keyframes
    settings/                  # /settings
    stats/                     # /stats
    habits/                    # /habits
    journal/                   # /journal
    nutrition/                 # /nutrition
    gym/                       # /gym
    body/                      # /body
    onboarding/                # /onboarding (gated by settings.hasOnboarded)
    api/
      overseer/                # streaming chat + briefing + summary
      patterns/                # pattern insights
      weekly-review/           # weekly review generation
      food-photo/              # photo nutrition extraction
      voice-journal/           # audio transcription
  components/
    ui/                        # primitives: button, card, modal, input, slider, pill, etc.
    today/                     # day-screen-scoped cards + log modals
      log-modals/              # tap-to-log sheets (sleep, mood, water, weight, energy, steps)
    nav/                       # BottomNav + floating Settings gear
    overseer/                  # floating AI panel + context
    stats/, journal/           # per-screen subcomponents
    screen.tsx                 # page chrome wrapper (max-w-[640px], safe-area paddings)
    hydrate-gate.tsx, accent-provider.tsx, sw-register.tsx
  lib/
    types.ts                   # ALL shared types + DEFAULT_* constants. Source of truth.
    date.ts                    # DateStr helpers (todayStr, fromDateStr, format, diffDays, ...)
    utils.ts                   # cn(), uid(), clamp(), round1(), pluralize(), ACCENT_HUES
    haptics.ts                 # haptic("tap" | "soft" | "success" | "warn" | "error" | "long")
    metric-colors.ts           # metricColors(), metricHex() — never inline hex
    insights.ts                # buildInsightsContext30d, weekBounds, buildWeeklyContext
    recurrence.ts              # shouldGenerateForDate, weekRangeFor (recurring goals)
    prompts.ts                 # Gemini system prompts
    score.ts                   # weighted day-score calculation
    repcount.ts                # rep counter for lifts
    photo-store.ts, meal-photo-store.ts, audio-store.ts  # IDB blob stores
  store/
    index.ts                   # Zustand store, actions, persist + partialize/merge
    selectors.ts               # typed selectors (useToday, useTodayGoals, useUnifiedGymSessions, ...)
```

**Path alias:** `@/*` → `src/*`. Always import via `@/...`.

**Where to add things:**
- New shared type → `src/lib/types.ts` (and the corresponding `DEFAULT_*` next to it).
- New action / persisted field → `src/store/index.ts` (update **both** `partialize` and `merge` paths).
- New typed selector → `src/store/selectors.ts`.
- New UI primitive used in 2+ places → `src/components/ui/`. One-off, screen-scoped → `src/components/<screen>/`.
- New API route → `src/app/api/<name>/route.ts`. Server-side only; never expose `GEMINI_API_KEY` to the client.
- New per-day modal → `src/components/today/log-modals/`.

---

## Design system

### Colors — token-only, no inline hex

All colors live as CSS variables in `src/app/globals.css` under `@theme`. **Never inline hex values in components.** Use the token in one of these forms:

```tsx
// Tailwind utility wrapping a CSS var:
className="bg-[var(--color-card)] text-[var(--color-fg)] border-[var(--color-stroke)]"

// For metrics (calories, protein, sleep, mood, energy, ...), use the helper:
import { metricColors, metricHex } from "@/lib/metric-colors";
const c = metricColors("sleep");
<div style={{ background: c.soft, color: c.base }} />

// Recharts can't resolve var() in SVG attrs — use metricHex():
<Line stroke={metricHex("sleep")} />
```

**Surfaces** (dark theme):
| Token | Purpose |
|---|---|
| `--color-base` | page background `#050507` |
| `--color-card` | card surface `#0F0F12` |
| `--color-card-hover` | card hover `#14141A` |
| `--color-elevated` | inputs, controls `#14141A` |
| `--color-stroke` | hairline border `#1A1A1F` |
| `--color-stroke-strong` | emphasized border `#26262E` |

**Text:** `--color-fg` (primary), `--color-fg-2` (secondary, ~`#8E8E93`), `--color-fg-3` (tertiary, ~`#48484A`).

**Accent** (theme-able via `AccentProvider`): `--color-accent`, `--color-accent-strong`, `--color-accent-soft`. Default violet. Onboarding lets users pick violet / emerald / rose / amber (see `ACCENT_HUES` in `lib/utils.ts`).

**Semantic:** `--color-success` (emerald), `--color-warning` (amber), `--color-danger` (rose). Priorities: `--color-p1` (rose), `--color-p2` (amber), `--color-p3` (blue).

**Metric palette** — every metric has `base` / `-2` (lighter sibling for gradients) / `-soft` (~12% opacity for empty-track tints). Access via `metricColors(m)` — never reference `--mc-*` tokens directly in components.

| Metric | Base token | Hue |
|---|---|---|
| `calories` | `--mc-calories` | amber (#F59E0B) |
| `protein` | `--mc-protein` | violet (#A78BFA) |
| `carbs` | `--mc-carbs` | sky (#38BDF8) |
| `fat` | `--mc-fat` | emerald (#10B981) |
| `water` | `--mc-water` | cyan (#22D3EE) |
| `sleep` | `--mc-sleep` | indigo (#818CF8) |
| `mood` | `--mc-mood` | rose (#F43F5E) |
| `energy` | `--mc-energy` | amber/orange (#F59E0B → #FB923C) |
| `weight` | `--mc-weight` | slate (#94A3B8) |
| `steps` | `--mc-steps` | lime (#84CC16) |
| `hrv` | `--mc-hrv` | indigo (shares sleep) |
| `rhr` | `--mc-rhr` | coral (#F87171) |
| `cardio` | `--mc-cardio` | rose-300 (#FDA4AF) — Weekly Cardio Load |

**Streak tiers** — `streakTier(n)` returns `{ color, glow, showFlame }`. Bronze ≥3, orange ≥7, gold ≥30.

### Typography

- Font family: **Inter Variable** via `--font-sans` (system fallback chain in the var).
- Page title (`<Screen title>`): `text-[28px] font-bold tracking-tight`.
- Card title pattern: the `.label` utility — `11px uppercase tracking-[0.14em] text-fg-3 font-medium`.
- Numbers: add `.tnum` (tabular-nums) anywhere digits update — counters, sparkline tooltips, durations, kcal.
- Inputs on mobile must be `font-size: 16px` to suppress iOS zoom-on-focus — use the `.no-zoom` utility when needed.

### Spacing, radii, shadows

- Radii: `--radius-card` (1.25rem), `--radius-control` (0.75rem), `--radius-pill` (9999px). Use the tokens, not magic numbers.
- Shadows: `--shadow-card` (subtle inset + drop), `--shadow-float` (modal/floating UI), `--shadow-glow` (accent glow for primary buttons / active states).
- Card surface is the `.card` utility: `bg-card border border-stroke rounded-[var(--radius-card)] shadow-[var(--shadow-card)]`. Hover state: `.card-hover`. Don't reinvent.
- Page chrome: wrap screens in `<Screen>` — handles `max-w-[640px]`, safe-area top/bottom, child `space-y-4`.

### Motion patterns

- Use **Motion** (`import { motion, AnimatePresence } from "motion/react"`).
- **Entry** spring used everywhere: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}`. The ease is exported as `--ease-spring` for CSS too.
- **Modal/sheet** entry: `initial={{ y: "100%", opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 32 }}`. See `components/ui/modal.tsx` — use it instead of rolling your own.
- **Card hover** is the `.card-hover` CSS utility (160ms `var(--ease-spring)`).
- **Active press**: buttons scale to `[0.97]`; cards scale to `0.99`.
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)`) collapses durations to 0.01ms — don't introduce animations that fight this.
- **Swipe gestures** use Motion's `onPanEnd` + `PanInfo`. The Day screen uses thresholds `|offset.x| > 80px` OR `|velocity.x| > 400 px/s`, and rejects when `|dy| > |dx|`. Match these thresholds for new swipe surfaces.
- **dnd-kit** uses `PointerSensor` with an activation distance to coexist with text inputs and swipe gestures. Drag handles are explicit grip icons.
- **Haptics**: call `haptic("tap")` on taps, `haptic("soft")` on subtle interactions (dismiss, toggle off), `haptic("success")` on positive completion, `haptic("warn"|"error")` for the obvious cases. No-ops on devices without `navigator.vibrate`.

### Component primitives (use these — don't recreate)

- `<Button variant="primary|secondary|ghost|soft|danger|outline" size="sm|default|lg|icon|iconSm|pill">` — from `components/ui/button.tsx`. `asChild` slot pattern.
- `<Card>`, `<CardHeader>`, `<CardTitle>` — page sections.
- `<Modal>` — bottom-sheet on mobile, centered on desktop, drag-to-dismiss, body-scroll-lock, esc-to-close.
- `<Pill>`, `<Toggle>`, `<Checkbox>`, `<Input>`, `<Textarea>`, `<Slider>`, `<Segmented>`, `<MetricBar>`, `<StreakBadge>`, `<ConfirmModal>`.
- `<Screen title? subtitle?>` — every page is wrapped in this.

### Tailwind v4 specifics

- No `tailwind.config.js`. Theme is the `@theme` block in `globals.css`. Adding a token = add the CSS var there.
- Use `cn()` from `@/lib/utils` to merge classes (wraps `clsx` + `tailwind-merge`).
- Prefer arbitrary value `[var(--token)]` syntax over hardcoded hex anywhere.

---

## Data conventions

- **Dates** are `DateStr` = `"YYYY-MM-DD"` strings (typed nominal in `lib/types.ts`). Build them with `todayStr()`, parse with `fromDateStr()`, format with `format()` (re-exports date-fns). Never store `Date` objects in the Zustand state.
- **IDs**: `uid()` from `@/lib/utils`.
- **All persisted shape changes must be reflected in both `partialize` and `merge`** in `src/store/index.ts`. The store deep-merges so older exports stay forward-compatible.
- **Selectors** subscribe to the **smallest stable slice**. Don't return new array/object literals from a selector — they break referential equality and can cause infinite re-renders (we hit this exact bug in `useUnifiedGymSessions` — see git history). If you need a derived view, select stable arrays and derive inside the component via `React.useMemo`.
- The Day screen reads the selected date from `useSelectedDate()` (provided by `<DayProvider>`). `useToday()` falls back to actual today off the Day screen. Time-gated UI (morning collapse after 11am, evening reveal after 8pm, etc.) MUST be gated behind `useIsActualToday()` so navigating to past/future days doesn't activate them.

---

## API / server conventions

- All Gemini calls happen in `src/app/api/*/route.ts` — never on the client. The key is read from `process.env.GEMINI_API_KEY`.
- The Overseer streaming route streams token-by-token; non-streaming routes (briefing, summary, patterns, weekly-review) cache by date on the client in `settings.*`.
- Prompts live in `src/lib/prompts.ts`. Update the prompt file, not the route, when iterating on coach voice / format.
- Context builders (`buildInsightsContext30d`, `buildWeeklyContext`) live in `src/lib/insights.ts`. Build context on the client, POST it to the server — never give the server direct store access.

---

## Persistent rules

These are the rules I want you to follow every session. They beat your defaults.

### Workflow

1. **Match existing patterns before inventing new ones.** Grep the codebase for a similar feature first. If a Card / Modal / pill style already exists for something analogous, copy that pattern. New abstractions only when the third repetition shows up.
2. **Commit after every major change.** A "major change" = a working feature, a bug fix, or a meaningful refactor. Don't pile multiple features into one commit. Don't commit broken intermediate states.
3. **Push to GitHub** after committing — `git push`. Vercel builds on push, so this is also how I verify builds.
4. **Co-author trailer** is fine on commits. Conventional-commit-style imperative subject ("Add X", "Fix Y", "Refactor Z") followed by a short body when context isn't obvious from the diff.
5. **Never amend a commit unless I explicitly ask.** Make a new commit.
6. **No `--no-verify`, no skipping hooks.** If a hook fails, fix the cause.
7. **Don't commit secrets.** `.env.local` is gitignored; keep it that way. The `.env.local.example` file is the template.
8. **Always update `partialize` AND `merge`** in `store/index.ts` when adding a persisted field. Older exports break otherwise.

### Code style

1. **Never inline hex colors.** Use `var(--color-*)`, `metricColors(m)`, or `metricHex(m)` (Recharts only). If a color doesn't exist as a token, add one to `globals.css` first.
2. **Never inline magic spacing or radii** when a token exists — use `var(--radius-card|control|pill)`.
3. **Use the existing `<Button>`, `<Card>`, `<Modal>`, `<Input>`, etc. primitives.** Don't rebuild a "secondary button" inline.
4. **Use `cn()` for class composition** — never manually concatenate Tailwind strings.
5. **Use `haptic()` on user actions that have meaningful feedback** — taps, toggles, completion, dismiss. Be conservative; don't haptic on every render side effect.
6. **TypeScript strict** — no `any`, no `as unknown as`. If a type's hard, refactor or extend `lib/types.ts`.
7. **Don't write comments that describe WHAT the code does.** Comments explain WHY: a hidden constraint, a non-obvious invariant, a workaround for a specific bug, behavior that would surprise a future reader.
8. **Don't add error handling for impossible cases.** Trust framework guarantees and internal code. Validate at boundaries only (API input, localStorage rehydration, user input).
9. **Don't add fallbacks, feature flags, or backwards-compat shims** when you can just change the code. There's no production user base to protect.
10. **Default to no new files.** Edit existing ones. Don't create README/docs/notes files unless I ask.
11. **No emojis in code, comments, or commit messages** unless I explicitly ask. (Goal/habit emoji *data* is fine — those are user-visible content.)
12. **Lucide icons only.** Don't introduce a second icon library.

### Selectors / store

1. Selectors return stable references. If a derived view requires `.map`/`.filter`/`.sort`, do it in a `React.useMemo` inside the component, not in the selector. `useShallow` does element-wise `===` over the array — fresh object literals defeat it and cause infinite re-renders.
2. The Day-scoped selectors (`useTodayGoals`, `useTodayWorkouts`, etc.) read the selected date via `useToday()` → `useSelectedDate()`. Don't hardcode `todayStr()` inside a day-scoped selector.
3. `useHabitStreak` is pinned to actual today by design (streak is a *property* of the user, not the viewed day). Don't reroute it through the day context.

### UI/UX

1. **Mobile-first.** Test the iPhone layout first. `<Screen>` already enforces `max-w-[640px]`. Don't introduce horizontal scroll except for explicit "pulse strip" scrollers.
2. **Safe areas matter** — use `env(safe-area-inset-top/bottom)`. `<Screen>` already handles them. Floating UI (nav, gear, overseer button) must respect them.
3. **Time-gated UI** (morning collapse, evening reveal, schedule now-line) must check `useIsActualToday()`. Past/future days don't get auto-collapsed or auto-revealed.
4. **Past days** show all logging surfaces, fully editable, no time gates.
5. **Future days** show planning only: Goals + recurring previews. No Sleep/Routines/Reflection cards.
6. **Overseer** is always pinned to *actual* today, even when viewing past/future. It's a "coach watching you right now" — not "coach for the day you're looking at."

### Communication

1. **Be terse.** I can read diffs. Short status updates, short summaries. Don't recap what I just saw.
2. **State changes directly.** No "I'll start by..." preamble. Show the work.
3. **When something is verification-pending** (e.g. couldn't run typecheck because no Node in sandbox, couldn't test on iOS), say so explicitly. Don't claim success on things I have to verify.
4. **Don't ask permission for read-only investigation.** Grep, read files, follow refs freely. Pause only before destructive actions (force-push, file deletion, `rm -rf`) or when the requirements are genuinely ambiguous.
5. **Don't print giant code blocks in chat** when an Edit will do. Tool calls show me the diff.

### What NOT to do

- ❌ Don't create new markdown docs / notes / planning files unless I ask.
- ❌ Don't suggest "Should I also...?" for adjacent cleanup. If it's necessary for the task, do it. If it's optional, skip it.
- ❌ Don't add tests "for safety" — there are none in this project. If I want tests, I'll say so.
- ❌ Don't add `console.log`s in shipped code.
- ❌ Don't introduce new dependencies for things solvable with what's installed.
- ❌ Don't refactor unrelated code in a feature commit.

---

## Reference snippets

### Reading the selected day correctly

```tsx
import { useDay } from "@/components/today/day-context";
import { useSelectedDate } from "@/components/today/day-context";

function MyDayCard() {
  const { date, isToday, isFuture } = useDay();
  if (isFuture) return null;       // hide on future days
  // ... read/write keyed by `date`
}

// Off the Day screen, useSelectedDate() falls back to actual today.
```

### Card with metric color

```tsx
import { metricColors } from "@/lib/metric-colors";

const c = metricColors("sleep");
<div
  className="card p-4"
  style={{
    background: `linear-gradient(135deg, color-mix(in srgb, ${c.base} 12%, var(--color-card)) 0%, var(--color-card) 70%)`,
    borderColor: `color-mix(in srgb, ${c.base} 24%, transparent)`,
  }}
/>
```

### Entry animation (default)

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
/>
```

### Adding a persisted setting

1. Add type + `DEFAULT_*` to `src/lib/types.ts`.
2. Add field to `Settings` type and default in `store/index.ts` `defaultSettings`.
3. Add action signature + impl in the store.
4. Update both the `partialize` and `merge` paths so older exports keep working.
5. Add a card to `src/app/settings/page.tsx`.

---

## Things to remember

Quirks, gotchas, and external constraints that future-me (or another agent) needs to know before touching certain features.

### Google Health API integration (Fitbit / Pixel Watch sync)

- **API stability:** The Google Health API (`health.googleapis.com/v4`) is in late pre-GA. Google has stated breaking changes are possible through **end of May 2026**. All response parsing and endpoint construction lives in **one adapter layer** at `src/lib/integrations/google-health/`. Do not spread response-shape assumptions across the codebase — if Google changes a field, the fix should be one file.
- **Replaces deprecated Fitbit Web API.** Don't re-introduce Fitbit-specific code paths.
- **Scopes** (all `readonly`, all restricted — privacy review required for non-personal use):
  - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
  - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
  - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
- **Data type identifiers are kebab-case in URL paths and snake_case in filter parameters.** `heart-rate-variability` in the path, `heart_rate_variability` in `?filter=...`. The adapter handles this translation; never inline either form in component code.
- **Auth flow uses PKCE** (Authorization Code + S256). Refresh tokens are stored in httpOnly cookies set by route handlers under `/api/google-health/*`. The client never sees access or refresh tokens — it asks `/api/google-health/status` for connection metadata and triggers sync via `/api/google-health/sync`.
- **Env vars** (in `.env.local` and Vercel Production+Preview):
  - `GOOGLE_HEALTH_CLIENT_ID`
  - `GOOGLE_HEALTH_CLIENT_SECRET`
  - `GOOGLE_HEALTH_REDIRECT_URI`
- **Sync model:** No background workers (Vercel free tier). Sync runs on Today screen mount if `lastSyncAt > 30 min ago`, or via the manual "Sync now" button. Each run pulls the last 7 days of every data type (cheap, handles backfill + overnight sleep landing after midnight). First-ever sync pulls 30 days.
- **Manual entry beats sync.** Every metric tracks `syncedAt` and `manualOverrideAt`. If `manualOverrideAt > syncedAt`, the next sync must not overwrite the value. The 🔗 icon hides when the value is a manual override.
- **Overseer is pinned to actual today**, including when interpreting Google Health data — see `useIsActualToday()`.

### iOS Safari standalone-PWA quirks

- **Microphone permission for voice journal:** iOS Safari treats the standalone PWA (added-to-home-screen) as a separate browsing context from the Safari tab. Mic permission granted in the Safari tab does **not** carry over to the PWA. Each install context has to grant mic separately — surface a clear "tap to enable mic" prompt the first time the user records inside the PWA.
- **OAuth redirect handling:** When kicking off OAuth from the standalone PWA, the redirect can sometimes return into the Safari tab instead of the PWA window. The Integrations card must tolerate this — if the user lands in Safari after consent, opening the PWA again should still find a connected state (because the cookie is set on the response). Don't depend on `window.opener` or a popup flow on iOS — use a same-tab redirect.
- **`prefers-reduced-motion`:** iOS honors this aggressively; never rely on motion to convey state changes.
