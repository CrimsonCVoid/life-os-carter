# Body Composition Sidecar Service — Handoff Doc

> **Audience:** another AI assistant or developer starting cold on this service. Read this alongside `docs/PROJECT-CONTEXT.md` from the main `life-os-carter` repo. This doc covers the *local* sidecar that enriches body progress photos with composition analysis. The Life OS PWA itself is documented elsewhere.

---

## 1. Identity

- **Repo:** `CrimsonCVoid/life-os-bodycomp` (to be created; separate from `life-os-carter`)
- **Owner / sole user:** Carter Brady (`carter@carolinacomfort.info`)
- **Type:** Local Python service that watches the Life OS Postgres for new body progress photos, runs a body composition analysis pipeline on each one, and writes results back. Runs on Carter's machine, not on Vercel, not in the Life OS process tree.
- **Current testing host:** MacBook Pro 14-inch, Apple M5, 24GB unified memory
- **Production host (planned):** Desktop with AMD Ryzen 7 7700X, 64GB DDR5, NVIDIA RTX 3060 12GB VRAM, Ubuntu or Windows + WSL2

---

## 2. Why this exists

Life OS's Overseer (Gemini 2.5 Flash) handles food photos, voice journal, briefings, patterns, weekly review. That stays untouched. Gemini will not reliably reason about shirtless progress photos (refusals, hedging, safety filters), and even if it did, Carter does not want those photos leaving his network.

So body composition gets its own pipeline. Strict scope:

- **In scope:** progress photos from `/body` route (front, side, back). Output is BF% estimate, pose keypoints, SMPL body shape parameters, silhouette segmentation, and natural-language commentary.
- **Out of scope:** food photos, voice, journal text, Overseer chat, weekly reviews. None of those are touched. The sidecar does not call any existing `/api/*` route. It only reads/writes its own tables.

---

## 3. Architecture overview

```
┌──────────────────────────┐         ┌────────────────────────────┐
│  Life OS (Vercel)        │         │  Sidecar (Carter's machine)│
│  Next.js 15 + React 19   │         │  Python 3.12 + asyncio     │
│                          │         │                            │
│  /body → uploads photo ──┼──blob──▶│  1. LISTEN on Postgres     │
│  inserts row in          │         │  2. Pull photo from Blob   │
│  body_progress_photos ───┼──notify▶│  3. Run analysis stack     │
│                          │         │  4. Write to               │
│  /body reads from        │◀────────│     body_composition_      │
│  body_composition_       │   row   │     analyses               │
│  analyses                │         │  5. Wait for next NOTIFY   │
└──────────────────────────┘         └────────────────────────────┘
        ▲                                       │
        │                                       │
        └────── Neon Postgres (shared) ─────────┘
                + Vercel Blob (photo storage)
```

The seam is Postgres. Vercel writes one table, the sidecar reads it and writes another. RLS uses `set_config('app.user_id', $1, true)` exactly like the main app. The sidecar is just another Postgres client running as Carter.

### Why this shape

- **No webhooks to Vercel.** Webhooks require a public-facing sidecar (tunneled or hosted), defeating the privacy goal.
- **No polling.** `LISTEN/NOTIFY` is real-time and zero-cost when idle.
- **No new auth.** The sidecar uses `DATABASE_URL` (server credential, same as main app) and `BLOB_READ_WRITE_TOKEN`. No user-facing auth surface.
- **Photos never traverse a public sidecar.** They go phone → Vercel Blob → Carter's machine via signed URL. No inbound listener.

---

## 4. The model stack (body comp specialized)

This is the layered approach: small specialists do measurement, one VLM does commentary.

### Specialist layer (the things that actually measure)

| Model | Role | Size | Why this one |
|---|---|---|---|
| **MediaPipe Pose Landmarker** (Google, MIT) | 33 3D keypoints | ~10MB | Fastest reliable pose. Posture, symmetry, longitudinal alignment. |
| **SAM 2** (Meta, Apache 2.0) | Silhouette segmentation | ~150MB (base) | Isolates body from background. Same silhouette across photos = honest comparison. |
| **HMR2.0 / 4D-Humans** (Berkeley, BSD-3) | SMPL body mesh recovery | ~500MB | Parametric body model. Gives shape parameters β (10-dim vector) that map cleanly to "leaner / fuller / wider" axes. The trend signal lives here. |
| **ShapedNet** (academic) OR **BodyScan** (`arvkr/BodyScan`) | Direct BF% regression | ~100MB | ShapedNet hits ~4.9% MAPE vs DXA but isn't pre-packaged. BodyScan is packaged and runs today using monocular depth + Navy formula. Recommendation: start with BodyScan, reproduce ShapedNet later if accuracy matters. |

All four together fit comfortably under 1GB on disk and well under 4GB of VRAM when loaded. The 3060's 12GB has massive headroom for these.

