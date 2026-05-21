/**
 * Three-pillar daily snapshot — Recovery / Strain / Sleep.
 *
 * Whoop's home screen revolves around three tiles; we mirror that with
 * the inputs we have. Each pillar exposes:
 *   - current: today's value (0..100 for recovery/strain, hours for sleep)
 *   - subtitle: one-line context line
 *   - trend: last 7 days (oldest → newest) for the mini sparkline
 *
 * These derivations intentionally duplicate small amounts of math from
 * `lib/readiness.ts` rather than coupling — the composite Readiness card
 * and the per-pillar tiles answer different questions and may diverge
 * in their inputs later (e.g. strain may pull in cardio sessions).
 */

import type { HealthLog, LiftSession } from "@/lib/types";

export type PillarKey = "recovery" | "strain" | "sleep";

export type PillarSnapshot = {
  key: PillarKey;
  label: string;
  /** Numeric current value — 0..100 for recovery/strain, hours for sleep. */
  value: number | null;
  /** Pre-formatted display string (e.g. "82", "7.5h"). */
  display: string;
  /** Secondary line under the value. */
  subtitle: string;
  /** Optional bracket label that hugs the value ("Optimal", "Rest", ...). */
  bracket?: string;
  /** Last 7 days oldest → newest. nulls render as gaps in the sparkline. */
  trend: (number | null)[];
};

export type PillarsResult = {
  recovery: PillarSnapshot;
  strain: PillarSnapshot;
  sleep: PillarSnapshot;
};

export type PillarsInput = {
  health: Record<string, HealthLog>;
  liftSessions: LiftSession[];
  today: string;
};

const TREND_DAYS = 7;
const SLEEP_TARGET_HOURS = 7.5;

export function computePillars(input: PillarsInput): PillarsResult {
  const { health, liftSessions, today } = input;
  const recovery = buildRecovery(health, today);
  const strain = buildStrain(liftSessions, today);
  const sleep = buildSleep(health, today);
  return { recovery, strain, sleep };
}

/* ---------- Recovery ---------- */

function buildRecovery(
  health: Record<string, HealthLog>,
  today: string
): PillarSnapshot {
  const score = recoveryScoreFor(health, today);
  const trend = lastNDays(today, TREND_DAYS).map((d) =>
    recoveryScoreFor(health, d)
  );

  if (score == null) {
    return {
      key: "recovery",
      label: "Recovery",
      value: null,
      display: "—",
      subtitle: "Sync HRV or log sleep",
      trend,
    };
  }

  const log = health[today] ?? health[shiftDate(today, -1)];
  const hrv = log?.heartRateVariability;
  const rhr = log?.restingHeartRate;
  const subtitle =
    hrv != null
      ? `HRV ${Math.round(hrv)}ms`
      : rhr != null
        ? `RHR ${Math.round(rhr)}`
        : "Sleep-proxy estimate";

  return {
    key: "recovery",
    label: "Recovery",
    value: score,
    display: String(score),
    subtitle,
    bracket: recoveryBracket(score),
    trend,
  };
}

function recoveryScoreFor(
  health: Record<string, HealthLog>,
  date: string
): number | null {
  const log = health[date] ?? health[shiftDate(date, -1)];
  if (!log) return null;

  const hrv = log.heartRateVariability;
  const rhr = log.restingHeartRate;
  const baselineHrv = median(rangeValues(health, date, 30, "heartRateVariability"));
  const baselineRhr = median(rangeValues(health, date, 30, "restingHeartRate"));

  const hrvScore = hrv && baselineHrv ? deviationScore(hrv, baselineHrv, true) : null;
  const rhrScore = rhr && baselineRhr ? deviationScore(rhr, baselineRhr, false) : null;
  const sensorParts = [hrvScore, rhrScore].filter((n): n is number => n != null);

  if (sensorParts.length > 0) {
    return Math.round(sensorParts.reduce((a, b) => a + b, 0) / sensorParts.length);
  }

  // Fallback: sleep-proxy. Hours vs 7.5h. (v2 HealthLog has no sleepQuality
  // field yet, so we use a flat 0.75 quality assumption.)
  const hours = log.sleepHours;
  if (hours == null || hours <= 0) return null;
  const sleepRatio = clamp01(hours / SLEEP_TARGET_HOURS);
  const qualityAdj = 0.75;
  return Math.round(sleepRatio * 70 + qualityAdj * 30);
}

function recoveryBracket(score: number): string {
  if (score >= 75) return "Recovered";
  if (score >= 50) return "Moderate";
  if (score >= 25) return "Low";
  return "Rest";
}

