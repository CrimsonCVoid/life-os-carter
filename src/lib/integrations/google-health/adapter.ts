/**
 * Google Health API adapter — the ONLY place where API response shapes
 * meet internal types. If Google ships a breaking change (pre-GA through
 * end of May 2026), patch this file. Everything downstream consumes
 * `SyncedDataPoint` and never sees raw API JSON.
 *
 * Each per-metric fetcher returns an array of `SyncedDataPoint` keyed by
 * civil date (the wake date for sleep). The sync route merges them.
 */

import {
  DATA_TYPES,
  GOOGLE_HEALTH_BASE_URL,
} from "./config";
import {
  RefreshFailedError,
} from "./oauth-server";
import type { DateStr } from "@/lib/types";

export type SleepStagesMin = {
  lightMin?: number;
  deepMin?: number;
  remMin?: number;
  wakeMin?: number;
};

export type SyncedFields = {
  sleepHours?: number;
  /** Wake-up "HH:MM" if the API exposes it. */
  wakeTime?: string;
  sleepStages?: SleepStagesMin;
  steps?: number;
  weight?: number; // lb (we convert from kg here so the store is consistent)
  restingHeartRate?: number; // bpm
  heartRateVariability?: number; // ms (rMSSD-style)
  cardioLoad?: number; // Active Zone Minutes (daily total)
  activeEnergyKcal?: number; // active calories burned
  totalCaloriesKcal?: number; // total calories burned (active + BMR)
  distanceMeters?: number; // meters
  floors?: number; // floors climbed
  vo2Max?: number; // mL/kg/min
};

export type SyncedDataPoint = {
  date: DateStr;
  fields: SyncedFields;
};