### Reasoner layer (the VLM)

**Qwen2.5-VL 7B** via Ollama (`ollama pull qwen2.5vl:7b`).

Why 7B:
- Runs at full 16-bit precision on the 3060 12GB (~14GB peak with KV cache → 4-bit if tight, ~6GB).
- On the M5 24GB, runs at 4-bit comfortably (~6GB).
- Identical HTTP API on both machines.
- Vision quality is strong enough to describe physique changes coherently when given the specialist outputs as structured context.

Why not bigger:
- 32B-class VLMs are tight on the 3060 even at 4-bit and don't add useful capability for "describe what changed between these two body photos."
- The VLM is the *reasoner*, not the measurer. Precision comes from the specialists.

Why Ollama and not MLX / vLLM / llama.cpp directly:
- **Identical HTTP API across M5 and the desktop.** Same code talks to both. The only env diff is `OLLAMA_HOST`.
- MLX-VLM would be ~30% faster on the M5 but requires rewriting inference when migrating to CUDA. Not worth it.
- vLLM is faster on CUDA but doesn't run on Apple Silicon, so you'd still need a second runtime for the M5 testing phase.

### Why not just use Gemini

Already covered. Two reasons: refusals on shirtless physique prompts, and Carter doesn't want those photos leaving his network. The architectural decision is final.

---

## 5. Database additions (changes to `life-os-carter/db/schema.sql`)

Two new tables. Both follow the existing RLS pattern (`user_id`, policy on `current_user_id()`).

```sql
-- Existing /body route presumably has a photos table; if not, add this:
CREATE TABLE IF NOT EXISTS body_progress_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blob_url      text NOT NULL,             -- Vercel Blob URL, users/{uid}/progress/...
  blob_pathname text NOT NULL,             -- relative path for signed-URL re-fetching
  angle         text NOT NULL CHECK (angle IN ('front', 'side', 'back')),
  captured_at   timestamptz NOT NULL,
  capture_meta  jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- shape: { weight_kg?, time_of_day?, fasted?, hydration_state?, lighting_notes? }
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_body_progress_photos_user_captured
  ON body_progress_photos(user_id, captured_at DESC);

ALTER TABLE body_progress_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY body_progress_photos_owner ON body_progress_photos
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- New: analysis results
CREATE TABLE IF NOT EXISTS body_composition_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id            uuid NOT NULL REFERENCES body_progress_photos(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  pose_keypoints      jsonb,            -- 33 landmarks: [{x, y, z, visibility}, ...]
  smpl_shape          jsonb,            -- {beta: [10 floats], pose: [...], cam: [...]}
  segmentation_url    text,             -- Vercel Blob URL of silhouette PNG (alpha mask)
  bf_estimate_pct     numeric(5,2),     -- e.g. 14.20
  bf_confidence_low   numeric(5,2),     -- e.g. 12.40
  bf_confidence_high  numeric(5,2),     -- e.g. 16.00
  measurements        jsonb,            -- {waist_cm, neck_cm, shoulder_cm, hip_cm, ...}
  vlm_commentary      text,             -- natural language description
  model_versions      jsonb NOT NULL,   -- {mediapipe, sam2, hmr2, bodyscan, qwen_vl}
  error_message       text,             -- populated when status='failed'
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id)                     -- one analysis per photo
);

CREATE INDEX idx_body_composition_user_processed
  ON body_composition_analyses(user_id, processed_at DESC);

ALTER TABLE body_composition_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY body_composition_analyses_owner ON body_composition_analyses
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- Trigger: NOTIFY sidecar on new progress photo
CREATE OR REPLACE FUNCTION notify_new_progress_photo() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('new_progress_photo', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS body_progress_photos_notify ON body_progress_photos;
CREATE TRIGGER body_progress_photos_notify
  AFTER INSERT ON body_progress_photos
  FOR EACH ROW EXECUTE FUNCTION notify_new_progress_photo();
```

### Type additions in `src/lib/types.ts`

```ts
export type BodyProgressPhoto = {
  id: string;
  userId: string;
  blobUrl: string;
  blobPathname: string;
  angle: 'front' | 'side' | 'back';
  capturedAt: string; // ISO
  captureMeta: {
    weightKg?: number;
    timeOfDay?: 'morning' | 'midday' | 'evening';
    fasted?: boolean;
    hydrationState?: 'low' | 'normal' | 'high';
    lightingNotes?: string;
  };
};

export type BodyCompositionAnalysis = {
  id: string;
  userId: string;
  photoId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  poseKeypoints: Array<{ x: number; y: number; z: number; visibility: number }> | null;
  smplShape: { beta: number[]; pose: number[]; cam: number[] } | null;
  segmentationUrl: string | null;
  bfEstimatePct: number | null;
  bfConfidenceLow: number | null;
  bfConfidenceHigh: number | null;
  measurements: Record<string, number> | null;
  vlmCommentary: string | null;
  modelVersions: Record<string, string>;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
};
```

