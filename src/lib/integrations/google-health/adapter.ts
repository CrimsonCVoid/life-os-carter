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

function isoStartOf(date: DateStr): string {
  return `${date}T00:00:00`;
}

function isoEndOf(date: DateStr): string {
  return `${date}T23:59:59`;
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
      civilStartTime?: string;
      civilEndTime?: string;
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
    // The filter language uses snake_case for the field path. Civil times
    // (no TZ offset) keep us aligned with the user's local "last night".
    filter: `sleep.interval.civil_end_time >= "${isoStartOf(opts.startDate)}" AND sleep.interval.civil_end_time <= "${isoEndOf(opts.endDate)}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.sleep}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawSleepDataPoint>>(url, {
    accessToken: opts.accessToken,
  });

  // Group sessions by civil wake date. If multiple sessions land on the
  // same date (e.g. nap + main sleep), sum hours and merge stages.
  const byDate = new Map<
    DateStr,
    { totalMs: number; latestEnd?: Date; stages: SleepStagesMin }
  >();
  for (const p of res.dataPoints ?? []) {
    const interval = p.sleep?.interval;
    if (!interval) continue;
    const startISO =
      interval.civilStartTime ?? interval.startTime ?? undefined;
    const endISO = interval.civilEndTime ?? interval.endTime ?? undefined;
    if (!startISO || !endISO) continue;
    const start = new Date(startISO);
    const end = new Date(endISO);
    const dur = end.getTime() - start.getTime();
    if (!Number.isFinite(dur) || dur <= 0) continue;
    const wakeDate = civilDate(end);
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

type DailyRollupResponse = {
  dailyRollups?: Array<{
    civilStartTime?: string;
    civilEndTime?: string;
    /** API uses a oneof `value` field; each rollup type names its own key. */
    steps?: { count?: string | number };
    weight?: {
      averageKilograms?: number;
      maxKilograms?: number;
      minKilograms?: number;
    };
    restingHeartRatePersonalRange?: {
      beatsPerMinuteMin?: number;
      beatsPerMinuteMax?: number;
      beatsPerMinuteAverage?: number;
    };
    heartRate?: {
      averageBpm?: number;
      maxBpm?: number;
      minBpm?: number;
    };
  }>;
  nextPageToken?: string;
};

function civilDateFromTime(t?: string): DateStr | undefined {
  if (!t) return undefined;
  // Format examples: "2026-05-17T00:00:00" or "2026-05-17"
  const date = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return undefined;
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
  const body = {
    range: {
      start: { date: opts.startDate, time: "00:00:00" },
      end: { date: opts.endDate, time: "23:59:59" },
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
  for (const r of res.dailyRollups ?? []) {
    const date = civilDateFromTime(r.civilStartTime);
    if (!date) continue;
    const count = parseIntegerish(r.steps?.count);
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
  for (const r of res.dailyRollups ?? []) {
    const date = civilDateFromTime(r.civilStartTime);
    if (!date) continue;
    const kg = r.weight?.averageKilograms;
    if (kg == null || !Number.isFinite(kg)) continue;
    const lb = +(kg * KG_TO_LB).toFixed(1);
    out.push({ date, fields: { weight: lb } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// RESTING HEART RATE — daily type
// ---------------------------------------------------------------------------

type RawDailyDataPoint = {
  dailyRestingHeartRate?: {
    civilDate?: string;
    beatsPerMinute?: number;
  };
};

export async function fetchRestingHeartRate(opts: {
  accessToken: string;
  startDate: DateStr;
  endDate: DateStr;
}): Promise<SyncedDataPoint[]> {
  const params = new URLSearchParams({
    filter: `daily_resting_heart_rate.civil_date >= "${opts.startDate}" AND daily_resting_heart_rate.civil_date <= "${opts.endDate}"`,
    pageSize: "200",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.restingHeartRate}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawDailyDataPoint>>(url, {
    accessToken: opts.accessToken,
  });
  const out: SyncedDataPoint[] = [];
  for (const p of res.dataPoints ?? []) {
    const date = p.dailyRestingHeartRate?.civilDate;
    const bpm = p.dailyRestingHeartRate?.beatsPerMinute;
    if (!date || bpm == null) continue;
    out.push({ date, fields: { restingHeartRate: Math.round(bpm) } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HEART RATE VARIABILITY — sample type, daily average
// ---------------------------------------------------------------------------

type RawHrvDataPoint = {
  heartRateVariability?: {
    civilTime?: string;
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
    filter: `heart_rate_variability.civil_time >= "${isoStartOf(opts.startDate)}" AND heart_rate_variability.civil_time <= "${isoEndOf(opts.endDate)}"`,
    pageSize: "500",
  });
  const url = `${GOOGLE_HEALTH_BASE_URL}/users/me/dataTypes/${DATA_TYPES.heartRateVariability}/dataPoints?${params.toString()}`;
  const res = await callGoogle<ListResponse<RawHrvDataPoint>>(url, {
    accessToken: opts.accessToken,
  });

  // Aggregate by civil date (HRV samples can come multiple times per night).
  const byDate = new Map<DateStr, { sum: number; n: number }>();
  for (const p of res.dataPoints ?? []) {
    const t = p.heartRateVariability?.civilTime;
    const date = civilDateFromTime(t);
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