/** Civil date in "YYYY-MM-DD". */
function civilDate(d: Date): DateStr {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** "YYYY-MM-DD" → google.type.Date parts, as the dailyRollUp range wants. */
function civilDateParts(date: DateStr): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function isoStartOf(date: DateStr): string {
  return `${date}T00:00:00`;
}

/**
 * Day after `date`, as a civil "YYYY-MM-DD". All list filters use a
 * half-open [start, nextDay(end)) range because the Google Health API
 * only accepts the `>=` and `<` comparators on time fields — passing
 * `<=` returns 400 INVALID_DATA_POINT_FILTER_RESTRICTION_COMPARATOR.
 */
function nextDay(date: DateStr): DateStr {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return civilDate(d);
}

async function callGoogle<T>(
  url: string,
  init: RequestInit & { accessToken: string }
): Promise<T> {
  const { accessToken, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new RefreshFailedError(`Google Health 401: ${await res.text()}`);
  }
  if (!res.ok) {
    throw new Error(
      `Google Health ${res.status} on ${url}: ${await res.text()}`
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// SLEEP
// ---------------------------------------------------------------------------

/**
 * Sleep is a Session type. We list sessions whose civil end-time falls in
 * the window and group them by the civil end date (which is the user's
 * wake date — what the UI labels "last night's sleep").
 */
type ListResponse<T> = {
  dataPoints?: T[];
  nextPageToken?: string;
};

type RawSleepDataPoint = {
  name?: string;
  sleep?: {
    interval?: {
      startTime?: string;
      endTime?: string;
      civilStartTime?: CivilTimeObj | string;
      civilEndTime?: CivilTimeObj | string;
    };
    /** Stages may appear as either a summary object or an array of stage
     * intervals. We tolerate both. */
    stagesSummary?: {
      lightMs?: string | number;
      deepMs?: string | number;
      remMs?: string | number;
      wakeMs?: string | number;
    };
    stages?: Array<{
      stage?: "LIGHT" | "DEEP" | "REM" | "WAKE" | "AWAKE" | "UNKNOWN";
      interval?: {
        startTime?: string;
        endTime?: string;
      };
    }>;
  };
};

function msToMin(ms: number): number {
  return Math.round(ms / 60000);
}

function parseStageMs(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.]/g, "")) : v;
  return Number.isFinite(n) ? n : undefined;
}

function summarizeStages(point: RawSleepDataPoint): SleepStagesMin | undefined {
  const s = point.sleep;
  if (!s) return undefined;
  if (s.stagesSummary) {
    const summary = s.stagesSummary;
    const light = parseStageMs(summary.lightMs);
    const deep = parseStageMs(summary.deepMs);
    const rem = parseStageMs(summary.remMs);
    const wake = parseStageMs(summary.wakeMs);
    if (light == null && deep == null && rem == null && wake == null) return undefined;
    return {
      lightMin: light != null ? msToMin(light) : undefined,
      deepMin: deep != null ? msToMin(deep) : undefined,
      remMin: rem != null ? msToMin(rem) : undefined,
      wakeMin: wake != null ? msToMin(wake) : undefined,
    };
  }
  if (Array.isArray(s.stages) && s.stages.length > 0) {
    const totals: Record<string, number> = { LIGHT: 0, DEEP: 0, REM: 0, WAKE: 0 };
    for (const stage of s.stages) {
      const start = stage.interval?.startTime;
      const end = stage.interval?.endTime;
      if (!start || !end) continue;
      const dur = new Date(end).getTime() - new Date(start).getTime();
      if (!Number.isFinite(dur) || dur <= 0) continue;
      const key =
        stage.stage === "AWAKE" ? "WAKE" : stage.stage ?? "LIGHT";
      if (totals[key] == null) totals[key] = 0;
      totals[key] += dur;
    }
    if (Object.values(totals).every((v) => v === 0)) return undefined;
    return {
      lightMin: msToMin(totals.LIGHT),
      deepMin: msToMin(totals.DEEP),
      remMin: msToMin(totals.REM),
      wakeMin: msToMin(totals.WAKE),
    };
  }
  return undefined;
}

export async function fetchSleep(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const params = new URLSearchParams({
    // snake_case field path; civil dates keep us on the user's local
    // "last night" boundaries. Half-open range — the API rejects `<=`.
    filter: `sleep.interval.civil_end_time >= "${opts.startDate}" AND sleep.interval.civil_end_time < "${nextDay(opts.endDate)}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.sleep}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawSleepDataPoint>>(url, {
    accessToken: opts.accessToken,
  });

  // TEMP DEBUG (remove next deploy): surface the real Fitbit sleep shape so
  // we can fix stage extraction. Logs count + the first raw dataPoint.
  {
    const pts = res.dataPoints ?? [];
    console.log(
      "[gh-debug] sleep count=",
      pts.length,
      "first=",
      JSON.stringify(pts[0] ?? null).slice(0, 1500)
    );
  }

  // Group sessions by civil wake date. If multiple sessions land on the
  // same date (e.g. nap + main sleep), sum hours and merge stages.
  const byDate = new Map<
    DateStr,
    { totalMs: number; latestEnd?: Date; stages: SleepStagesMin }
  >();
  for (const p of res.dataPoints ?? []) {
    const interval = p.sleep?.interval;
    if (!interval) continue;
    // Physical times (RFC3339 strings) drive duration + wake clock-time;
    // the structured civil end date gives the "last night" label.
    const startISO = interval.startTime;
    const endISO = interval.endTime;
    if (!startISO || !endISO) continue;
    const start = new Date(startISO);
    const end = new Date(endISO);
    const dur = end.getTime() - start.getTime();
    if (!Number.isFinite(dur) || dur <= 0) continue;
    const wakeDate = civilDateOf(interval.civilEndTime) ?? civilDate(end);
    const stages = summarizeStages(p) ?? {};
    const cur = byDate.get(wakeDate) ?? {
      totalMs: 0,
      stages: {},
    };
    cur.totalMs += dur;
    cur.latestEnd =
      !cur.latestEnd || end > cur.latestEnd ? end : cur.latestEnd;
    cur.stages = mergeStages(cur.stages, stages);
    byDate.set(wakeDate, cur);
  }

  const out: SyncedDataPoint[] = [];
  for (const [date, entry] of byDate.entries()) {
    const hours = +(entry.totalMs / (1000 * 60 * 60)).toFixed(2);
    const fields: SyncedFields = { sleepHours: hours };
    if (entry.latestEnd) {
      const h = String(entry.latestEnd.getHours()).padStart(2, "0");
      const m = String(entry.latestEnd.getMinutes()).padStart(2, "0");
      fields.wakeTime = `${h}:${m}`;
    }
    if (hasAnyStage(entry.stages)) fields.sleepStages = entry.stages;
    out.push({ date, fields });
  }
  return out;
}

export type SleepSegment = {
  stage: "AWAKE" | "LIGHT" | "DEEP" | "REM";
  startMs: number;
  endMs: number;
};

export type SleepSegmentsResult = {
  date: DateStr;
  segments: SleepSegment[];
  inBedStartMs: number;
  wakeEndMs: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
};

/** Fetch the timed sleep-stage segments for the night whose civil wake
 * date is `date`. Unlike `fetchSleep` (which collapses to per-stage
 * minutes), this preserves the chronological stage timeline the
 * hypnogram renders. Sessions sharing the same wake date are merged
 * into one ascending timeline. Returns null when no staged segment data
 * exists (e.g. a tracker that reports only total hours). */
export async function fetchSleepSegments(opts: {
  accessToken: string;
  date: DateStr;
}): Promise<SleepSegmentsResult | null> {
  const params = new URLSearchParams({
    filter: `sleep.interval.civil_end_time >= "${opts.date}" AND sleep.interval.civil_end_time < "${nextDay(opts.date)}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.sleep}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawSleepDataPoint>>(url, {
    accessToken: opts.accessToken,
  });

  const segments: SleepSegment[] = [];
  for (const p of res.dataPoints ?? []) {
    const stages = p.sleep?.stages;
    if (!Array.isArray(stages)) continue;
    for (const seg of stages) {
      const start = seg.interval?.startTime;
      const end = seg.interval?.endTime;
      if (!start || !end) continue;
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
        continue;
      const raw = seg.stage ?? "LIGHT";
      const norm: SleepSegment["stage"] =
        raw === "DEEP"
          ? "DEEP"
          : raw === "REM"
            ? "REM"
            : raw === "WAKE" || raw === "AWAKE"
              ? "AWAKE"
              : "LIGHT"; // LIGHT + UNKNOWN both fold into LIGHT
      segments.push({ stage: norm, startMs, endMs });
    }
  }
  if (segments.length === 0) return null;
  segments.sort((a, b) => a.startMs - b.startMs);

  let deep = 0;
  let rem = 0;
  let light = 0;
  let awake = 0;
  for (const s of segments) {
    const min = (s.endMs - s.startMs) / 60000;
    if (s.stage === "DEEP") deep += min;
    else if (s.stage === "REM") rem += min;
    else if (s.stage === "AWAKE") awake += min;
    else light += min;
  }

  return {
    date: opts.date,
    segments,
    inBedStartMs: segments[0].startMs,
    wakeEndMs: segments[segments.length - 1].endMs,
    deepMin: Math.round(deep),
    remMin: Math.round(rem),
    lightMin: Math.round(light),
    awakeMin: Math.round(awake),
  };
}

function mergeStages(a: SleepStagesMin, b: SleepStagesMin): SleepStagesMin {
  return {
    lightMin: sumOpt(a.lightMin, b.lightMin),
    deepMin: sumOpt(a.deepMin, b.deepMin),
    remMin: sumOpt(a.remMin, b.remMin),
    wakeMin: sumOpt(a.wakeMin, b.wakeMin),
  };
}
function sumOpt(a?: number, b?: number): number | undefined {
  if (a == null && b == null) return undefined;
  return (a ?? 0) + (b ?? 0);
}
function hasAnyStage(s: SleepStagesMin): boolean {
  return [s.lightMin, s.deepMin, s.remMin, s.wakeMin].some(
    (v) => v != null && v > 0
  );
}

// ---------------------------------------------------------------------------
// STEPS (daily rollup)
// ---------------------------------------------------------------------------

/** Google returns civil times as structured objects, not strings:
 * `{ date: { year, month, day }, time: { hours, minutes, seconds } }`. */
type CivilDateParts = { year?: number; month?: number; day?: number };
type CivilTimeObj = { date?: CivilDateParts; time?: unknown };

type DailyRollupResponse = {
  // The list of daily windows is `rollupDataPoints` (not `dailyRollups`).
  rollupDataPoints?: Array<{
    civilStartTime?: CivilTimeObj | string;
    civilEndTime?: CivilTimeObj | string;
    // Each rollup type names its own aggregated value field.
    steps?: { countSum?: string | number };
    weight?: { weightGramsAvg?: number; weightGramsMin?: number; weightGramsMax?: number };
    activeZoneMinutes?: { totalMinutes?: number; minutesSum?: number; totalSum?: number };
    activeEnergyBurned?: { kcalSum?: number };
    totalCalories?: { kcalSum?: number };
    distance?: { millimetersSum?: string | number };
    floors?: { countSum?: string | number; floorsSum?: string | number };
  }>;
  nextPageToken?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Civil date "YYYY-MM-DD" from either a string ("2026-05-17[T..]") or the
 * structured `{ date: { year, month, day } }` / `{ year, month, day }` shape. */
function civilDateOf(
  v?: string | CivilTimeObj | CivilDateParts
): DateStr | undefined {
  if (!v) return undefined;
  if (typeof v === "string") {
    const d = v.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? (d as DateStr) : undefined;
  }
  const parts: CivilDateParts | undefined =
    "date" in v && v.date ? v.date : (v as CivilDateParts);
  if (!parts || parts.year == null || parts.month == null || parts.day == null) {
    return undefined;
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` as DateStr;
}

function parseIntegerish(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return Number.isFinite(n) ? n : undefined;
}

async function fetchDailyRollUp(opts: {
  accessToken: string;
  dataType: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<DailyRollupResponse> {
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${opts.dataType}/dataPoints:dailyRollUp`;
  // range.start/end take structured google.type.Date + TimeOfDay objects,
  // not "YYYY-MM-DD"/"HH:MM:SS" strings (those 400 with
  // "Invalid value at 'range.start.date'").
  const body = {
    range: {
      start: {
        date: civilDateParts(opts.startDate),
        time: { hours: 0, minutes: 0, seconds: 0 },
      },
      end: {
        date: civilDateParts(opts.endDate),
        time: { hours: 23, minutes: 59, seconds: 59 },
      },
    },
    windowSizeDays: 1,
    pageSize: 200,
  };
  return callGoogle<DailyRollupResponse>(url, {
    accessToken: opts.accessToken,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchSteps(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.steps,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    if (!date) continue;
    const count = parseIntegerish(r.steps?.countSum);
    if (count == null) continue;
    out.push({ date, fields: { steps: count } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WEIGHT (daily rollup average)
// ---------------------------------------------------------------------------

const KG_TO_LB = 2.2046226218;

export async function fetchWeight(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.weight,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    if (!date) continue;
    // Weight rollup reports grams (weightGramsAvg), not kilograms.
    const grams = r.weight?.weightGramsAvg;
    if (grams == null || !Number.isFinite(grams)) continue;
    const lb = +((grams / 1000) * KG_TO_LB).toFixed(1);
    out.push({ date, fields: { weight: lb } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// RESTING HEART RATE — daily type
// ---------------------------------------------------------------------------

type RawDailyDataPoint = {
  dailyRestingHeartRate?: {
    date?: CivilDateParts;
    beatsPerMinute?: number | string;
  };
};

export async function fetchRestingHeartRate(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const params = new URLSearchParams({
    // Daily-summary types filter on `.date` (not `.civil_date`); half-open.
    filter: `daily_resting_heart_rate.date >= "${opts.startDate}" AND daily_resting_heart_rate.date < "${nextDay(opts.endDate)}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.restingHeartRate}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawDailyDataPoint>>(url, {
    accessToken: opts.accessToken,
  });
  const out: SyncedDataPoint[] = [];
  for (const p of res.dataPoints ?? []) {
    const date = civilDateOf(p.dailyRestingHeartRate?.date);
    const bpm = parseIntegerish(p.dailyRestingHeartRate?.beatsPerMinute);
    if (!date || bpm == null) continue;
    out.push({ date, fields: { restingHeartRate: bpm } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HEART RATE VARIABILITY — sample type, daily average
// ---------------------------------------------------------------------------

type RawHrvDataPoint = {
  heartRateVariability?: {
    sampleTime?: { civilTime?: CivilTimeObj | string; physicalTime?: string };
    civilTime?: CivilTimeObj | string;
    intervalMilliseconds?: number;
    /** Alternate field names some API versions use; we try them in order. */
    rmssdMilliseconds?: number;
    millisecondsRmssd?: number;
    valueMilliseconds?: number;
  };
};

function readHrvMs(p: RawHrvDataPoint): number | undefined {
  const h = p.heartRateVariability;
  if (!h) return undefined;
  return (
    h.rmssdMilliseconds ??
    h.millisecondsRmssd ??
    h.valueMilliseconds ??
    h.intervalMilliseconds ??
    undefined
  );
}

export async function fetchHeartRateVariability(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const params = new URLSearchParams({
    // Sample types filter on `sample_time.civil_time` (the bare
    // `civil_time` path is invalid); half-open range.
    filter: `heart_rate_variability.sample_time.civil_time >= "${isoStartOf(opts.startDate)}" AND heart_rate_variability.sample_time.civil_time < "${isoStartOf(nextDay(opts.endDate))}"`,
    pageSize: "500",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.heartRateVariability}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawHrvDataPoint>>(url, {
    accessToken: opts.accessToken,
  });

  // TEMP DEBUG (remove next deploy): surface the real Fitbit HRV shape.
  {
    const pts = res.dataPoints ?? [];
    console.log(
      "[gh-debug] hrv count=",
      pts.length,
      "first=",
      JSON.stringify(pts[0] ?? null).slice(0, 1000)
    );
  }

  // Aggregate by civil date (HRV samples can come multiple times per night).
  const byDate = new Map<DateStr, { sum: number; n: number }>();
  for (const p of res.dataPoints ?? []) {
    const t =
      p.heartRateVariability?.sampleTime?.civilTime ??
      p.heartRateVariability?.civilTime;
    const date = civilDateOf(t);
    const ms = readHrvMs(p);
    if (!date || ms == null || !Number.isFinite(ms)) continue;
    const cur = byDate.get(date) ?? { sum: 0, n: 0 };
    cur.sum += ms;
    cur.n += 1;
    byDate.set(date, cur);
  }
  const out: SyncedDataPoint[] = [];
  for (const [date, { sum, n }] of byDate.entries()) {
    if (n === 0) continue;
    out.push({
      date,
      fields: { heartRateVariability: +(sum / n).toFixed(1) },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CARDIO LOAD
// ---------------------------------------------------------------------------

export async function fetchCardioLoad(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.cardioLoad,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    if (!date) continue;
    const raw =
      r.activeZoneMinutes?.totalMinutes ??
      r.activeZoneMinutes?.minutesSum ??
      r.activeZoneMinutes?.totalSum;
    if (raw == null || !Number.isFinite(raw)) continue;
    out.push({ date, fields: { cardioLoad: Math.round(raw) } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ACTIVE ENERGY / TOTAL CALORIES / DISTANCE / FLOORS (daily rollups)
// ---------------------------------------------------------------------------

export async function fetchActiveEnergy(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.activeEnergy,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    const kcal = r.activeEnergyBurned?.kcalSum;
    if (!date || kcal == null || !Number.isFinite(kcal)) continue;
    out.push({ date, fields: { activeEnergyKcal: Math.round(kcal) } });
  }
  return out;
}

export async function fetchTotalCalories(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  // total-calories caps the query window at 14 days (the API 400s past
  // that), so clamp the start independently of the other metrics.
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.totalCalories,
    startDate: clampWindow(opts.startDate, opts.endDate, 14),
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    const kcal = r.totalCalories?.kcalSum;
    if (!date || kcal == null || !Number.isFinite(kcal)) continue;
    out.push({ date, fields: { totalCaloriesKcal: Math.round(kcal) } });
  }
  return out;
}

export async function fetchDistance(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.distance,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    const mm = parseIntegerish(r.distance?.millimetersSum);
    if (!date || mm == null) continue;
    out.push({ date, fields: { distanceMeters: +(mm / 1000).toFixed(2) } });
  }
  return out;
}

export async function fetchFloors(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const res = await fetchDailyRollUp({
    accessToken: opts.accessToken,
    dataType: DATA_TYPES.floors,
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
  const out: SyncedDataPoint[] = [];
  for (const r of res.rollupDataPoints ?? []) {
    const date = civilDateOf(r.civilStartTime);
    const n = parseIntegerish(r.floors?.countSum ?? r.floors?.floorsSum);
    if (!date || n == null) continue;
    out.push({ date, fields: { floors: n } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// VO2 MAX (sample type — slow-moving; take the most recent reading)
// ---------------------------------------------------------------------------

type RawVo2DataPoint = {
  vo2Max?: {
    sampleTime?: { physicalTime?: string; civilTime?: CivilTimeObj | string };
    value?: number | string;
    vo2MaxMlPerKgMin?: number | string;
    metersPerMinutePerKilogram?: number | string;
  };
};

export async function fetchVo2Max(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const params = new URLSearchParams({
    filter: `vo2_max.sample_time.civil_time >= "${isoStartOf(opts.startDate)}" AND vo2_max.sample_time.civil_time < "${isoStartOf(nextDay(opts.endDate))}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.vo2Max}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawVo2DataPoint>>(url, {
    accessToken: opts.accessToken,
  });
  const out: SyncedDataPoint[] = [];
  for (const p of res.dataPoints ?? []) {
    const v = p.vo2Max;
    if (!v) continue;
    const date = civilDateOf(v.sampleTime?.civilTime);
    const raw = parseFloatish(v.value ?? v.vo2MaxMlPerKgMin ?? v.metersPerMinutePerKilogram);
    if (!date || raw == null) continue;
    out.push({ date, fields: { vo2Max: +raw.toFixed(1) } });
  }
  return out;
}

function parseFloatish(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/** Clamp the start so [start, end] spans at most `maxDays` (some data
 * types cap the query window). */
function clampWindow(startDate: DateStr, endDate: DateStr, maxDays: number): DateStr {
  const end = new Date(`${endDate}T00:00:00`);
  const minStart = new Date(end);
  minStart.setDate(minStart.getDate() - (maxDays - 1));
  const start = new Date(`${startDate}T00:00:00`);
  return start > minStart ? startDate : civilDate(minStart);
}

// ---------------------------------------------------------------------------
// INTRADAY HEART RATE (sample type — ~1 Hz; bucketed to minute-of-day)
// ---------------------------------------------------------------------------

/** Clock-time component of a civilTime. Zero parts are OMITTED by the API
 * (e.g. {minutes:23,seconds:20} means hour 0) — default each to 0. */
type CivilTimeOfDay = { hours?: number; minutes?: number; seconds?: number };

type RawHeartRateDataPoint = {
  heartRate?: {
    sampleTime?: {
      physicalTime?: string;
      utcOffset?: string;
      civilTime?: { date?: CivilDateParts; time?: CivilTimeOfDay };
    };
    beatsPerMinute?: number | string;
  };
};

export type IntradayHeartRate = {
  date: DateStr;
  /** One bucket per minute-of-day that has data (0..1439). */
  samples: { minute: number; avg: number; min: number; max: number }[];
  min: number;
  max: number;
  avg: number;
  count: number;
};

/** Minute-of-day (0..1439) for a sample, preferring the structured civil
 * time and falling back to physicalTime + utcOffset (seconds, e.g.
 * "-14400s") when civilTime is absent. */
function minuteOfDay(sample: {
  physicalTime?: string;
  utcOffset?: string;
  civilTime?: { time?: CivilTimeOfDay };
}): number | undefined {
  const t = sample.civilTime?.time;
  if (t) {
    const h = t.hours ?? 0;
    const m = t.minutes ?? 0;
    return h * 60 + m;
  }
  if (sample.physicalTime) {
    const base = new Date(sample.physicalTime).getTime();
    if (!Number.isFinite(base)) return undefined;
    const offsetSec = sample.utcOffset
      ? parseInt(sample.utcOffset.replace(/[^\d-]/g, ""), 10)
      : 0;
    const local = new Date(base + (Number.isFinite(offsetSec) ? offsetSec : 0) * 1000);
    return local.getUTCHours() * 60 + local.getUTCMinutes();
  }
  return undefined;
}

export async function fetchIntradayHeartRate(opts: {
  accessToken: string;
  date: DateStr;
}): Promise<IntradayHeartRate> {
  const end = nextDay(opts.date);
  // Per-minute buckets: minute-of-day -> running sum/min/max/count.
  const buckets = new Map<
    number,
    { sum: number; min: number; max: number; n: number }
  >();
  let dayMin = Infinity;
  let dayMax = -Infinity;
  let daySum = 0;
  let dayCount = 0;

  let pageToken: string | undefined;
  // Hard cap is defensive: a full day at ~1 Hz is tens of thousands of
  // samples, so 60 pages of 1000 covers it with headroom.
  for (let page = 0; page < 60; page += 1) {
    const params = new URLSearchParams({
      filter: `heart_rate.sample_time.civil_time >= "${isoStartOf(opts.date)}" AND heart_rate.sample_time.civil_time < "${isoStartOf(end)}"`,
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.heartRate}/dataPoints?${params.toString()}`;
    const res = await callGoogle<ListResponse<RawHeartRateDataPoint>>(url, {
      accessToken: opts.accessToken,
    });

    for (const p of res.dataPoints ?? []) {
      const hr = p.heartRate;
      if (!hr) continue;
      const bpm = parseIntegerish(hr.beatsPerMinute);
      if (bpm == null) continue;
      const minute = minuteOfDay(hr.sampleTime ?? {});
      if (minute == null) continue;
      const cur = buckets.get(minute) ?? {
        sum: 0,
        min: Infinity,
        max: -Infinity,
        n: 0,
      };
      cur.sum += bpm;
      cur.n += 1;
      if (bpm < cur.min) cur.min = bpm;
      if (bpm > cur.max) cur.max = bpm;
      buckets.set(minute, cur);
      daySum += bpm;
      dayCount += 1;
      if (bpm < dayMin) dayMin = bpm;
      if (bpm > dayMax) dayMax = bpm;
    }

    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }

  const samples = [...buckets.entries()]
    .map(([minute, b]) => ({
      minute,
      avg: Math.round(b.sum / b.n),
      min: b.min,
      max: b.max,
    }))
    .sort((a, b) => a.minute - b.minute);

  return {
    date: opts.date,
    samples,
    min: dayCount > 0 ? dayMin : 0,
    max: dayCount > 0 ? dayMax : 0,
    avg: dayCount > 0 ? Math.round(daySum / dayCount) : 0,
    count: dayCount,
  };
}

// ---------------------------------------------------------------------------
// MERGE
// ---------------------------------------------------------------------------

/** Combine per-metric results by date. Later writers win field-by-field;
 * callers pass metric results in priority order if needed. */
export function mergeByDate(
  ...sources: SyncedDataPoint[][]
): SyncedDataPoint[] {
  const acc = new Map<DateStr, SyncedFields>();
  for (const src of sources) {
    for (const point of src) {
      const cur = acc.get(point.date) ?? {};
      acc.set(point.date, { ...cur, ...point.fields });
    }
  }
  return [...acc.entries()].map(([date, fields]) => ({ date, fields }));
}