---

## 6. Sidecar service layout

```
life-os-bodycomp/
├── pyproject.toml              uv-managed, Python 3.12
├── README.md
├── .env.example
├── src/
│   └── bodycomp/
│       ├── __init__.py
│       ├── __main__.py         entry point, asyncio main loop
│       ├── config.py           env loading, device detection (mps / cuda / cpu)
│       ├── db.py               asyncpg pool, LISTEN handler, RLS helper
│       ├── blob.py             pull photo via signed URL, push segmentation back
│       ├── pipeline/
│       │   ├── __init__.py
│       │   ├── pose.py         MediaPipe wrapper
│       │   ├── segment.py      SAM 2 wrapper
│       │   ├── shape.py        HMR2.0 / 4D-Humans SMPL recovery
│       │   ├── bodyfat.py      BodyScan / ShapedNet BF% regression
│       │   └── commentary.py   Ollama HTTP client for Qwen2.5-VL
│       ├── analyze.py          orchestrates pipeline/* for a single photo
│       └── trend.py            (later) week-over-week comparison logic
├── scripts/
│   ├── test_one.py             standalone: analyze one local image, print JSON
│   └── backfill.py             scan body_progress_photos, queue missing analyses
└── deploy/
    ├── launchd.bodycomp.plist  macOS service definition (M5 testing)
    └── bodycomp.service        systemd unit (desktop production)
```

### `db.py` LISTEN pattern (real-time, no polling)

```python
import asyncpg
import asyncio
import json

async def listen_loop(pool, on_photo):
    conn = await pool.acquire()
    await conn.add_listener('new_progress_photo', lambda *args: asyncio.create_task(on_photo(args[3])))
    # Also poll once at startup to catch anything missed while offline
    await catch_up(pool, on_photo)
    while True:
        await asyncio.sleep(3600)  # keepalive; listener fires via callback

async def with_user(conn, user_id, fn):
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.user_id', $1, true)", user_id)
        return await fn(conn)
```

The `catch_up` call at startup is important: if the sidecar was offline when photos came in, LISTEN won't replay them. Scan for `body_progress_photos` rows lacking a matching analysis row and process them in order.

### `analyze.py` flow per photo

```python
async def analyze_photo(photo_id: str):
    # 1. Mark processing
    # 2. Fetch row + signed Blob URL
    # 3. Download photo bytes
    # 4. Parallel: pose, segmentation
    # 5. Sequential: SMPL shape (uses pose), BF% (uses pose + silhouette)
    # 6. Build structured payload for VLM
    # 7. Call Ollama with image + structured context
    # 8. Upload silhouette to Blob under users/{uid}/progress/seg/{photo_id}.png
    # 9. Write body_composition_analyses row, status='complete'
    # On exception: status='failed', error_message set
```

---

## 7. Environment variables

```bash
# Database (same Neon DB as main app; use direct, non-pooled endpoint for LISTEN)
DATABASE_URL=postgres://...?sslmode=require    # ⚠️ direct connection, NOT pooler

# Vercel Blob (same token as main app)
BLOB_READ_WRITE_TOKEN=<from Vercel>

# Ollama
OLLAMA_HOST=http://localhost:11434             # same on M5 and desktop
OLLAMA_VLM_MODEL=qwen2.5vl:7b

# Compute
BODYCOMP_DEVICE=auto                           # auto | mps | cuda | cpu
BODYCOMP_MODEL_CACHE=~/.cache/bodycomp

# Behavior
BODYCOMP_LOG_LEVEL=info
BODYCOMP_BACKFILL_ON_START=true                # process any unanalyzed photos on boot
```

---

## 8. Cross-platform: M5 testing → desktop production

What changes when migrating: almost nothing.

| Layer | M5 (now) | Desktop (later) | Change required |
|---|---|---|---|
| Python | 3.12 via uv | 3.12 via uv | None |
| PyTorch device | `mps` | `cuda` | Set `BODYCOMP_DEVICE=cuda` |
| Ollama VLM | `qwen2.5vl:7b` (Metal) | `qwen2.5vl:7b` (CUDA) | None, same HTTP API |
| MediaPipe | CPU (fast enough) | CPU | None |
| SAM 2 | MPS | CUDA | Set in env |
| HMR2.0 | MPS | CUDA | Set in env |
| Service manager | `launchd` plist | `systemd` unit | Different deploy file, same binary |

The migration plan is: clone repo to desktop, install uv + deps, pull Ollama model, copy `.env` and flip device, drop `bodycomp.service` into `/etc/systemd/system/`, `systemctl enable --now bodycomp`. Should be under an hour end to end.

