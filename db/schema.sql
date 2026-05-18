-- ============================================================================
-- Life OS — Postgres schema (Neon-flavored)
-- ============================================================================
-- Single comprehensive schema. Safe to run on an empty database.
-- Designed to mirror src/lib/types.ts with one improvement: habit/routine
-- history is normalized into completion tables instead of inline JSON.
--
-- Conventions:
--   - snake_case columns (TS layer maps to camelCase)
--   - uuid PKs via gen_random_uuid()
--   - timestamptz everywhere (always UTC at rest)
--   - date type for "YYYY-MM-DD" — never store dates as text
--   - JSONB only where the shape is genuinely variable (settings, sleep stages)
--   - RLS enabled on every user-scoped table; policies use current_setting('app.user_id')
--
-- Auth assumption: app middleware authenticates the request and sets
--   `SET LOCAL app.user_id = '<uuid>'`
-- per transaction. This works with Clerk, NextAuth, custom magic-link, etc.
-- ============================================================================

-- ---------- extensions ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;    -- case-insensitive email

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  display_name  text,
  image_url     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE user_settings (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  units          jsonb NOT NULL DEFAULT '{"weight":"lb","liquid":"oz"}'::jsonb,
  accent         text  NOT NULL DEFAULT 'violet'
    CHECK (accent IN ('violet','emerald','rose','amber')),
  day_type_presets       text[] NOT NULL DEFAULT ARRAY[
    'Pull Day','Push Day','Leg Day','Rest Day','Recovery','Deep Work','Travel'
  ],
  has_onboarded          boolean NOT NULL DEFAULT false,
  water_target_oz        integer NOT NULL DEFAULT 64,
  habit_templates        jsonb   NOT NULL DEFAULT '[]'::jsonb,
  show_recurring_icon    boolean NOT NULL DEFAULT true,
  show_nutrition_on_today boolean NOT NULL DEFAULT true,
  nutrition              jsonb   NOT NULL DEFAULT '{"enabled":false}'::jsonb,
  morning_routine        jsonb   NOT NULL DEFAULT '{"showOnTodayScreen":true,"autoCollapseWhenDone":true,"showStreak":true}'::jsonb,
  evening_routine        jsonb   NOT NULL DEFAULT '{"showOnTodayScreen":true,"autoCollapseWhenDone":true,"showStreak":true}'::jsonb,
  routine_seeded         boolean NOT NULL DEFAULT false,
  evening_routine_seeded boolean NOT NULL DEFAULT false,
  voice_journal          jsonb   NOT NULL DEFAULT '{"saveRecordings":false,"autoCheckTodos":true,"autoLogMood":true}'::jsonb,
  photo_food             jsonb   NOT NULL DEFAULT '{"saveMealPhotos":true,"autoFillName":true,"seenTooltip":false}'::jsonb,
  insights               jsonb   NOT NULL DEFAULT '{"enabled":true,"frequency":"daily"}'::jsonb,
  weekly_review          jsonb   NOT NULL DEFAULT '{"enabled":true,"triggerDay":0,"triggerHour":19}'::jsonb,
  day_navigation         jsonb   NOT NULL DEFAULT '{"daysBack":30,"daysForward":7,"swipeEnabled":true}'::jsonb,
  morning_briefing       jsonb,  -- {date, text} cached
  evening_summary        jsonb,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ---------- SERVER-ONLY: OAuth tokens (Google Health) ----------
-- RLS denies all access. Only superuser / app server connection (bypassing RLS) reads this.
CREATE TABLE user_tokens (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_access_token  text,
  google_refresh_token text,
  google_expires_at    timestamptz,
  google_scope         text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER user_tokens_updated_at BEFORE UPDATE ON user_tokens
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================================
-- PASSKEY (WebAuthn) AUTH
-- ============================================================================
-- One credential row per registered device. A user may have many (laptop +
-- phone + yubikey). credential_id is the public credential identifier from
-- the authenticator; public_key is COSE-encoded.

CREATE TABLE passkey_credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id       text NOT NULL UNIQUE,   -- base64url-encoded
  public_key          bytea NOT NULL,         -- COSE key
  counter             bigint NOT NULL DEFAULT 0,
  transports          text[] NOT NULL DEFAULT '{}',  -- e.g. ['internal','hybrid']
  device_name         text,                   -- user-set label e.g. "MacBook Touch ID"
  device_type         text,                   -- 'singleDevice' | 'multiDevice'
  backed_up           boolean NOT NULL DEFAULT false,
  aaguid              uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz
);
CREATE INDEX passkey_credentials_user_idx ON passkey_credentials(user_id, created_at DESC);

-- Short-lived per-attempt challenges. Rows live ~5min then a cleanup job
-- (or lazy-on-write) deletes expired ones.
CREATE TABLE webauthn_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,  -- nullable: login flow doesn't know user yet
  challenge    text NOT NULL,                 -- base64url
  kind         text NOT NULL CHECK (kind IN ('register','login')),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webauthn_challenges_challenge_idx ON webauthn_challenges(challenge);
CREATE INDEX webauthn_challenges_expires_idx   ON webauthn_challenges(expires_at);

-- Sessions: server-issued opaque cookie ID. Validated on every request.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx    ON sessions(user_id, last_seen_at DESC);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- ============================================================================
-- DAILY DATA
-- ============================================================================

CREATE TABLE days (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         date NOT NULL,
  day_type     text,
  score_cache  numeric(5,2),
  reminder     text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE TRIGGER days_updated_at BEFORE UPDATE ON days
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE health_logs (
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                     date NOT NULL,
  sleep_hours              numeric(4,2) CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  sleep_quality            integer      CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 10),
  wake_time                text         CHECK (wake_time IS NULL OR wake_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  sleep_stages             jsonb,  -- {lightMin, deepMin, remMin, wakeMin}
  mood                     integer      CHECK (mood IS NULL OR mood BETWEEN 1 AND 10),
  energy_legacy            integer      CHECK (energy_legacy IS NULL OR energy_legacy BETWEEN 1 AND 10),
  water_oz                 numeric(6,2) CHECK (water_oz IS NULL OR water_oz >= 0),
  weight_lb                numeric(6,2) CHECK (weight_lb IS NULL OR weight_lb >= 0),
  steps                    integer      CHECK (steps IS NULL OR steps >= 0),
  resting_heart_rate       integer      CHECK (resting_heart_rate IS NULL OR resting_heart_rate BETWEEN 20 AND 220),
  heart_rate_variability   integer      CHECK (heart_rate_variability IS NULL OR heart_rate_variability >= 0),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE TRIGGER health_logs_updated_at BEFORE UPDATE ON health_logs
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE energy_logs (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  -- {morning:7, midday:5, afternoon:6, evening:8}
  values      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE TRIGGER energy_logs_updated_at BEFORE UPDATE ON energy_logs
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================================
-- GOALS + RECURRING GOALS
-- ============================================================================

CREATE TABLE recurring_goals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text               text NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  emoji              text,
  priority           text NOT NULL CHECK (priority IN ('P1','P2','P3')),
  category           text,
  time_estimate_min  integer CHECK (time_estimate_min IS NULL OR time_estimate_min >= 0),
  pattern            text NOT NULL CHECK (pattern IN (
    'daily','weekdays','weekends','weekly','weekly_count','biweekly','monthly','custom'
  )),
  days_of_week       integer[] CHECK (
    days_of_week IS NULL
    OR (array_length(days_of_week,1) BETWEEN 1 AND 7
        AND days_of_week <@ ARRAY[0,1,2,3,4,5,6])
  ),
  day_of_month       integer CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  monthly_last_day   boolean NOT NULL DEFAULT false,
  interval_days      integer CHECK (interval_days IS NULL OR interval_days >= 1),
  weekly_times       integer CHECK (weekly_times IS NULL OR weekly_times >= 1),
  start_date         date NOT NULL,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER recurring_goals_updated_at BEFORE UPDATE ON recurring_goals
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE goals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date               date NOT NULL,
  text               text NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  completed          boolean NOT NULL DEFAULT false,
  priority           text NOT NULL CHECK (priority IN ('P1','P2','P3')),
  emoji              text,
  category           text,
  time_estimate_min  integer CHECK (time_estimate_min IS NULL OR time_estimate_min >= 0),
  "order"            integer NOT NULL DEFAULT 0,
  recurring_goal_id  uuid REFERENCES recurring_goals(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE recurring_goal_generations (
  recurring_goal_id  uuid NOT NULL REFERENCES recurring_goals(id) ON DELETE CASCADE,
  date               date NOT NULL,
  generated_goal_id  uuid REFERENCES goals(id) ON DELETE SET NULL,
  status             text NOT NULL CHECK (status IN ('generated','skipped')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recurring_goal_id, date)
);

-- ============================================================================
-- HABITS + ROUTINES (normalized: completions are their own table)
-- ============================================================================

CREATE TABLE habits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  icon         text NOT NULL CHECK (icon IN (
    'book','brain','moon','droplet','footprints','sun','pen','dumbbell',
    'wind','no-phone','leaf','snowflake','heart','target'
  )),
  target       integer NOT NULL DEFAULT 1 CHECK (target >= 1),
  "order"      integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER habits_updated_at BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE habit_completions (
  habit_id      uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- denormalized for RLS speed
  date          date NOT NULL,
  completed     boolean NOT NULL DEFAULT true,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE morning_routine_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text NOT NULL DEFAULT '',
  "order"     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE morning_routine_completions (
  item_id       uuid NOT NULL REFERENCES morning_routine_items(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  completed     boolean NOT NULL DEFAULT true,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, date)
);

CREATE TABLE evening_routine_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text NOT NULL DEFAULT '',
  "order"     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evening_routine_completions (
  item_id       uuid NOT NULL REFERENCES evening_routine_items(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  completed     boolean NOT NULL DEFAULT true,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, date)
);

-- ============================================================================
-- GYM
-- ============================================================================

CREATE TABLE workouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date NOT NULL,
  type          text NOT NULL,  -- open string (Push/Pull/Legs/Yoga/custom)
  duration_min  integer NOT NULL CHECK (duration_min >= 0),
  intensity     integer NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workout_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id  uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sets        integer NOT NULL CHECK (sets >= 0),
  reps        integer NOT NULL CHECK (reps >= 0),
  weight      numeric(6,2),
  "order"     integer NOT NULL DEFAULT 0
);

CREATE TABLE lift_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  raw         text,  -- original paste text for re-edit/debug
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lift_exercises (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES lift_sessions(id) ON DELETE CASCADE,
  name             text NOT NULL,
  normalized_name  text NOT NULL,  -- lowercased+trimmed for cross-session matching
  "order"          integer NOT NULL DEFAULT 0
);

CREATE TABLE lift_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id  uuid NOT NULL REFERENCES lift_exercises(id) ON DELETE CASCADE,
  weight       numeric(6,2) NOT NULL DEFAULT 0,  -- 0 = bodyweight
  reps         integer NOT NULL CHECK (reps >= 0),
  "order"      integer NOT NULL DEFAULT 0
);

-- ============================================================================
-- NUTRITION
-- ============================================================================
-- saved_meals first so meals.saved_meal_id FK is declarable inline.

CREATE TABLE saved_meals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  calories    numeric(7,2) NOT NULL DEFAULT 0,
  protein     numeric(6,2) NOT NULL DEFAULT 0,
  carbs       numeric(6,2),
  fat         numeric(6,2),
  use_count   integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                date NOT NULL,
  time                text NOT NULL CHECK (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  name                text,
  calories            numeric(7,2) NOT NULL DEFAULT 0,
  protein             numeric(6,2) NOT NULL DEFAULT 0,
  carbs               numeric(6,2),
  fat                 numeric(6,2),
  saved_meal_id       uuid REFERENCES saved_meals(id) ON DELETE SET NULL,
  -- Photo flow: storage path (S3 / R2 / Vercel Blob) + tiny base64 thumb for instant render
  photo_storage_path  text,
  thumbnail_data_url  text,
  ai_analysis         jsonb,  -- {overallConfidence, identifiedItems, notes}
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- JOURNAL
-- ============================================================================

CREATE TABLE journal_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  mood                 integer CHECK (mood IS NULL OR mood BETWEEN 1 AND 10),
  energy               integer CHECK (energy IS NULL OR energy BETWEEN 1 AND 10),
  text                 text NOT NULL CHECK (length(text) <= 50000),
  tags                 text[] NOT NULL DEFAULT '{}',
  source               text NOT NULL CHECK (source IN (
    'manual','reflection','overseer','voice','weekly-review'
  )),
  summary              text,
  mood_word            text,
  audio_storage_path   text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- TIME BLOCKING
-- ============================================================================

CREATE TABLE blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  start_min   integer NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min     integer NOT NULL CHECK (end_min   BETWEEN 1 AND 1440),
  type        text NOT NULL CHECK (type IN (
    'goal','workout','meal','focus','meeting','rest','other'
  )),
  title       text NOT NULL,
  icon        text,
  notes       text,
  goal_id     uuid REFERENCES goals(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_min > start_min)
);

-- ============================================================================
-- BODY
-- ============================================================================

CREATE TABLE body_measurements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  weight_lb            numeric(6,2),
  chest_in             numeric(5,2),
  waist_in             numeric(5,2),
  hips_in              numeric(5,2),
  bicep_in             numeric(5,2),
  thigh_in             numeric(5,2),
  body_fat_pct         numeric(4,2) CHECK (body_fat_pct IS NULL OR body_fat_pct BETWEEN 0 AND 100),
  notes                text,
  photo_storage_path   text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Progress photos. Originally `progress_photos`; renamed `body_progress_photos`
-- to disambiguate from "progress" in the general goal-tracking sense and to
-- match the body-composition sidecar's table name. See docs/BODYCOMP-CONTEXT.md.
CREATE TABLE body_progress_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Full Vercel Blob URL (public-but-unguessable). The sidecar fetches this directly.
  blob_url        text NOT NULL,
  -- Relative path under users/{uid}/progress/... kept separately so we can re-sign
  -- or migrate buckets without rewriting URLs in this table.
  blob_pathname   text NOT NULL,
  angle           text NOT NULL CHECK (angle IN ('front','side','back')),
  captured_at     timestamptz NOT NULL,
  -- Capture conditions matter more than model accuracy for honest trends.
  -- Shape: { weight_kg?, time_of_day?, fasted?, hydration_state?, lighting_notes? }
  capture_meta    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Body composition analyses written by the life-os-bodycomp sidecar.
-- One row per photo (UNIQUE photo_id). Lifecycle: pending → processing → complete | failed.
CREATE TABLE body_composition_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id            uuid NOT NULL REFERENCES body_progress_photos(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','complete','failed')),
  pose_keypoints      jsonb,            -- 33 MediaPipe landmarks
  smpl_shape          jsonb,            -- {beta: [10 floats], pose, cam}
  segmentation_url    text,             -- Vercel Blob URL of silhouette alpha mask
  bf_estimate_pct     numeric(5,2) CHECK (bf_estimate_pct IS NULL OR bf_estimate_pct BETWEEN 0 AND 100),
  bf_confidence_low   numeric(5,2) CHECK (bf_confidence_low IS NULL OR bf_confidence_low BETWEEN 0 AND 100),
  bf_confidence_high  numeric(5,2) CHECK (bf_confidence_high IS NULL OR bf_confidence_high BETWEEN 0 AND 100),
  measurements        jsonb,            -- {waist_cm, neck_cm, shoulder_cm, hip_cm, ...}
  vlm_commentary      text,
  -- {mediapipe, sam2, hmr2, bodyscan, qwen_vl} — frozen at write time so longitudinal
  -- comparisons know which model generated each row.
  model_versions      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message       text,
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id)
);

-- pg_notify the bodycomp sidecar on every new progress photo. The sidecar
-- LISTENs on `new_progress_photo` and pulls the row by id. No webhooks, no
-- polling. If the sidecar is offline, its startup catch_up() finds rows
-- without a complete analysis and processes them in order.
CREATE OR REPLACE FUNCTION notify_new_progress_photo() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('new_progress_photo', NEW.id::text);
  RETURN NEW;
END $$;

CREATE TRIGGER body_progress_photos_notify
  AFTER INSERT ON body_progress_photos
  FOR EACH ROW EXECUTE FUNCTION notify_new_progress_photo();

-- ============================================================================
-- INSIGHTS, WEEKLY REVIEW, BRIEFINGS
-- ============================================================================

CREATE TABLE insights_cache (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date           date NOT NULL,
  patterns       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- PatternInsight[]
  current_index  integer NOT NULL DEFAULT 0 CHECK (current_index >= 0),
  generated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE dismissed_patterns (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint    text NOT NULL,
  headline       text NOT NULL,
  dismissed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fingerprint)
);

CREATE TABLE weekly_reviews (
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start             date NOT NULL,  -- Sunday
  week_end               date NOT NULL,
  summary                text NOT NULL,
  wins                   text[] NOT NULL DEFAULT '{}',
  struggles              text[] NOT NULL DEFAULT '{}',
  trends                 text[] NOT NULL DEFAULT '{}',
  next_week_priorities   text[] NOT NULL DEFAULT '{}',
  dismissed              boolean NOT NULL DEFAULT false,
  saved_to_journal       boolean NOT NULL DEFAULT false,
  generated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

-- ============================================================================
-- GOOGLE HEALTH INTEGRATION (client-visible state, NOT tokens)
-- ============================================================================

CREATE TABLE google_health_state (
  user_id                     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  connected                   boolean NOT NULL DEFAULT false,
  email                       citext,
  needs_reconnect             boolean NOT NULL DEFAULT false,
  is_syncing                  boolean NOT NULL DEFAULT false,
  has_completed_initial_sync  boolean NOT NULL DEFAULT false,
  last_sync_at                timestamptz,
  last_sync_error             text,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER google_health_state_updated_at BEFORE UPDATE ON google_health_state
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Per-metric provenance: which value came from sync vs manual edit.
-- Lets the UI render the 🔗 icon and decides whether next sync overwrites.
CREATE TABLE google_health_sources (
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  metric               text NOT NULL CHECK (metric IN (
    'sleep','steps','weight','restingHeartRate','heartRateVariability'
  )),
  synced_at            timestamptz,
  manual_override_at   timestamptz,
  PRIMARY KEY (user_id, date, metric)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- PKs and UNIQUEs index automatically. These cover hot query paths.

-- Today screen: goals for a date in display order
CREATE INDEX goals_user_date_order_idx ON goals(user_id, date, "order");
CREATE INDEX goals_user_recurring_idx  ON goals(user_id, recurring_goal_id) WHERE recurring_goal_id IS NOT NULL;
CREATE INDEX goals_user_completed_idx  ON goals(user_id, completed, date DESC);

-- Active recurring goals list
CREATE INDEX recurring_goals_user_active_idx ON recurring_goals(user_id, active, created_at DESC);

-- Habit completions: per-habit history + per-user-date for streak math
CREATE INDEX habit_completions_user_date_idx ON habit_completions(user_id, date);
CREATE INDEX morning_routine_completions_user_date_idx ON morning_routine_completions(user_id, date);
CREATE INDEX evening_routine_completions_user_date_idx ON evening_routine_completions(user_id, date);

-- Habits/routines: ordered list per user
CREATE INDEX habits_user_order_idx                 ON habits(user_id, "order", created_at);
CREATE INDEX morning_routine_items_user_order_idx  ON morning_routine_items(user_id, "order");
CREATE INDEX evening_routine_items_user_order_idx  ON evening_routine_items(user_id, "order");

-- Gym
CREATE INDEX workouts_user_date_idx       ON workouts(user_id, date DESC, created_at DESC);
CREATE INDEX lift_sessions_user_date_idx  ON lift_sessions(user_id, date DESC, created_at DESC);
CREATE INDEX lift_exercises_normalized_idx ON lift_exercises(normalized_name);

-- Nutrition: meals for a date in chronological order
CREATE INDEX meals_user_date_time_idx     ON meals(user_id, date, time);
CREATE INDEX saved_meals_user_use_idx     ON saved_meals(user_id, use_count DESC, name);

-- Journal feed
CREATE INDEX journal_entries_user_date_idx        ON journal_entries(user_id, date DESC, created_at DESC);
CREATE INDEX journal_entries_user_source_idx      ON journal_entries(user_id, source, created_at DESC);
CREATE INDEX journal_entries_tags_gin_idx         ON journal_entries USING GIN (tags);

-- Time blocking
CREATE INDEX blocks_user_date_start_idx ON blocks(user_id, date, start_min);

-- Body
CREATE INDEX body_measurements_user_date_idx ON body_measurements(user_id, date DESC);
CREATE INDEX body_progress_photos_user_captured_idx
  ON body_progress_photos(user_id, captured_at DESC);
CREATE INDEX body_progress_photos_user_angle_captured_idx
  ON body_progress_photos(user_id, angle, captured_at DESC);
CREATE INDEX body_composition_user_processed_idx
  ON body_composition_analyses(user_id, processed_at DESC);
CREATE INDEX body_composition_status_idx
  ON body_composition_analyses(status) WHERE status IN ('pending','processing','failed');

-- Insights & reviews
CREATE INDEX dismissed_patterns_user_idx ON dismissed_patterns(user_id, dismissed_at DESC);
CREATE INDEX weekly_reviews_user_idx     ON weekly_reviews(user_id, week_start DESC);

-- Google Health
CREATE INDEX google_health_sources_user_date_idx ON google_health_sources(user_id, date);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- App must run `SET LOCAL app.user_id = '<uuid>'` per transaction after auth.
-- The current_user_id() helper reads it and policies enforce equality.

ALTER TABLE users                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens                    ENABLE ROW LEVEL SECURITY;  -- denied entirely; only server bypasses RLS
ALTER TABLE passkey_credentials            ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_challenges            ENABLE ROW LEVEL SECURITY;  -- denied entirely; server-only
ALTER TABLE sessions                       ENABLE ROW LEVEL SECURITY;  -- denied entirely; server-only
ALTER TABLE days                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_goals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_goal_generations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_routine_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_routine_completions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evening_routine_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evening_routine_completions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lift_sessions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lift_exercises                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lift_sets                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_meals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_progress_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition_analyses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights_cache                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissed_patterns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_health_state            ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_health_sources          ENABLE ROW LEVEL SECURITY;

-- users: a user can only see/update themselves
CREATE POLICY users_self ON users USING (id = current_user_id()) WITH CHECK (id = current_user_id());

-- user_tokens: client never reads or writes; only the server connection (which bypasses RLS) does.
CREATE POLICY user_tokens_deny_all       ON user_tokens       USING (false) WITH CHECK (false);

-- Auth tables: pure server-side. Clients never query directly via RLS-subject role.
CREATE POLICY webauthn_challenges_deny   ON webauthn_challenges USING (false) WITH CHECK (false);
CREATE POLICY sessions_deny              ON sessions            USING (false) WITH CHECK (false);

-- Cloud sync: the Zustand→Postgres mirror lives here. One row per user, full
-- life-os:v2 blob. Per-slice queryable data lives in its dedicated table
-- (goals, meals, body_progress_photos, etc.); this snapshot is the
-- backup-and-multi-device-sync layer. See src/lib/cloud-sync.ts.
CREATE TABLE IF NOT EXISTS user_state_snapshots (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_ver  integer NOT NULL DEFAULT 2,
  state       jsonb   NOT NULL,
  bytes       integer NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_state_snapshots_updated_idx
  ON user_state_snapshots(updated_at DESC);
ALTER TABLE user_state_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_state_snapshots_owner ON user_state_snapshots
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- Passkey credentials: an authenticated user can list/manage their own passkeys.
CREATE POLICY passkey_credentials_owner  ON passkey_credentials
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- All other user-scoped tables: same shape. The pattern repeats, so we use a DO block.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'user_settings','days','health_logs','energy_logs',
    'goals','recurring_goals','habits','habit_completions',
    'morning_routine_items','morning_routine_completions',
    'evening_routine_items','evening_routine_completions',
    'workouts','lift_sessions',
    'meals','saved_meals','journal_entries','blocks',
    'body_measurements','body_progress_photos','body_composition_analyses',
    'insights_cache','dismissed_patterns','weekly_reviews',
    'google_health_state','google_health_sources'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I_owner ON %I USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id())',
      t, t
    );
  END LOOP;
END $$;

-- Tables that don't have user_id directly — gate via parent FK.
CREATE POLICY recurring_goal_generations_owner ON recurring_goal_generations
  USING (EXISTS (SELECT 1 FROM recurring_goals rg WHERE rg.id = recurring_goal_id AND rg.user_id = current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM recurring_goals rg WHERE rg.id = recurring_goal_id AND rg.user_id = current_user_id()));

CREATE POLICY workout_exercises_owner ON workout_exercises
  USING (EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = current_user_id()));

CREATE POLICY lift_exercises_owner ON lift_exercises
  USING (EXISTS (SELECT 1 FROM lift_sessions s WHERE s.id = session_id AND s.user_id = current_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM lift_sessions s WHERE s.id = session_id AND s.user_id = current_user_id()));

CREATE POLICY lift_sets_owner ON lift_sets
  USING (EXISTS (
    SELECT 1 FROM lift_exercises e JOIN lift_sessions s ON s.id = e.session_id
    WHERE e.id = exercise_id AND s.user_id = current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lift_exercises e JOIN lift_sessions s ON s.id = e.session_id
    WHERE e.id = exercise_id AND s.user_id = current_user_id()
  ));

-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Single-user app: pre-create Carter Brady so the first passkey registration
-- attaches to an existing user. Idempotent.

INSERT INTO users (id, email, display_name)
VALUES (
  '00000000-0000-4000-8000-000000000001',  -- fixed UUID; safe to reference in dev
  'carter@carolinacomfort.info',
  'Carter Brady'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_settings (user_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- USAGE NOTES (read me before connecting from app code)
-- ============================================================================
--
-- 1. Connection
--    Use the @neondatabase/serverless driver for Edge runtimes,
--    or `postgres` / `pg` for Node API routes. Connection string lives in
--    .env.local as DATABASE_URL.
--
-- 2. Setting the session user (REQUIRED for RLS to work)
--    Every request that hits the DB must, inside a single transaction:
--      BEGIN;
--      SET LOCAL app.user_id = '<authenticated uuid>';
--      -- queries...
--      COMMIT;
--    With Drizzle: `db.transaction(async (tx) => { await tx.execute(sql`SET LOCAL app.user_id = ${uid}`); ... })`
--
-- 3. Bypassing RLS for admin work
--    The role that connects via DATABASE_URL is `neondb_owner`, which OWNS
--    the tables and so BYPASSES RLS. For production, create a second role
--    `app_user` that is granted SELECT/INSERT/UPDATE/DELETE but does NOT own
--    the tables — that role is subject to RLS. Use `app_user` from the app,
--    `neondb_owner` only for migrations.
--
--    Example:
--      CREATE ROLE app_user LOGIN PASSWORD '<rotate>';
--      GRANT USAGE ON SCHEMA public TO app_user;
--      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--      ALTER DEFAULT PRIVILEGES IN SCHEMA public
--        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--
-- 4. Migration story
--    This file is the *initial* schema. Future changes should be additive
--    migrations under db/migrations/0002_*.sql etc. Recommend Drizzle Kit
--    or node-pg-migrate to manage them.
--
-- 5. Local development
--    Neon supports branching. Create a `dev` branch off `main` for testing,
--    keep `main` clean for production data.
--
-- ============================================================================
