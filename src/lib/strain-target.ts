import type { ReadinessResult } from "@/lib/readiness";
import type { LiftSession } from "@/lib/types";

export type StrainTargetResult = {
  /** Target strain score 0..21 (Whoop scale). */
  target: number;
  /** Today's actual strain so far, same scale. */
  current: number;
  /** Color bracket. */
  bracket: "rest" | "light" | "moderate" | "high" | "peak";
  /** Plain-text label like "Push hard — recovery 88". */
  headline: string;
  /** Recent week's avg strain. */
  weekAvg: number;
};

export function computeStrainTarget(input: {
  readiness: ReadinessResult;
  liftSessions: LiftSession[];
  today: string;
}): StrainTargetResult {
  const { readiness, liftSessions, today } = input;

  const target = targetFromReadiness(readiness);
  const current = strainForDate(liftSessions, today);

  const bracket: StrainTargetResult["bracket"] =
    target >= 16
      ? "peak"
      : target >= 13
        ? "high"
        : target >= 9
          ? "moderate"
          : target >= 6
            ? "light"
            : "rest";

  const weekTotals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(today, -i);
    weekTotals.push(strainForDate(liftSessions, d));
  }
  const weekAvg =
    weekTotals.reduce((a, b) => a + b, 0) / Math.max(1, weekTotals.length);

  const headline = buildHeadline(readiness, bracket);

  return { target, current, bracket, headline, weekAvg };
}

function targetFromReadiness(r: ReadinessResult): number {
  if (r.bracket === "unknown") return 11;
  if (r.score >= 90) return 16.5;
  if (r.score >= 67) return 14.5;
  if (r.score >= 34) return 11;
  return 7;
}

function strainForDate(sessions: LiftSession[], date: string): number {
  const dayLifts = sessions.filter((s) => s.date === date);
  if (dayLifts.length === 0) return 0;
  let raw = 0;
  for (const s of dayLifts) {
    const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    const volume = s.exercises.reduce(
      (a, e) => a + e.sets.reduce((v, st) => v + st.weight * st.reps, 0),
      0,
    );
    raw += sets * 0.3 + volume / 2000;
  }
  return Math.min(21, raw);
}

function buildHeadline(
  r: ReadinessResult,
  bracket: StrainTargetResult["bracket"],
): string {
  if (r.bracket === "unknown") {
    return "Log sleep and workouts to calibrate strain.";
  }
  if (bracket === "peak") return `Push hard — recovery ${r.score}`;
  if (bracket === "high") return `Solid effort day — recovery ${r.score}`;
  if (bracket === "moderate") return `Maintain — recovery ${r.score}`;
  if (bracket === "light") return `Take it easy — RPE ≤ 7 today`;
  return `Rest day — recovery ${r.score}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
