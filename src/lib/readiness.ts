/**
 * Daily Readiness — a Whoop-style 0-100 composite score derived from the
 * data we have. Whoop's actual algorithm leans heavily on HRV + RHR +
 * sleep architecture from a wrist sensor; we don't have that yet (Fitbit
 * Air sync pending). This is an honest approximation using the inputs
 * we can collect today.
 *
 * Score = weighted average across the dimensions present in the last 24h.
 * Missing inputs are dropped, not penalized — so a user with only sleep
 * logged still gets a score (just lower confidence).
 *
 * Buckets:
 *   90-100  optimal
 *   67-89   green   "good to go"
 *   34-66   yellow  "moderate"
 *   0-33    red     "rest"
 *
 * Pillars:
 *   - Sleep:      hours vs 7.5 target, plus quality if logged
 *   - Recovery:   HRV (if available, deviation from 30d baseline) + RHR trend
 *   - Strain:     prior day's workout count / volume; high strain = lower
 *                 readiness if today follows a heavy day
 *   - Habits:     hydration adherence yesterday + mood (proxy for stress)
 */

import type { HealthLog, LiftSession } from "@/lib/types";

export type ReadinessDimension = {
  key: "sleep" | "recovery" | "strain" | "habits";
  label: string;
  score: number;        // 0..100
  weight: number;       // contribution weight (normalized after)
  confidence: "low" | "medium" | "high";
  note: string;         // one-line human explanation
};

export type ReadinessResult = {
  /** Composite 0-100. */
  score: number;
  bracket: "optimal" | "green" | "yellow" | "red" | "unknown";
  dimensions: ReadinessDimension[];
  /** Highest-confidence one-line headline for the briefing strip. */
  headline: string;
};

