# Life OS — Handoff

This file is the state snapshot for resuming work in a new Claude Code
session. Read it first; ask if anything is unclear.

---

## Topology

**life-os-carter** (this repo) — Next.js 15 PWA at
https://life-os-carter.vercel.app
- Path: `~/Downloads/life-os-carter`
- Stack: Next 15 / React 19 / TS strict / Tailwind v4 / Zustand 5 /
  Motion 12 / Recharts 3 / @capacitor/* / web-push / @google/genai
- Auth: TOTP (RFC 6238) + 30-day server sessions
- Storage: Neon Postgres (RLS-everywhere) + Vercel Blob (private store) +
  IndexedDB (audio + meal photo blobs)
- AI: Gemini 2.5 Flash drives daily briefing, voice journal extraction,
  food photo nutrition, weekly review, pattern surfaces
- Native: Capacitor iOS shell exists at `ios/` (live-loads Vercel URL)
  — see `XCODE.md` for build steps
- Push: Web Push (VAPID) + service worker `push` + `notificationclick`
  handlers in `public/sw.js`
- Cloud sync: full Zustand state mirrors to Postgres
  `user_state_snapshots` on a 4s debounce; phone bootstraps from cloud
  on first sign-in

**life-os-bodycomp** (sidecar) — Python ML pipeline
- Path: `~/Downloads/life-os-bodycomp`
- GitHub: https://github.com/CrimsonCVoid/life-os-bodycomp
- Stack: Python 3.12 / uv / PyTorch (MPS) / asyncpg / structlog / httpx
- Pipeline: MediaPipe Pose Tasks API → SAM 2 → silhouette features
  (V-taper, waist/height, ratios) → Navy BF% → Qwen2.5-VL via Ollama
  for structured JSON observations
- Trigger: LISTENs on Postgres `new_progress_photo` channel; processes
  on every photo insert. Startup `catch_up` clears any backlog.
- Auto-start: launchd plist installed via
  `scripts/install-autostart.sh` (one-time). Logs to `logs/bodycomp.*.log`.

---

## Most recent commits (this session)

```
7aa3aec Whoop-style Readiness hero + pillar palette tokens
6474ac5 RepCount-feel workout sheet + remove manual sleep log
a9ba032 Activity rings + inline edit + workout templates + FAB + week view + photo scrubber
ba1fe8f Capacitor iOS shell + real haptics + quick-log tiles + app badge
96b2aa7 Active workout tracker + PWA App Shortcuts + URL-driven quick actions
12e955f Web Push + proactive AI daily briefing (Tier 1 B)
7113b75 Daily progress photo + monthly video export + system light/dark
9e5fbb7 Universal iOS haptic on every Button + CSS-keyframe modal/cards (120fps)
2dae7a2 Compositor-driven tweens + force switch attribute through to DOM
fb21153 Speed up animations + real iOS haptic on toggles
```

Run `git log --format='%h %s' -25` for the full recent history.

---

## Vercel env vars (Production + Preview)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `PASSKEY_SETUP_TOKEN` | TOTP enrollment gate (free-form secret) |
| `WEBAUTHN_RP_ID` | `life-os-carter.vercel.app` in prod |
| `WEBAUTHN_ORIGIN` | `https://life-os-carter.vercel.app` |
| `WEBAUTHN_RP_NAME` | `Life OS` |
| `GEMINI_API_KEY` | AI Studio key for Gemini 2.5 Flash |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — private store |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser push subscription |
| `VAPID_PRIVATE_KEY` | Server-side push signing |
| `VAPID_SUBJECT` | `mailto:carter@carolinacomfort.info` |
| `CRON_SECRET` | Bearer token for `/api/cron/*` routes |

Local mirror lives in `.env.local` (gitignored).

---

## Secrets leaked in prior chat history — rotate when possible

- Neon password (in `DATABASE_URL`)
- `BLOB_READ_WRITE_TOKEN`
- `GEMINI_API_KEY`
- `VAPID_PRIVATE_KEY` (low impact)
- `CRON_SECRET`

Most urgent: `GEMINI_API_KEY` — Google rate-limits aggressively if abused.

---

## Architecture invariants

- **localStorage is canonical.** Zustand `persist` middleware writes
  `life-os:v2` into localStorage. Cloud sync pushes that state to
  Postgres on a 4s debounce. On a fresh device, `bootstrapFromCloud()`
  in `src/lib/cloud-sync.ts` pulls the cloud snapshot BEFORE Zustand
  hydration, then triggers `useStore.persist.rehydrate()`.
- **All persisted shape changes must update BOTH `partialize` AND `merge`**
  in `src/store/index.ts`. The merge function is intentionally explicit
  to handle additive schema changes without losing older state.
- **Selectors return stable references.** `useShallow` does
  element-wise `===` over arrays. Don't return fresh array literals from
  a selector — derive in `React.useMemo` inside the component instead.
- **Day-scoped selectors read selected date from `useSelectedDate()`,
  NOT `todayStr()`** so navigating to past/future days works correctly.
  Time-gated UI (morning collapse, evening reveal) must be gated by
  `useIsActualToday()`.
- **AI calls happen server-side only.** Never expose `GEMINI_API_KEY`
  to the client. All Gemini logic lives in `src/app/api/*/route.ts`.
- **Schema changes are deployed via Neon directly** (one-off node
  scripts using `@neondatabase/serverless`). `db/schema.sql` is the
  source of truth — keep it in sync after every migration.
- **Sidecar reads jsonb capture_meta as a STRING** (asyncpg doesn't
  register a codec); parse with `json.loads` before passing to the
  pipeline. See `src/bodycomp/__main__.py:_handle_one`.

---

## Key file map

```
src/app/
  layout.tsx                Root layout — CloudSync, ActiveWorkoutBanner, QuickCaptureFab, QuickActionRouter
  page.tsx                  Today screen — ReadinessHero → DailyBriefing → ActivityRings → VitalsTier → QuickLogTiles
  body/page.tsx             Body screen — progress photos card + weight history rows
  stats/page.tsx            Stats — WeekViewCard + Heatmap + per-metric charts
  gym/page.tsx              Gym — StartWorkoutCTA + WorkoutTemplatesRow + history
  settings/page.tsx         Settings — BodyProfile, GoogleHealthCard, PushCard
  api/
    auth/totp/*             TOTP enroll/verify/login + rate limit
    body/progress-photos    Upload (private blob), list, image proxy, delete
    cron/daily-briefing     Vercel cron at 11:00 UTC → Gemini → daily_briefings → push
    push/*                  subscribe / unsubscribe / test
    briefings/today         Latest briefing for UI
    sync/snapshot           Cloud-sync mirror endpoints
    google-health/*         OAuth + sync (weight + steps + sleep + HRV + RHR)

src/components/
  today/
    readiness-hero.tsx           Whoop-style 0-100 readiness score (top of /today)
    activity-rings.tsx           Apple-Health-style 3 concentric rings (water/steps/sleep)
    daily-briefing-card.tsx      Gemini briefing card
    quick-log-tiles.tsx          Water/Mood/Energy/Workout grid
    log-modals/*                 Sleep/mood/water/weight/energy/steps log modals (sleep card removed)
  body/
    progress-photos-card.tsx     Daily photo card with streak + month counter + scrubber + video
    progress-photo-modal.tsx     Capture modal (front-only, with prior ghost overlay)
    photo-timeline-scrubber.tsx  Drag-slider across all photos
    month-video-modal.tsx        Canvas + MediaRecorder client-side video export
  workout/
    active-workout-banner.tsx    Floating timer banner (above BottomNav)
    active-workout-sheet.tsx     RepCount-style set logger (steppers + rest timer)
  ui/
    button.tsx                   Universal iOS-haptic button (overlaid <input switch>)
    modal.tsx                    iOS sheet (CSS keyframe present/dismiss + Framer drag)
    input.tsx, textarea.tsx      17px iOS-native form inputs
    toggle.tsx                   <input switch> for native iOS 17.4+ haptic
    number-stepper.tsx           Big +/- pad with long-press auto-repeat
    inline-edit.tsx              Tap-to-edit value primitive
  settings/
    push-card.tsx                Enable/test/disable web push
    google-health-card.tsx       OAuth + sync UI for Google Health
  nav/
    bottom-nav.tsx               UITabBar — SF-style filled-on-active icons
    top-nav.tsx, mobile-top-bar.tsx
  quick-capture-fab.tsx          Floating + button → 7-action sheet

src/lib/
  readiness.ts                   Whoop-style composite score (0-100)
  workout-history.ts             Per-exercise last-session lookup
  push.ts                        Server-side webpush wrapper
  push-client.ts                 Browser subscribe/unsubscribe/state
  app-badge.ts                   navigator.setAppBadge wrapper
  haptics.ts                     Capacitor → vibrate → no-op chain
  cloud-sync.ts                  Zustand → Postgres mirror + bootstrap
  auth/{session,totp,rate-limit}.ts
  db/client.ts                   Neon serverless wrapper + RLS withUser helper
  integrations/google-health/    OAuth + adapter + sync client
  insights.ts, prompts.ts, score.ts, recurrence.ts

src/store/index.ts               Zustand store — types/actions/persist/merge

public/sw.js                     Service worker — push + notificationclick
capacitor.config.ts              iOS shell — live-loads Vercel URL
ios/                             Xcode project (Capacitor v7, SPM)
db/schema.sql                    Postgres schema source of truth
vercel.json                      Cron schedule
```

---

## TODO / known deferrals

PWA:
- [ ] Goal progress bars (numeric targets auto-filled from related logs)
- [ ] Per-habit push reminders (schedule push per-habit at chosen times)
- [ ] Universal search bar (journal + goals + habits + meals)
- [ ] Smart Gemini suggestions (proactive 1-2 daily cards)
- [ ] Three-pillar tile row (Recovery / Strain / Sleep) under
      ReadinessHero with mini-trends
- [ ] Body weight inline-edit on `/body` history rows
- [ ] Hreflang / canonical / structured-data SEO pass (when time)

Body comp:
- [ ] Google Health body fat % → `body_composition_analyses`
      with `source='scale'` enum. Adapter currently pulls only weight.
- [ ] `daily_health_metrics` table for scale BF% history not tied to
      photos
- [ ] HMR2 + SMPL integration (blocked on user registering at
      smpl.is.tue.mpg.de — `bodycomp/pipeline/shape.py` is a stub)
- [ ] BodyScan PyTorch 1.2 → 2.x port (half-day; Navy formula covers
      the interim)

Native iOS:
- [ ] Live Activity for active workout (Dynamic Island + lock screen,
      Swift work, requires Capacitor build + Apple Developer ID)
- [ ] WidgetKit home-screen widget for daily readiness
- [ ] Apple Watch complication ($99 Developer Program needed for
      distribution)

Misc:
- [ ] Rotate leaked secrets (Neon password, GEMINI key, VAPID, etc)
- [ ] Vercel WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN must point at
      `life-os-carter.vercel.app` (not `localhost`) in prod env

---

## Standard commands

```bash
# life-os-carter
cd ~/Downloads/life-os-carter
npm run dev                  # localhost:3000
npm run typecheck            # tsc --noEmit — required before commits
git push                     # auto-deploys to Vercel

# Capacitor iOS
npx cap sync ios             # sync after plugin changes
npx cap open ios             # opens Xcode workspace

# life-os-bodycomp
cd ~/Downloads/life-os-bodycomp
uv run bodycomp              # start sidecar (live)
uv run bodycomp-test-one path/to.jpg --pretty   # standalone pipeline test
bash scripts/install-autostart.sh   # one-time launchd install
tail -f logs/bodycomp.out.log       # watch the daemon

# DB ops (Neon)
DATABASE_URL='...' node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  /* one-off SQL */
});
"
```

---

## Author / user context

- Git author for commits: **`wcarterbrady00@gmail.com`** (Carter Brady).
  Vercel rejects deploys signed with `carter@carolinacomfort.info` so
  always use the wcarterbrady00 address.
- User prefers: terse output, autonomy on small decisions, parallel
  work where possible, mobile-first / PWA-first design.
- Mental model the user has stated: "function like Whoop + RepCount,
  optimized for mobile web with iOS PWA install."
- Body comp focus: BF% trend tracking via daily front photos + monthly
  compilation video. Sleep tracked exclusively by Fitbit Air going
  forward — manual sleep entry surfaces removed.

---

## Don't do without asking

- Force-push, `git reset --hard`, `--no-verify` commits
- Schema-destructive operations on Neon (DROP TABLE, etc)
- Anything that costs money (paid Apple Developer, paid SaaS)
- Rotating env vars (user prefers to do this themselves so credentials
  don't traverse another chat)
