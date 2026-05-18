# Life OS (Carter's Fork) — Project Context

> **Audience:** another AI assistant or developer starting cold on this codebase. Read this once and you should have enough to make grounded suggestions and edits without re-discovering the basics.

---

## 1. Identity

- **Repo:** `CrimsonCVoid/life-os-carter` (fork of `hbrady7/life-os`)
- **Local path:** `/Users/carterbrady/Downloads/life-os-carter`
- **Owner / sole user:** Carter Brady (`carter@carolinacomfort.info`)
- **Working branch:** `carters-branch-testing`
- **Type:** Personal, single-user wellness/productivity PWA. Not multi-tenant. Not B2B. Built for Carter to use daily.

---

## 2. What the app does

Life OS is a mobile-first **personal daily command center**. One person logs in (passkey), sees a "Today" screen with their score ring, daily metrics, goals, habits, workouts, meals, and journal — all centered on the current date but navigable backward (review) and forward (planning). An AI coach ("Overseer", Gemini-powered) hovers as a floating panel and gives streaming coaching with full context of the user's recent data.

### Main screens
| Route | Purpose |
|---|---|
| `/` | **Today** — score ring, Daily Pulse (sleep/mood/energy/water/weight/steps/HRV/RHR), morning routine, goals, habit grid, evening reflection. Day-context-aware: shows past/future days but Overseer always watches actual today. |
| `/stats` | 30/90-day heatmap, mood/energy line chart, sleep area chart, weight graph, workout breakdown, habit rates, streak leaderboard |
| `/habits` | 60-day calendar grid, drag-reorder, custom habits + 10 starter templates |
| `/journal` | Reverse-chrono feed; markdown; mood/energy tags; source tracking (manual / reflection / voice / weekly-review) |
| `/gym` | RepCount-style paste-log for exercises (sets/reps/weight); per-exercise progress charts |
| `/nutrition` | Meal log + macros; photo→food via Gemini vision |
| `/body` | Body measurements + progress photos (front/side/back) |
| `/settings` | Units, accent color, integrations, nutrition targets, export/import |
| `/onboarding` | First-launch flow |
| `/login` | **NEW — passkey auth screen (Carter's addition)** |

---

## 3. Architecture (upstream — what life-os was)

- **Framework:** Next.js 15 App Router + React 19 + TypeScript 5.9 (strict, no `any`)
- **State:** Zustand 5 with `persist` middleware → **localStorage key `life-os:v2`**. Single global store at `src/store/index.ts` (~1578 lines).
- **Blobs:** IndexedDB (`idb` lib) for meal photos, voice audio, progress photos
- **Styling:** Tailwind v4 with CSS-var theme tokens in `src/app/globals.css` under `@theme`. **Never hardcode hex** — use `metricColors()` / `metricHex()` helpers (`src/lib/metric-colors.ts`)
- **Motion / DnD / Charts:** Motion 12, `@dnd-kit`, Recharts 3
- **Icons:** lucide-react (single icon library — enforced)
- **AI:** Gemini 2.5 Flash via `@google/genai`, server-side only; client never sees the key
- **PWA:** custom `/public/sw.js` (network-first HTML, SWR assets, **never caches `/api/*`**)
- **No backend, no auth, no DB** in upstream. Pure local. ← *This is what Carter is changing.*

---

## 4. What Carter is building (the fork's net-new work)

Carter is migrating from "personal localStorage-only app" to "cloud-backed single-user app with real auth and per-account storage." Three layers added so far:

### 4a. Database — Neon Postgres
- Connection string in `.env.local` as `DATABASE_URL` (must be rotated; a previous version was leaked in chat and needs replacement).
- **Comprehensive schema lives at `db/schema.sql`** — single file, idempotent on empty DB.
- Modeled after `src/lib/types.ts` with **one improvement**: habit/routine `history` (originally inline `Record<DateStr, boolean>`) is normalized into `habit_completions` / `morning_routine_completions` / `evening_routine_completions` tables. Postgres is relational; take advantage.
- **Row Level Security enabled on every user-scoped table.** Policies use `current_user_id()` which reads `current_setting('app.user_id')`. App must call `SELECT set_config('app.user_id', $1, true)` inside each transaction.
- Auth tables (`passkey_credentials`, `webauthn_challenges`, `sessions`) and `user_tokens` (OAuth refresh tokens) have `USING (false)` deny-all policies — server bypasses via ownership.
- Seed: a Carter Brady user is pre-inserted with fixed UUID `00000000-0000-4000-8000-000000000001` so the first passkey can be attached to an existing row.
- **Single-role for now**: app uses `neondb_owner` everywhere. To enforce RLS in production, create a separate `app_user` role (notes at the bottom of `db/schema.sql`).

### 4b. Auth — Passkeys (WebAuthn)
Library: `@simplewebauthn/server` + `@simplewebauthn/browser` (v11). No passwords, ever. Touch ID / Face ID / Windows Hello / hardware key.

**Two flows:**
1. **First-device bootstrap** — user visits `/login`, clicks "First time? Set up a passkey", enters `PASSKEY_SETUP_TOKEN` env value, registers passkey on the seeded Carter Brady user, gets auto-signed-in.
2. **Sign in** — user visits `/login`, clicks "Sign in with passkey", OS prompts for biometric, server verifies, sets session cookie, redirects.

**File map:**
```
src/lib/auth/
  config.ts        RP_ID, RP_ORIGIN, RP_NAME, SESSION_COOKIE, TTLs — env-driven
  session.ts       getCurrentUser, requireUser, createSession, destroySession
  webauthn.ts      generation + verification for register and login

src/app/api/auth/
  webauthn/register-options/route.ts   POST — issues registration challenge
  webauthn/register-verify/route.ts    POST — stores credential + auto-sign-in if bootstrap
  webauthn/login-options/route.ts      POST — issues authentication challenge
  webauthn/login-verify/route.ts       POST — verifies, opens session, sets cookie
  logout/route.ts                      POST — deletes session row + cookie
  me/route.ts                          GET  — returns current user or 401

src/app/login/page.tsx                 Login UI (client component, dark theme matching app)
src/middleware.ts                      Edge cookie-presence gate; redirects unauth → /login
```

**Session model:** opaque UUID stored in DB `sessions` table, referenced via `lifeos_session` httpOnly cookie. 30-day rolling expiry. Real validation happens server-side (DB lookup); middleware only checks cookie presence for routing.

### 4c. Storage — Vercel Blob
- **Per-user prefix:** `users/{uid}/{kind}/{slug}.{ext}` where kind ∈ `progress` | `meals` | `voice`
- **Client-direct uploads** via `@vercel/blob/client`'s `upload()` + server-side `handleUpload()` at `/api/uploads/sign`. Bytes never pass through Next functions — keeps us under Vercel's 4.5MB function-payload cap and lets us accept up to 25MB voice notes.
- **Auth gate:** `onBeforeGenerateToken` calls `getCurrentUser()`, validates the requested pathname starts with `users/{user.id}/`, and constrains content type/size by kind.
- **Helpers in `src/lib/storage/blob.ts`:** `uploadProgressPhoto`, `uploadMealPhoto`, `uploadVoiceJournal` — wrap the SDK with category-specific paths.
- **Privacy model:** URLs are unguessable but technically public. Acceptable for Carter's private app. To get true privacy later, proxy reads through a session-gated `/api/uploads/get/[id]` route.

---

## 5. File layout (current state)

```
life-os-carter/
├── db/
│   └── schema.sql                  Comprehensive Postgres schema + RLS + seed + notes
├── docs/
│   └── PROJECT-CONTEXT.md          This file
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/               WebAuthn + session routes (NEW)
│   │   │   ├── uploads/sign/       Vercel Blob token issuer (NEW)
│   │   │   ├── food-photo/         Gemini vision → meal nutrients (upstream)
│   │   │   ├── voice-journal/      Audio → transcription + mood (upstream)
│   │   │   ├── overseer/{route,briefing,summary}/   Gemini AI coach (upstream)
│   │   │   ├── patterns/           Pattern insight generation (upstream)
│   │   │   ├── weekly-review/      Weekly summary (upstream)
│   │   │   └── google-health/      OAuth + sync (upstream)
│   │   ├── login/page.tsx          Passkey login UI (NEW)
│   │   ├── page.tsx                Today screen
│   │   └── {stats,habits,journal,gym,nutrition,body,settings,onboarding}/page.tsx
│   ├── components/                 today/, ui/, nav/, overseer/, journal/, stats/, integrations/
│   ├── lib/
│   │   ├── auth/                   config.ts, session.ts, webauthn.ts (NEW)
│   │   ├── db/client.ts            Neon Pool + withUser(uid, fn) RLS helper (NEW)
│   │   ├── storage/blob.ts         Vercel Blob client-upload helpers (NEW)
│   │   ├── types.ts                **Source of truth** for all data shapes
│   │   ├── date.ts, utils.ts, haptics.ts, metric-colors.ts, score.ts, recurrence.ts, prompts.ts
│   │   └── integrations/google-health/   OAuth adapter (upstream)
│   ├── store/
│   │   ├── index.ts                Zustand store, ~1578 lines — STILL localStorage-only
│   │   └── selectors.ts            Typed selectors
│   └── middleware.ts               Edge auth gate (NEW)
├── package.json                    Added: @neondatabase/serverless, @simplewebauthn/{server,browser,types}, @vercel/blob
├── CLAUDE.md                       Upstream project guide — read this before changing existing surfaces
└── README.md
```

---

## 6. Conventions & quirks (read before editing)

These come from upstream `CLAUDE.md`. They're load-bearing:

1. **Zustand selectors + `useShallow`** — returning `.map()` / `.filter()` directly from a selector breaks referential equality → infinite re-renders. Compute stable arrays *inside* the selector. The commit `105591f` ("Fix Gym infinite re-render — useShallow + new objects don't mix") is the cautionary tale.
2. **Day context** — time-gated UI (morning collapse after 11am, evening reflection after 8pm) must check `useIsActualToday()` from `src/components/today/day-context.tsx`, or it'll incorrectly activate on past/future days. **Overseer always watches actual today**, not the currently-viewed day.
3. **Metric colors** — never inline hex. Use `metricColors(metric)` for CSS / `metricHex(metric)` for Recharts SVG (which can't resolve CSS vars).
4. **Persistence shape changes** — every change to the Zustand store shape must touch both `partialize` and `merge` in `src/store/index.ts`, or older localStorage exports break on hydration.
5. **No tests** — `CLAUDE.md:248` documents this is intentional. Don't add tests for "safety" without asking.
6. **Strict TypeScript** — no `any`. Use proper types or `unknown` + narrowing.
7. **Single icon library** — lucide-react only.

---

## 7. What's NOT done yet (outstanding work)

This is the most useful section for an AI assistant deciding what to work on next:

1. **🔴 Connect the Zustand store to Postgres.** Right now the store still reads/writes localStorage. The auth layer + DB schema exist; the data layer doesn't talk to them. Migration path:
   - On first sign-in, read the entire `life-os:v2` blob client-side
   - Walk the structure; batch-write to Postgres via per-collection inserts
   - Mark migration complete (`users.migration_complete = true` — needs a column added)
   - Switch the Zustand `persist` storage adapter to a Firestore-style sync adapter that mirrors to Postgres
2. **🔴 Wire blob uploads into existing UI.** `uploadProgressPhoto` / `uploadMealPhoto` / `uploadVoiceJournal` exist but the body/meal/voice screens still write to IndexedDB. Need to update each capture flow.
3. **🟡 Deploy DB schema to Neon.** User must rotate the leaked password, then run `psql $DATABASE_URL -f db/schema.sql`. Schema is idempotent.
4. **🟡 Set required env vars.** None of these exist yet in `.env.local`:
   ```
   DATABASE_URL=postgres://...               # rotated Neon connection string
   WEBAUTHN_RP_ID=localhost                  # or production hostname
   WEBAUTHN_ORIGIN=http://localhost:3000     # or https://prod-domain
   WEBAUTHN_RP_NAME=Life OS
   PASSKEY_SETUP_TOKEN=<long random string>  # used once to bootstrap first passkey
   BLOB_READ_WRITE_TOKEN=<from Vercel>       # for @vercel/blob
   GEMINI_API_KEY=<existing>
   ```
5. **🟡 Verify passkey flow end-to-end** — typecheck passes, but the auth flow has not been exercised against real OS biometric prompts yet.
6. **🟢 Migration tooling** — schema is one file; future changes need an actual migration story (Drizzle Kit, node-pg-migrate, or hand-rolled).
7. **🟢 Multi-device support** — works today via `excludeCredentials` in registration options. Just needs UI to list registered devices and revoke them. Table is ready.

---

## 8. Integration points (external services)

| Service | Purpose | Key env | Status |
|---|---|---|---|
| **Neon Postgres** | Primary cloud DB | `DATABASE_URL` | Schema written, not yet deployed |
| **Vercel Blob** | Per-user file storage | `BLOB_READ_WRITE_TOKEN` | API wired, UI not yet using it |
| **Gemini 2.5 Flash** | Overseer chat, briefings, photo→food, voice journal, pattern detection, weekly review | `GEMINI_API_KEY` | Working (upstream) |
| **Google Health API** | Sleep, steps, weight, HRV, RHR from Fitbit/Pixel Watch | Stored in `user_tokens` (server-only) | Working (upstream) |
| **WebAuthn** (no external service) | Passkey auth | `WEBAUTHN_*` | Code written, not exercised |

---

## 9. How to start working

```bash
cd /Users/carterbrady/Downloads/life-os-carter
git checkout carters-branch-testing      # already on this
npm install                              # already done
# 1. Set env vars in .env.local (see section 7.4)
# 2. Deploy schema:
#      psql "$DATABASE_URL" -f db/schema.sql
# 3. Generate a setup token (e.g. `openssl rand -hex 32`), put in PASSKEY_SETUP_TOKEN
# 4. npm run dev
# 5. Open http://localhost:3000 → redirected to /login → "First time? Set up a passkey" → register
```

After that, the standard upstream commands work: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run build`.

---

## 10. Mental model for an AI working here

- **Treat `src/lib/types.ts` as the source of truth** for all data shapes. The Postgres schema mirrors it; the Zustand store consumes it; new code should import from it.
- **The seam between localStorage-Zustand and Postgres has not been built yet.** Anything you add today either lives in the existing store (and gets migrated later) or in Postgres (and is read directly by API routes). Don't add a third path.
- **Carter is the only user.** Optimize for clarity and his daily workflow over multi-tenant generality. RLS exists as defense-in-depth, not because there's a second tenant.
- **Server-only secrets stay server-only.** Google Health refresh tokens, Gemini API key, the setup token — these go in env vars without `NEXT_PUBLIC_` prefix. Anything `NEXT_PUBLIC_` is exposed in the JS bundle.
- **The upstream `CLAUDE.md` is still authoritative for UI conventions.** Read it before touching frontend code.