export type ReadinessInput = {
  /** Map of YYYY-MM-DD → HealthLog for the last 30 days. */
  health: Record<string, HealthLog>;
  /** All lift sessions. */
  liftSessions: LiftSession[];
  /** Today (UTC midnight slice). */
  today: string;
  /** From settings. Default 96. */
  waterTargetOz: number;
};

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { health, liftSessions, today, waterTargetOz } = input;
  const todayLog = health[today];
  const yesterdayStr = shiftDate(today, -1);
  const yesterdayLog = health[yesterdayStr];

  const dimensions: ReadinessDimension[] = [];

  // --- Sleep dimension ---
  const sleepHours = todayLog?.sleepHours ?? yesterdayLog?.sleepHours;
  if (sleepHours != null && sleepHours > 0) {
    // Whoop-style "sleep performance" — vs need (7.5h baseline).
    const ratio = sleepHours / 7.5;
    const base = clamp01(ratio) * 100;
    // Penalize sub-6h sharply; bonus for 8.5h+.
    let score = base;
    if (sleepHours < 6) score = base * 0.8;
    else if (sleepHours >= 8.5) score = Math.min(100, base + 5);
    dimensions.push({
      key: "sleep",
      label: "Sleep",
      score: Math.round(clamp01(score / 100) * 100),
      weight: 0.4,
      confidence: todayLog?.sleepStages ? "high" : "medium",
      note:
        sleepHours >= 7.5
          ? `${sleepHours.toFixed(1)}h — at target`
          : sleepHours >= 6.5
            ? `${sleepHours.toFixed(1)}h — short by ${(7.5 - sleepHours).toFixed(1)}h`
            : `${sleepHours.toFixed(1)}h — sleep deficit`,
    });
  }

  // --- Recovery dimension (HRV + RHR) ---
  const hrv = todayLog?.heartRateVariability ?? yesterdayLog?.heartRateVariability;
  const rhr = todayLog?.restingHeartRate ?? yesterdayLog?.restingHeartRate;
  if (hrv != null || rhr != null) {
    // We need a baseline. Use the median of the past 30 days for each.
    const baselineHrv = median(rangeValues(health, today, 30, "heartRateVariability"));
    const baselineRhr = median(rangeValues(health, today, 30, "restingHeartRate"));

    const hrvScore = hrv && baselineHrv ? deviationScore(hrv, baselineHrv, true) : null;
    // RHR is inverted — lower is better.
    const rhrScore = rhr && baselineRhr ? deviationScore(rhr, baselineRhr, false) : null;

    const parts = [hrvScore, rhrScore].filter((n): n is number => n != null);
    if (parts.length > 0) {
      const score = parts.reduce((a, b) => a + b, 0) / parts.length;
      dimensions.push({
        key: "recovery",
        label: "Recovery",
        score: Math.round(score),
        weight: 0.35,
        confidence: parts.length === 2 ? "high" : "medium",
        note:
          hrvScore != null && baselineHrv && hrv
            ? `HRV ${hrv}ms vs ${baselineHrv}ms baseline`
            : rhr && baselineRhr
              ? `RHR ${rhr} vs ${baselineRhr} baseline`
              : "Recovery signal mixed",
      });
    }
  }

  // --- Strain dimension (prior day's workout) ---
  const yesterdayLifts = liftSessions.filter((s) => s.date === yesterdayStr);
  if (yesterdayLifts.length > 0) {
    const totalSets = yesterdayLifts.reduce(
      (acc, s) => acc + s.exercises.reduce((a, e) => a + e.sets.length, 0),
      0
    );
    const totalVolume = yesterdayLifts.reduce(
      (acc, s) =>
        acc +
        s.exercises.reduce(
          (a, e) => a + e.sets.reduce((v, st) => v + st.weight * st.reps, 0),
          0
        ),
      0
    );
    // High strain yesterday → recovery debt today. Map sets-volume to a
    // 0-100 strain proxy; the readiness penalty is (100 - strain) × small.
    // 30 sets + 20k lb volume ≈ peak strain → 90.
    const strainProxy = clamp01(totalSets / 30) * 50 + clamp01(totalVolume / 20000) * 50;
    // The strain dimension contributes its INVERSE to readiness: heavy
    // strain yesterday lowers today's readiness.
    const readinessFromStrain = 100 - strainProxy * 0.6;
    dimensions.push({
      key: "strain",
      label: "Recent strain",
      score: Math.round(clamp01(readinessFromStrain / 100) * 100),
      weight: 0.15,
      confidence: "medium",
      note: `${totalSets} sets, ${Math.round(totalVolume / 1000)}k lb yesterday`,
    });
  }

  // --- Habits dimension (hydration + mood) ---
  const yWater = yesterdayLog?.waterOz ?? 0;
  const yMood = yesterdayLog?.mood;
  if (yWater > 0 || yMood != null) {
    const waterScore = clamp01(yWater / Math.max(1, waterTargetOz)) * 100;
    const moodScore = yMood != null ? (yMood / 10) * 100 : null;
    const parts = [waterScore, moodScore].filter((n): n is number => n != null);
    const score = parts.reduce((a, b) => a + b, 0) / parts.length;
    dimensions.push({
      key: "habits",
      label: "Habits",
      score: Math.round(score),
      weight: 0.1,
      confidence: "low",
      note:
        yMood != null
          ? `Mood ${yMood}/10, hydration ${Math.round((yWater / Math.max(1, waterTargetOz)) * 100)}%`
          : `Hydration ${Math.round((yWater / Math.max(1, waterTargetOz)) * 100)}%`,
    });
  }

  // --- Composite ---
  if (dimensions.length === 0) {
    return {
      score: 0,
      bracket: "unknown",
      dimensions: [],
      headline: "Log sleep, water, or workouts to start tracking readiness.",
    };
  }

  const totalWeight = dimensions.reduce((a, d) => a + d.weight, 0);
  const weighted = dimensions.reduce((a, d) => a + d.score * d.weight, 0);
  const composite = Math.round(weighted / totalWeight);

  const bracket: ReadinessResult["bracket"] =
    composite >= 90
      ? "optimal"
      : composite >= 67
        ? "green"
        : composite >= 34
          ? "yellow"
          : "red";

  // Headline = the dimension with highest weight × |score - 67|, so the
  // most consequential observation surfaces. Falls back to highest weight.
  const headline =
    dimensions
      .slice()
      .sort(
        (a, b) =>
          b.weight * Math.abs(b.score - 67) - a.weight * Math.abs(a.score - 67)
      )[0]?.note ?? "Tracking your day.";

  return {
    score: composite,
    bracket,
    dimensions,
    headline,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/**
 * Convert a value vs baseline into a 0-100 score.
 *
 * higherIsBetter=true: value > baseline → score > 50.
 * higherIsBetter=false: value < baseline → score > 50 (e.g. RHR dropping = good).
 *
 * 1 SD above baseline ≈ 67. 2 SD ≈ 80. Clamped 10..100.
 */
function deviationScore(
  value: number,
  baseline: number,
  higherIsBetter: boolean
): number {
  if (baseline === 0) return 50;
  const ratio = (value - baseline) / baseline;
  const signed = higherIsBetter ? ratio : -ratio;
  // Map ratio (-0.15..+0.15) to score (10..100), midpoint 50 at baseline.
  const score = 50 + signed * (50 / 0.15);
  return Math.max(10, Math.min(100, score));
}