/* ---------- Strain ---------- */

function buildStrain(
  liftSessions: LiftSession[],
  today: string
): PillarSnapshot {
  const todayMetrics = strainMetricsFor(liftSessions, today);
  const trend = lastNDays(today, TREND_DAYS).map(
    (d) => strainMetricsFor(liftSessions, d).score
  );

  if (todayMetrics.score == null) {
    return {
      key: "strain",
      label: "Strain",
      value: 0,
      display: "0",
      subtitle: "Rest day",
      bracket: "Rest",
      trend,
    };
  }

  return {
    key: "strain",
    label: "Strain",
    value: todayMetrics.score,
    display: String(todayMetrics.score),
    subtitle: `${todayMetrics.sets} sets · ${formatVolume(todayMetrics.volume)}`,
    bracket: strainBracket(todayMetrics.score),
    trend,
  };
}

function strainMetricsFor(
  liftSessions: LiftSession[],
  date: string
): { score: number | null; sets: number; volume: number } {
  const day = liftSessions.filter((s) => s.date === date);
  if (day.length === 0) return { score: null, sets: 0, volume: 0 };
  const sets = day.reduce(
    (acc, s) => acc + s.exercises.reduce((a, e) => a + e.sets.length, 0),
    0
  );
  const volume = day.reduce(
    (acc, s) =>
      acc +
      s.exercises.reduce(
        (a, e) => a + e.sets.reduce((v, st) => v + st.weight * st.reps, 0),
        0
      ),
    0
  );
  const score = Math.round(
    Math.min(100, clamp01(sets / 30) * 50 + clamp01(volume / 20000) * 50)
  );
  return { score, sets, volume };
}

function strainBracket(score: number): string {
  if (score >= 80) return "Peak";
  if (score >= 60) return "High";
  if (score >= 30) return "Moderate";
  if (score > 0) return "Light";
  return "Rest";
}

function formatVolume(volume: number): string {
  if (volume <= 0) return "0 lb";
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k lb`;
  return `${Math.round(volume)} lb`;
}

/* ---------- Sleep ---------- */

function buildSleep(
  health: Record<string, HealthLog>,
  today: string
): PillarSnapshot {
  const hours = sleepHoursFor(health, today);
  const trend = lastNDays(today, TREND_DAYS).map((d) => sleepHoursFor(health, d));

  if (hours == null) {
    return {
      key: "sleep",
      label: "Sleep",
      value: null,
      display: "—",
      subtitle: "No sleep data",
      trend,
    };
  }

  const deficit = SLEEP_TARGET_HOURS - hours;
  const subtitle =
    Math.abs(deficit) < 0.25
      ? "On target"
      : deficit > 0
        ? `${deficit.toFixed(1)}h short`
        : `${Math.abs(deficit).toFixed(1)}h over`;

  return {
    key: "sleep",
    label: "Sleep",
    value: hours,
    display: `${hours.toFixed(1)}h`,
    subtitle,
    bracket: sleepBracket(hours),
    trend,
  };
}

function sleepHoursFor(
  health: Record<string, HealthLog>,
  date: string
): number | null {
  // "Sleep for today" = the sleep that landed this morning, i.e. logged on
  // today's date. Fall back to yesterday's log if a synced provider posted
  // the session before the date rolled over.
  const today = health[date]?.sleepHours;
  if (typeof today === "number" && today > 0) return today;
  const yesterday = health[shiftDate(date, -1)]?.sleepHours;
  if (typeof yesterday === "number" && yesterday > 0) return yesterday;
  return null;
}

function sleepBracket(hours: number): string {
  if (hours >= 8) return "Optimal";
  if (hours >= 7) return "On track";
  if (hours >= 6) return "Short";
  return "Deficit";
}

/* ---------- Helpers ---------- */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastNDays(today: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDate(today, -i));
  return out;
}

function rangeValues(
  health: Record<string, HealthLog>,
  todayStr: string,
  days: number,
  field: keyof HealthLog
): number[] {
  const out: number[] = [];
  for (let i = 1; i <= days; i++) {
    const d = shiftDate(todayStr, -i);
    const v = health[d]?.[field];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function deviationScore(
  value: number,
  baseline: number,
  higherIsBetter: boolean
): number {
  if (baseline === 0) return 50;
  const ratio = (value - baseline) / baseline;
  const signed = higherIsBetter ? ratio : -ratio;
  const score = 50 + signed * (50 / 0.15);
  return Math.max(10, Math.min(100, score));
}
