/**
 * Workout heart-rate fetchers — pulls HR samples, active calories, and
 * Fitbit-detected exercise sessions for a given time window.
 *
 * Lives alongside adapter.ts but split out because the workout flow is its
 * own surface (per-session series, not per-day rollups). If Google changes
 * field names pre-GA, patch here without touching adapter.ts.
 */

import { GOOGLE_HEALTH_BASE_URL } from "./config";
import type { HRSample, WorkoutHRSeries, ZoneMinutes } from "@/lib/types";

const HR_DATA_TYPE = "heart-rate";
const HR_FILTER_KEY = "heart_rate";
const CAL_DATA_TYPE = "active-calories-burned";
const CAL_FILTER_KEY = "active_calories_burned";
const SESSION_DATA_TYPE = "exercise-session";
const SESSION_FILTER_KEY = "exercise_session";

type ListResponse<T> = {
  dataPoints?: T[];
  nextPageToken?: string;
};

async function callGoogle<T>(
  url: string,
  accessToken: string
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.error(
        `Google Health ${res.status} on ${url}: ${await res.text()}`
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error("Google Health fetch failed", url, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// HEART RATE SAMPLES
// ---------------------------------------------------------------------------

type RawHrDataPoint = {
  heartRate?: {
    civilTime?: string;
    startTime?: string;
    bpm?: number;
    beatsPerMinute?: number;
    value?: { bpm?: number; beatsPerMinute?: number };
  };
};

function readHrBpm(p: RawHrDataPoint): number | undefined {
  const h = p.heartRate;
  if (!h) return undefined;
  const candidate =
    h.bpm ?? h.beatsPerMinute ?? h.value?.bpm ?? h.value?.beatsPerMinute;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

function readHrAt(p: RawHrDataPoint): string | undefined {
  return p.heartRate?.civilTime ?? p.heartRate?.startTime;
}

export async function fetchHeartRateSeries(opts: {
  accessToken: string;
  startTime: string;
  endTime: string;
}): Promise<HRSample[]> {
  const params = new URLSearchParams({
    filter: `${HR_FILTER_KEY}.civil_time >= "${opts.startTime}" AND ${HR_FILTER_KEY}.civil_time <= "${opts.endTime}"`,
    pageSize: "1000",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${HR_DATA_TYPE}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawHrDataPoint>>(
    url,
    opts.accessToken
  );
  if (!res) return [];
  const samples: HRSample[] = [];
  for (const p of res.dataPoints ?? []) {
    const at = readHrAt(p);
    const bpm = readHrBpm(p);
    if (!at || bpm == null) continue;
    samples.push({ at, bpm: Math.round(bpm) });
  }
  samples.sort((a, b) => a.at.localeCompare(b.at));
  return samples;
}

// ---------------------------------------------------------------------------
// ACTIVE CALORIES
// ---------------------------------------------------------------------------

type RawCaloriesDataPoint = {
  activeCaloriesBurned?: {
    civilTime?: string;
    startTime?: string;
    kilocalories?: number;
    kcal?: number;
    energy?: { kilocalories?: number; kcal?: number };
  };
};

function readKcal(p: RawCaloriesDataPoint): number | undefined {
  const a = p.activeCaloriesBurned;
  if (!a) return undefined;
  const candidate =
    a.kilocalories ?? a.kcal ?? a.energy?.kilocalories ?? a.energy?.kcal;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : undefined;
}

export async function fetchActiveCalories(opts: {
  accessToken: string;
  startTime: string;
  endTime: string;
}): Promise<number> {
  const params = new URLSearchParams({
    filter: `${CAL_FILTER_KEY}.civil_time >= "${opts.startTime}" AND ${CAL_FILTER_KEY}.civil_time <= "${opts.endTime}"`,
    pageSize: "500",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${CAL_DATA_TYPE}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawCaloriesDataPoint>>(
    url,
    opts.accessToken
  );
  if (!res) return 0;
  let total = 0;
  for (const p of res.dataPoints ?? []) {
    const k = readKcal(p);
    if (k != null) total += k;
  }
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// EXERCISE SESSIONS (Fitbit-detected workouts)
// ---------------------------------------------------------------------------

export type DetectedSession = {
  startTime: string;
  endTime: string;
  activityType?: string;
  caloriesBurned?: number;
  source?: string;
};

type RawSessionDataPoint = {
  exerciseSession?: {
    interval?: {
      startTime?: string;
      endTime?: string;
      civilStartTime?: string;
      civilEndTime?: string;
    };
    activityType?: string;
    exerciseType?: string;
    type?: string;
    caloriesBurned?: number;
    kilocalories?: number;
    energy?: { kilocalories?: number; kcal?: number };
  };
  origin?: { applicationName?: string; deviceModel?: string };
  source?: { name?: string };
};

function readSessionCalories(p: RawSessionDataPoint): number | undefined {
  const s = p.exerciseSession;
  if (!s) return undefined;
  const candidate =
    s.caloriesBurned ??
    s.kilocalories ??
    s.energy?.kilocalories ??
    s.energy?.kcal;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? Math.round(candidate)
    : undefined;
}

function readSessionSource(p: RawSessionDataPoint): string | undefined {
  return (
    p.origin?.applicationName ??
    p.origin?.deviceModel ??
    p.source?.name ??
    undefined
  );
}

export async function fetchExerciseSessions(opts: {
  accessToken: string;
  startTime: string;
  endTime: string;
}): Promise<DetectedSession[]> {
  const params = new URLSearchParams({
    filter: `${SESSION_FILTER_KEY}.civil_time >= "${opts.startTime}" AND ${SESSION_FILTER_KEY}.civil_time <= "${opts.endTime}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${SESSION_DATA_TYPE}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawSessionDataPoint>>(
    url,
    opts.accessToken
  );
  if (!res) return [];
  const out: DetectedSession[] = [];
  for (const p of res.dataPoints ?? []) {
    const interval = p.exerciseSession?.interval;
    const start = interval?.civilStartTime ?? interval?.startTime;
    const end = interval?.civilEndTime ?? interval?.endTime;
    if (!start || !end) continue;
    const session: DetectedSession = { startTime: start, endTime: end };
    const activity =
      p.exerciseSession?.activityType ??
      p.exerciseSession?.exerciseType ??
      p.exerciseSession?.type;
    if (activity) session.activityType = activity;
    const cal = readSessionCalories(p);
    if (cal != null) session.caloriesBurned = cal;
    const src = readSessionSource(p);
    if (src) session.source = src;
    out.push(session);
  }
  out.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return out;
}

// ---------------------------------------------------------------------------
// ZONE MINUTES + SERIES BUILDER
// ---------------------------------------------------------------------------

const DEFAULT_AGE = 30;

function zoneFor(bpm: number, maxHr: number): keyof ZoneMinutes | null {
  const pct = bpm / maxHr;
  if (pct < 0.5) return null;
  if (pct < 0.6) return "zone1";
  if (pct < 0.7) return "zone2";
  if (pct < 0.8) return "zone3";
  if (pct < 0.9) return "zone4";
  return "zone5";
}

export function computeZoneMinutes(
  samples: HRSample[],
  maxHr: number
): ZoneMinutes {
  // Assumption: samples arrive roughly once per second. Each sample
  // contributes 1s to its zone bucket; we convert to minutes at the end.
  const seconds: ZoneMinutes = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
  };
  for (const s of samples) {
    const z = zoneFor(s.bpm, maxHr);
    if (z) seconds[z] += 1;
  }
  return {
    zone1: Math.round(seconds.zone1 / 60),
    zone2: Math.round(seconds.zone2 / 60),
    zone3: Math.round(seconds.zone3 / 60),
    zone4: Math.round(seconds.zone4 / 60),
    zone5: Math.round(seconds.zone5 / 60),
  };
}

export function buildWorkoutHRSeries(args: {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  samples: HRSample[];
  maxHr?: number;
  caloriesBurned?: number;
}): WorkoutHRSeries {
  const maxHr = args.maxHr ?? 220 - DEFAULT_AGE;
  const series: WorkoutHRSeries = {
    sessionId: args.sessionId,
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    samples: args.samples,
    syncedAt: new Date().toISOString(),
  };
  if (args.samples.length > 0) {
    let peak = 0;
    let sum = 0;
    for (const s of args.samples) {
      if (s.bpm > peak) peak = s.bpm;
      sum += s.bpm;
    }
    series.peakBpm = peak;
    series.avgBpm = Math.round(sum / args.samples.length);
    series.zoneMinutes = computeZoneMinutes(args.samples, maxHr);
  }
  if (args.caloriesBurned != null && args.caloriesBurned > 0) {
    series.caloriesBurned = args.caloriesBurned;
  }
  return series;
}
