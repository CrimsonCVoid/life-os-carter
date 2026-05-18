/**
 * Composite sleep score (0–100) — pure, unit-testable.
 *
 * Per-spec weighting:
 *   60%  Duration vs 8-hour target  (1.0 when hours >= 8, scales linearly down)
 *   25%  Efficiency = asleep / in-bed
 *   15%  (Deep + REM) / total asleep — quality of sleep architecture
 *
 * Fallback behavior when stage data isn't available:
 *   - Efficiency component falls back to 0.92 (typical "good night")
 *   - Architecture component falls back to 0.35 (typical deep+REM share)
 *   We intentionally do NOT renormalize. The score should be slightly
 *   "pessimistic" on incomplete data so synced stage data clearly improves
 *   the number when it lands.
 *
 * If a provider exposes a native composite (e.g. Google's `sleepScore`),
 * use that directly via `nativeScore` and skip the formula entirely.
 */

import type { HealthLog } from "@/lib/types";

export type SleepScoreInput = Pick<HealthLog, "sleepHours" | "sleepStages"> & {
  /** If the provider gave us its own 0–100 score, prefer it. */
  nativeScore?: number;
  /** Target sleep window (hours). Defaults to 8. */
  targetHours?: number;
};

export type SleepScoreBreakdown = {
  score: number;            // 0..100, integer
  durationPct: number;      // 0..1
  efficiencyPct: number;    // 0..1
  architecturePct: number;  // 0..1
  /** True if any component used a fallback rather than measured data. */
  partial: boolean;
  /** True when we just echoed the provider's native score. */
  native: boolean;
};

const TARGET_HOURS_DEFAULT = 8;
const FALLBACK_EFFICIENCY = 0.92;
const FALLBACK_ARCHITECTURE = 0.35;

export function computeSleepScore(input: SleepScoreInput): SleepScoreBreakdown | null {
  if (input.nativeScore != null && Number.isFinite(input.nativeScore)) {
    const native = clamp01(input.nativeScore / 100) * 100;
    return {
      score: Math.round(native),
      durationPct: 1,
      efficiencyPct: 1,
      architecturePct: 1,
      partial: false,
      native: true,
    };
  }

  if (input.sleepHours == null || !Number.isFinite(input.sleepHours)) return null;

  const target = input.targetHours ?? TARGET_HOURS_DEFAULT;
  const durationPct = clamp01(input.sleepHours / target);

  let efficiencyPct = FALLBACK_EFFICIENCY;
  let architecturePct = FALLBACK_ARCHITECTURE;
  let partial = true;

  const stages = input.sleepStages;
  if (stages) {
    const light = stages.lightMin ?? 0;
    const deep = stages.deepMin ?? 0;
    const rem = stages.remMin ?? 0;
    const wake = stages.wakeMin ?? 0;
    const asleep = light + deep + rem;
    const inBed = asleep + wake;
    if (asleep > 0 && inBed > 0) {
      efficiencyPct = clamp01(asleep / inBed);
      architecturePct = clamp01((deep + rem) / asleep);
      partial = false;
    }
  }

  const composite =
    0.6 * durationPct + 0.25 * efficiencyPct + 0.15 * architecturePct;

  return {
    score: Math.round(clamp01(composite) * 100),
    durationPct,
    efficiencyPct,
    architecturePct,
    partial,
    native: false,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