### Performance expectations

| Stage | M5 (mps, 4-bit VLM) | Desktop (3060, 16-bit VLM) |
|---|---|---|
| Pose + Segment + SMPL + BF | ~3-5 sec | ~1-2 sec |
| VLM commentary | ~8-12 sec | ~4-6 sec |
| **Total per photo** | ~15 sec | ~6 sec |

Both are fine. Carter uploads progress photos weekly at most. Latency does not matter; correctness does.

---

## 9. Conventions

1. **Strict Python typing.** `mypy --strict`. No untyped `dict` returns from pipeline modules. Use Pydantic models for cross-module payloads.
2. **No tests yet** (matches upstream Life OS convention). The verification path is: run `scripts/test_one.py` on a known photo, inspect JSON output, compare against a hand-graded reference.
3. **Model versions in every analysis row.** When you upgrade ShapedNet, BodyScan, or Qwen, write the new version string into `model_versions`. Historic analyses keep their original version. This matters for longitudinal comparisons.
4. **Capture conditions matter more than model accuracy.** The pipeline should refuse to compare two photos with significantly different lighting / pose / distance unless explicitly asked. Build a "capture consistency score" into the trend module.
5. **Silhouettes are stored as alpha masks**, not RGBA composites. Smaller, easier to overlay later. Path: `users/{uid}/progress/seg/{photo_id}.png`.
6. **The sidecar runs as `neondb_owner` for now** (same as main app). When the main app gets the `app_user` role split, the sidecar should get its own service role (`bodycomp_service`) with `INSERT/UPDATE` on `body_composition_analyses` only, no other table.

---

## 10. What's NOT done yet

In rough priority order:

1. **🔴 Bootstrap the repo.** `uv init`, dependency list, Ollama install instructions.
2. **🔴 Standalone test script.** `scripts/test_one.py` that takes a local image path, runs the full pipeline, prints JSON to stdout. No DB, no Blob. This is the first thing to build; everything else slots in around it.
3. **🔴 Schema migration in `life-os-carter`.** Apply section 5 to `db/schema.sql`. Idempotent. Run on Neon.
4. **🔴 `/body` UI changes in Life OS.** Render `BodyCompositionAnalysis` rows. Trend chart of `bfEstimatePct` over time. Latest commentary panel. Capture-conditions form on upload.
5. **🟡 Backfill script.** For existing progress photos uploaded before this service existed.
6. **🟡 Trend module.** Week-over-week comparison logic. Uses two-photo VLM prompts.
7. **🟡 systemd unit and launchd plist.** Auto-start on boot.
8. **🟢 ShapedNet reproduction.** If BodyScan accuracy is insufficient, reproduce ShapedNet from the paper (arXiv 2310.09709) for the ~4.9% MAPE accuracy. ~1-2 days of work.
9. **🟢 Capture consistency score.** Refuse comparisons across visibly different lighting / pose / distance.
10. **🟢 Role split.** Drop the sidecar to `bodycomp_service` role with minimum required permissions.

---

## 11. Mental model for an AI working here

- **The sidecar is a Postgres client, not a web service.** It does not listen on any port (other than potentially loopback for Ollama). It does not accept HTTP. All input comes through `LISTEN`. All output goes to a table.
- **The seam to Life OS is two tables.** `body_progress_photos` (read) and `body_composition_analyses` (write). Do not call Life OS API routes. Do not import Life OS code. The contract is the schema.
- **Specialists measure, the VLM narrates.** When in doubt, push more work onto the specialist models and feed structured data into the VLM. Don't ask the VLM "what's the BF%". Ask the specialist for the number, give the number to the VLM, ask it to describe what changed.
- **Privacy is the architectural priority.** Photos go through Vercel Blob (already trusted), Postgres (already trusted), and Carter's machine. They never traverse a third party for analysis. Gemini is never called with body photos. Ever.
- **The desktop is the production target.** Optimize for CUDA. The M5 is for development iteration speed, not final correctness.
- **`docs/PROJECT-CONTEXT.md` in `life-os-carter` is authoritative for anything that touches the main app.** This doc is authoritative for the sidecar.

---

## 12. How to start (first session)

```bash
# On the M5
mkdir ~/Downloads/life-os-bodycomp && cd ~/Downloads/life-os-bodycomp
git init
uv init --python 3.12
uv add asyncpg pydantic httpx pillow opencv-python mediapipe torch torchvision

# Install Ollama (one-time)
brew install ollama
ollama serve &                              # daemon
ollama pull qwen2.5vl:7b

# Build scripts/test_one.py first
# Run it against a test photo
# Inspect the JSON
# Then design the schema based on real output shape
# Then wrap in DB integration
```

The order in section 10 is the build order. Test script first, schema second, integration third, UI fourth. Resist the urge to design the schema before seeing real model outputs.
