import type { HealthLog, LiftSession } from "@/lib/types";

export type SleepNeedResult = {
  /** Recommended hours of sleep tonight. */
  recommendedHours: number;
  /** Plain-text rationale ("8h 12m — recover yesterday's strain"). */
  rationale: string;
  /** Sleep debt in hours from the past 5 nights (positive = debt). */
  debtHours: number;
  /** Recent avg sleep over past 5 nights. */
  recentAvgHours: number;
  /** Adjustment for yesterday's training strain (added on top of baseline 7.5). */
  strainAdjustmentHours: number;
};

export function computeSleepNeed(input: {
  health: Record<string, HealthLog>;
  liftSessions: LiftSession[];
  today: string;
  baselineHours?: number;
}): SleepNeedResult {
  const baseline = input.baselineHours ?? 7.5;

  const nightSleep: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const d = shiftDate(input.today, -i);
    const h = input.health[d]?.sleepHours;
    if (typeof h === "number" && Number.isFinite(h) && h > 0) {
      nightSleep.push(h);
    }
  }

  const recentAvgHours =
    nightSleep.length >= 2
      ? nightSleep.reduce((a, b) => a + b, 0) / nightSleep.length
      : baseline;

  const sumSleep = nightSleep.reduce((a, b) => a + b, 0);
  const rawDebt = baseline * nightSleep.length - sumSleep;
  const debtHours = Math.max(0, Math.min(5, rawDebt));

  const yesterday = shiftDate(input.today, -1);
  const yLifts = input.liftSessions.filter((s) => s.date === yesterday);
  const yStrainRaw = yLifts.reduce((acc, s) => {
    const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    const volume = s.exercises.reduce(
      (a, e) => a + e.sets.reduce((v, st) => v + st.weight * st.reps, 0),
      0,
    );
    return acc + sets * 0.1 + volume / 2000;
  }, 0);
  const yStrain = Math.min(3, yStrainRaw);
  const strainAdjustmentHours = clamp(yStrain * 0.15, 0, 0.75);

  const debtAdj = Math.min(debtHours * 0.3, 1.5);
  const recommendedRaw = baseline + debtAdj + strainAdjustmentHours;
  const recommendedHours = clamp(recommendedRaw, 6.5, 10);

  const rationale = buildRationale({
    recommendedHours,
    debtHours,
    strainAdjustmentHours,
    baseline,
  });

  return {
    recommendedHours,
    rationale,
    debtHours,
    recentAvgHours,
    strainAdjustmentHours,
  };
}

function buildRationale(args: {
  recommendedHours: number;
  debtHours: number;
  strainAdjustmentHours: number;
  baseline: number;
}): string {
  const head = formatHM(args.recommendedHours);
  const reasons: string[] = [];
  if (args.debtHours >= 0.5) {
    reasons.push(`recover ${args.debtHours.toFixed(1)}h sleep debt`);
  }
  if (args.strainAdjustmentHours >= 0.25) {
    reasons.push("heavy training yesterday");
  }
  if (reasons.length === 0) return `${head} — on baseline`;
  return `${head} — ${reasons.join(" + ")}`;
}

function formatHM(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
