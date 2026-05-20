/**
 * Peak State — synthesized daily readiness score, 0–100.
 *
 * Pure + deterministic. No fetches, no Date.now, no side effects.
 * `computePeakState(inputs)` should always return the same output for
 * the same input. The pipeline (Commit 3) is responsible for gathering
 * inputs from Neon; this file is responsible for the math only.
 *
 * Three sub-scores feed the headline:
 *   • Recovery  — purely physiological (HRV / RHR / sleep score / sleep debt)
 *   • Strain    — how taxed the body is (cardio load + days since rest)
 *   • Lifestyle — how dialed-in today is (mood / energy / hydration / routine)
 *
 *   peakState = Recovery * 0.6 + Lifestyle * 0.3 + (100 − Strain) * 0.1
 *
 * Recovery dominates because you can't peak without recovery. Lifestyle
 * modulates. Strain nudges down only mildly — a heavy training week
 * doesn't mean you're "unfit," it just means you're loaded.
 *
 * Every input that's missing OR doesn't have a ready baseline drops
 * out of its sub-score and its weight redistributes across the rest.
 * If a sub-score has zero available inputs, the sub-score itself is
 * null and it drops out of the headline (weight redistributes).
 *
 * If fewer than 4 of the 8 named inputs are available, we return
 * peakState = null so the UI hides the card entirely. 4–6 inputs is
 * a "preliminary" score; 7–8 is normal.
 *
 * Baselines (HRV / RHR / cardio load) require 14 days of history. Below
 * that, the metric scores 0 contribution and its weight redistributes.
 *
 * NO chasing high scores, NO gamification — this is information, not
 * a target. Same reason there are no streaks here.
 */

// ─── public types ────────────────────────────────────────────────────────────

export type Recommendation =
  | "go_hard"
  | "maintain"
  | "train_normal"
  | "easy_session"
  | "active_recovery"
  | "full_rest";

export type ContributorDirection = "positive" | "negative" | "neutral";
export type ContributorSource = "recovery" | "strain" | "lifestyle";

export type Contributor = {
  /** "HRV", "Sleep", "Hydration", etc. */
  label: string;
  /** Signed contribution to the headline peakState, in points.
   * Positive = pushed score up, negative = pulled it down. */
  impact: number;
  direction: ContributorDirection;
  /** Human-readable "current value vs reference" snippet. */
  detail: string;
  /** Which sub-score the input contributed to. */
  subScore: ContributorSource;
};

export type PeakStateInputs = {
  // Physiological — device-sourced.
  hrvToday: number | null;
  /** Last 30 days excluding today (oldest → newest), nulls allowed. */
  hrvLast30Days: Array<number | null>;
  rhrToday: number | null;
  rhrLast30Days: Array<number | null>;
  sleepScoreLastNight: number | null; // 0..100
  /** Cumulative hours of deficit over the last 7 days vs 8h/night target.
   * Positive = behind. Negative would imply over-target; we treat 0 as
   * the cap. */
  sleepDebtLast7Days: number | null;

  // Strain.
  cardioLoadLast7Days: number | null;
  cardioLoadLast4WeekAvg: number | null;
  /** Optional: how many cardio_load_logs rows feed the 4-week avg.
   * If null we infer "ready" from cardioLoadLast4WeekAvg presence. */
  cardioBaselineDays?: number | null;
  /** Whole days since the most recent workout-free day. 0 = today is a
   * rest day, 7+ = a week without a break. */
  daysSinceLastRest: number | null;

  // Lifestyle — subjective.
  moodToday: number | null; // 1..10
  energyToday: number | null; // 1..10
  /** Today's water as a fraction of the daily target. 1.0 = on target;
   * 0.4 = 40% of target. Capped at 1.0 in the formula. */
  hydrationPctToday: number | null;
  /** Fraction of morning-routine items checked today, 0..1. */
  morningRoutineCompletionPct: number;
};

export type BaselineStatus = {
  /** Number of usable (finite) HRV days in the 30-day window. */
  hrv: number;
  /** Number of usable RHR days. */
  rhr: number;
  /** Inferred / passed-in cardio baseline days. */
  cardio: number;
};

export type PeakStateOutput = {
  /** 0..100 integer, or null when fewer than 4 inputs were available. */
  peakState: number | null;
  recovery: number | null;
  strain: number | null;
  lifestyle: number | null;
  recommendation: Recommendation | null;
  /** Sorted by absolute |impact| desc. Includes only inputs that
   * actually contributed (skips unavailable ones). */
  contributors: Contributor[];
  /** Count of the 8 named inputs that were available this run, 0..8. */
  availableInputs: number;
  baselineStatus: BaselineStatus;
  /** True when 4–6 of 8 inputs were available — UI shows "building". */
  preliminary: boolean;
};

// ─── tunables ────────────────────────────────────────────────────────────────

const BASELINE_MIN_DAYS = 14;
const SLEEP_TARGET_HOURS = 8; // matches lib/today/vitals/sleep-score.ts default
const SLEEP_DEBT_MAX_HOURS = 14; // 2h/night for 7 days saturates the floor
const HEADLINE_HIDE_THRESHOLD = 4; // <4 inputs → peakState null

// Sub-score weights (must sum to 1 within each block).
const RECOVERY_WEIGHTS = {
  hrv: 0.4,
  rhr: 0.2,
  sleepScore: 0.25,
  sleepDebt: 0.15,
} as const;
const STRAIN_WEIGHTS = {
  cardio: 0.7,
  daysSinceRest: 0.3,
} as const;
const LIFESTYLE_WEIGHTS = {
  mood: 0.3,
  energy: 0.3,
  hydration: 0.25,
  routine: 0.15,
} as const;
const HEADLINE_WEIGHTS = {
  recovery: 0.6,
  lifestyle: 0.3,
  strain: 0.1, // applied to (100 - strain)
} as const;

// ─── helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Sample mean + standard deviation of finite values. Returns null on
 * fewer than the requested minimum. */
function baseline(
  values: Array<number | null>,
  minDays: number
): { mean: number; sd: number; days: number } | null {
  const finite = values.filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  if (finite.length < minDays) return { mean: 0, sd: 0, days: finite.length } as never;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const variance =
    finite.reduce((a, b) => a + (b - mean) ** 2, 0) /
    Math.max(1, finite.length - 1);
  const sd = Math.sqrt(variance);
  return { mean, sd, days: finite.length };
}
function baselineDays(values: Array<number | null>): number {
  return values.filter((v) => v != null && Number.isFinite(v as number)).length;
}

/** Map a z-score to a 0..100 component score with z=0 → 50. Linear
 * with clamp. z=+2 → 100, z=−2 → 0. */
function zToScore(z: number, inverted: boolean): number {
  const raw = inverted ? 50 - z * 25 : 50 + z * 25;
  return clamp(raw, 0, 100);
}

// ─── sub-score builders ──────────────────────────────────────────────────────

type SubResult = {
  score: number | null;
  /** Components actually used (after dropping unavailable ones). */
  used: Array<{ key: string; weight: number; score: number }>;
};

function buildRecovery(
  inputs: PeakStateInputs,
  hrvDays: number,
  rhrDays: number
): {
  result: SubResult;
  hrvDetail?: { score: number; mean: number; sd: number; today: number };
  rhrDetail?: { score: number; mean: number; sd: number; today: number };
} {
  const used: SubResult["used"] = [];
  let hrvDetail: { score: number; mean: number; sd: number; today: number } | undefined;
  let rhrDetail: { score: number; mean: number; sd: number; today: number } | undefined;

  // HRV — need today + ≥14 baseline days.
  if (inputs.hrvToday != null && hrvDays >= BASELINE_MIN_DAYS) {
    const b = baseline(inputs.hrvLast30Days, BASELINE_MIN_DAYS);
    if (b && b.sd > 0) {
      const z = (inputs.hrvToday - b.mean) / b.sd;
      const score = zToScore(z, /*inverted=*/ false);
      used.push({ key: "hrv", weight: RECOVERY_WEIGHTS.hrv, score });
      hrvDetail = { score, mean: b.mean, sd: b.sd, today: inputs.hrvToday };
    }
  }

  // RHR — same shape, but elevated RHR = worse recovery, so invert.
  if (inputs.rhrToday != null && rhrDays >= BASELINE_MIN_DAYS) {
    const b = baseline(inputs.rhrLast30Days, BASELINE_MIN_DAYS);
    if (b && b.sd > 0) {
      const z = (inputs.rhrToday - b.mean) / b.sd;
      const score = zToScore(z, /*inverted=*/ true);
      used.push({ key: "rhr", weight: RECOVERY_WEIGHTS.rhr, score });
      rhrDetail = { score, mean: b.mean, sd: b.sd, today: inputs.rhrToday };
    }
  }

  if (inputs.sleepScoreLastNight != null) {
    used.push({
      key: "sleepScore",
      weight: RECOVERY_WEIGHTS.sleepScore,
      score: clamp(inputs.sleepScoreLastNight, 0, 100),
    });
  }

  if (inputs.sleepDebtLast7Days != null) {
    const debt = Math.max(0, inputs.sleepDebtLast7Days);
    // 0h debt → 100, max debt → 0. Linear.
    const score = clamp(
      ((SLEEP_DEBT_MAX_HOURS - debt) / SLEEP_DEBT_MAX_HOURS) * 100,
      0,
      100
    );
    used.push({ key: "sleepDebt", weight: RECOVERY_WEIGHTS.sleepDebt, score });
  }

  return { result: { score: weightedAverage(used), used }, hrvDetail, rhrDetail };
}

function buildStrain(
  inputs: PeakStateInputs,
  cardioBaselineDays: number
): SubResult {
  const used: SubResult["used"] = [];

  // Cardio load: ratio vs the 4-week baseline.
  if (
    inputs.cardioLoadLast7Days != null &&
    inputs.cardioLoadLast4WeekAvg != null &&
    inputs.cardioLoadLast4WeekAvg > 0 &&
    cardioBaselineDays >= BASELINE_MIN_DAYS
  ) {
    const ratio = inputs.cardioLoadLast7Days / inputs.cardioLoadLast4WeekAvg;
    // ratio 1.0 → 50, 1.3 → 80, 0.8 → 30. Linear and clamped.
    const score = clamp(50 + (ratio - 1) * 100, 0, 100);
    used.push({ key: "cardio", weight: STRAIN_WEIGHTS.cardio, score });
  }

  if (inputs.daysSinceLastRest != null) {
    // 0 days (today is a rest day) → 20 (low strain).
    // 7+ days → 90 (strained).
    const score = clamp(20 + inputs.daysSinceLastRest * 10, 20, 90);
    used.push({
      key: "daysSinceRest",
      weight: STRAIN_WEIGHTS.daysSinceRest,
      score,
    });
  }

  return { score: weightedAverage(used), used };
}

function buildLifestyle(inputs: PeakStateInputs): SubResult {
  const used: SubResult["used"] = [];

  if (inputs.moodToday != null) {
    const score = clamp(inputs.moodToday * 10, 0, 100);
    used.push({ key: "mood", weight: LIFESTYLE_WEIGHTS.mood, score });
  }
  if (inputs.energyToday != null) {
    const score = clamp(inputs.energyToday * 10, 0, 100);
    used.push({ key: "energy", weight: LIFESTYLE_WEIGHTS.energy, score });
  }
  if (inputs.hydrationPctToday != null) {
    const score = clamp01(inputs.hydrationPctToday) * 100;
    used.push({ key: "hydration", weight: LIFESTYLE_WEIGHTS.hydration, score });
  }
  // Routine completion is always considered "available" — a value of 0 is
  // a legitimate signal (the user has the routine and skipped it today).
  // We count it toward availableInputs only when the user has at least
  // one routine item, but the routine score itself always shows.
  used.push({
    key: "routine",
    weight: LIFESTYLE_WEIGHTS.routine,
    score: clamp01(inputs.morningRoutineCompletionPct) * 100,
  });

  return { score: weightedAverage(used), used };
}

function weightedAverage(
  used: SubResult["used"]
): number | null {
  if (used.length === 0) return null;
  const totalW = used.reduce((a, c) => a + c.weight, 0);
  if (totalW === 0) return null;
  const sum = used.reduce((a, c) => a + (c.weight / totalW) * c.score, 0);
  return clamp(sum, 0, 100);
}

// ─── recommendation matrix ───────────────────────────────────────────────────

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  go_hard: "Go hard today",
  maintain: "Maintain",
  train_normal: "Train normal",
  easy_session: "Easy session",
  active_recovery: "Active recovery",
  full_rest: "Full rest",
};
const RECOMMENDATION_DETAIL: Record<Recommendation, string> = {
  go_hard: "Body is recovered and well-loaded — push it.",
  maintain: "Recovered but already carrying a lot — hold the level you're at.",
  train_normal: "Recovery is solid, load is in the sweet spot.",
  easy_session: "Recovery is so-so and you're already loaded — keep it light.",
  active_recovery: "Under-recovered but the load is reasonable — move easy and refuel.",
  full_rest: "Under-recovered and over-loaded — take the day off.",
};

function recommendationFor(
  recovery: number | null,
  strain: number | null
): Recommendation | null {
  if (recovery == null || strain == null) return null;
  const highRec = recovery >= 70;
  const lowRec = recovery < 45;
  const highStrain = strain >= 70;
  if (highRec) return highStrain ? "maintain" : "go_hard";
  if (lowRec) return highStrain ? "full_rest" : "active_recovery";
  return highStrain ? "easy_session" : "train_normal";
}

export function recommendationLabel(r: Recommendation): string {
  return RECOMMENDATION_LABEL[r];
}
export function recommendationDetail(r: Recommendation): string {
  return RECOMMENDATION_DETAIL[r];
}

// ─── contributors ────────────────────────────────────────────────────────────

function contributorFor(opts: {
  label: string;
  score: number;
  subWeight: number;
  subScore: ContributorSource;
  headlineWeight: number;
  /** When true, score above 50 pushes peakState DOWN (strain). */
  inverted?: boolean;
  detail: string;
}): Contributor {
  const sign = opts.inverted ? -1 : 1;
  // Anchored at 50 = neutral. Each delta point contributes
  // (weight_in_subscore * weight_in_headline * sign) headline points.
  const impact =
    (opts.score - 50) * opts.subWeight * opts.headlineWeight * sign;
  const rounded = Math.round(impact * 10) / 10;
  const direction: ContributorDirection =
    rounded > 0.5 ? "positive" : rounded < -0.5 ? "negative" : "neutral";
  return {
    label: opts.label,
    impact: rounded,
    direction,
    detail: opts.detail,
    subScore: opts.subScore,
  };
}

function fmtMs(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "at baseline";
  return rounded > 0 ? `${rounded}ms above baseline` : `${Math.abs(rounded)}ms below baseline`;
}
function fmtBpm(diff: number): string {
  const r = Math.round(diff);
  if (r === 0) return "at baseline";
  return r > 0 ? `${r} bpm above baseline` : `${Math.abs(r)} bpm below baseline`;
}
function fmtHrsMins(decimalHours: number): string {
  const total = Math.max(0, Math.round(decimalHours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── main ────────────────────────────────────────────────────────────────────

export function computePeakState(inputs: PeakStateInputs): PeakStateOutput {
  const hrvDays = baselineDays(inputs.hrvLast30Days);
  const rhrDays = baselineDays(inputs.rhrLast30Days);
  const cardioDays =
    inputs.cardioBaselineDays != null
      ? inputs.cardioBaselineDays
      : inputs.cardioLoadLast4WeekAvg != null
        ? BASELINE_MIN_DAYS
        : 0;

  const baselineStatus: BaselineStatus = {
    hrv: hrvDays,
    rhr: rhrDays,
    cardio: cardioDays,
  };

  // Count the 8 named inputs that are actually usable for the score.
  // (Routine completion isn't gated on availability — the user always
  // has the field — so it's not in this count.)
  const availableInputs =
    (inputs.hrvToday != null && hrvDays >= BASELINE_MIN_DAYS ? 1 : 0) +
    (inputs.rhrToday != null && rhrDays >= BASELINE_MIN_DAYS ? 1 : 0) +
    (inputs.sleepScoreLastNight != null ? 1 : 0) +
    (inputs.sleepDebtLast7Days != null ? 1 : 0) +
    (inputs.cardioLoadLast7Days != null &&
    inputs.cardioLoadLast4WeekAvg != null &&
    cardioDays >= BASELINE_MIN_DAYS
      ? 1
      : 0) +
    (inputs.moodToday != null ? 1 : 0) +
    (inputs.energyToday != null ? 1 : 0) +
    (inputs.hydrationPctToday != null ? 1 : 0);

  if (availableInputs < HEADLINE_HIDE_THRESHOLD) {
    return {
      peakState: null,
      recovery: null,
      strain: null,
      lifestyle: null,
      recommendation: null,
      contributors: [],
      availableInputs,
      baselineStatus,
      preliminary: false,
    };
  }

  const recovery = buildRecovery(inputs, hrvDays, rhrDays);
  const strain = buildStrain(inputs, cardioDays);
  const lifestyle = buildLifestyle(inputs);

  // Headline: redistribute weights when a sub-score is null.
  const headlineComponents: Array<{ weight: number; score: number }> = [];
  if (recovery.result.score != null) {
    headlineComponents.push({
      weight: HEADLINE_WEIGHTS.recovery,
      score: recovery.result.score,
    });
  }
  if (lifestyle.score != null) {
    headlineComponents.push({
      weight: HEADLINE_WEIGHTS.lifestyle,
      score: lifestyle.score,
    });
  }
  if (strain.score != null) {
    // Strain reduces peakState — feed (100 − strain) into the average.
    headlineComponents.push({
      weight: HEADLINE_WEIGHTS.strain,
      score: 100 - strain.score,
    });
  }

  let peakState: number | null = null;
  if (headlineComponents.length > 0) {
    const totalW = headlineComponents.reduce((a, c) => a + c.weight, 0);
    const raw = headlineComponents.reduce(
      (a, c) => a + (c.weight / totalW) * c.score,
      0
    );
    peakState = Math.round(clamp(raw, 0, 100));
  }

  // Build the contributors list.
  const contributors: Contributor[] = [];
  for (const c of recovery.result.used) {
    if (c.key === "hrv" && recovery.hrvDetail) {
      const d = recovery.hrvDetail;
      contributors.push(
        contributorFor({
          label: "HRV",
          score: d.score,
          subWeight: c.weight,
          subScore: "recovery",
          headlineWeight: HEADLINE_WEIGHTS.recovery,
          detail: `${Math.round(d.today)}ms, ${fmtMs(d.today - d.mean)}`,
        })
      );
    } else if (c.key === "rhr" && recovery.rhrDetail) {
      const d = recovery.rhrDetail;
      contributors.push(
        contributorFor({
          label: "Resting HR",
          score: d.score,
          subWeight: c.weight,
          subScore: "recovery",
          headlineWeight: HEADLINE_WEIGHTS.recovery,
          detail: `${Math.round(d.today)} bpm, ${fmtBpm(d.today - d.mean)}`,
        })
      );
    } else if (c.key === "sleepScore" && inputs.sleepScoreLastNight != null) {
      contributors.push(
        contributorFor({
          label: "Sleep score",
          score: c.score,
          subWeight: c.weight,
          subScore: "recovery",
          headlineWeight: HEADLINE_WEIGHTS.recovery,
          detail: `${Math.round(inputs.sleepScoreLastNight)}/100 last night`,
        })
      );
    } else if (c.key === "sleepDebt" && inputs.sleepDebtLast7Days != null) {
      contributors.push(
        contributorFor({
          label: "Sleep debt",
          score: c.score,
          subWeight: c.weight,
          subScore: "recovery",
          headlineWeight: HEADLINE_WEIGHTS.recovery,
          detail: `${fmtHrsMins(Math.max(0, inputs.sleepDebtLast7Days))} over 7 days vs ${SLEEP_TARGET_HOURS}h target`,
        })
      );
    }
  }
  for (const c of strain.used) {
    if (c.key === "cardio") {
      contributors.push(
        contributorFor({
          label: "Cardio load",
          score: c.score,
          subWeight: c.weight,
          subScore: "strain",
          headlineWeight: HEADLINE_WEIGHTS.strain,
          inverted: true,
          detail: `${Math.round(inputs.cardioLoadLast7Days ?? 0)} (vs 4-wk avg ${Math.round(
            inputs.cardioLoadLast4WeekAvg ?? 0
          )})`,
        })
      );
    } else if (c.key === "daysSinceRest" && inputs.daysSinceLastRest != null) {
      contributors.push(
        contributorFor({
          label: "Days since rest",
          score: c.score,
          subWeight: c.weight,
          subScore: "strain",
          headlineWeight: HEADLINE_WEIGHTS.strain,
          inverted: true,
          detail:
            inputs.daysSinceLastRest === 0
              ? "rest day"
              : `${inputs.daysSinceLastRest} day${inputs.daysSinceLastRest === 1 ? "" : "s"}`,
        })
      );
    }
  }
  for (const c of lifestyle.used) {
    if (c.key === "mood" && inputs.moodToday != null) {
      contributors.push(
        contributorFor({
          label: "Mood",
          score: c.score,
          subWeight: c.weight,
          subScore: "lifestyle",
          headlineWeight: HEADLINE_WEIGHTS.lifestyle,
          detail: `${inputs.moodToday}/10`,
        })
      );
    } else if (c.key === "energy" && inputs.energyToday != null) {
      contributors.push(
        contributorFor({
          label: "Energy",
          score: c.score,
          subWeight: c.weight,
          subScore: "lifestyle",
          headlineWeight: HEADLINE_WEIGHTS.lifestyle,
          detail: `${inputs.energyToday}/10`,
        })
      );
    } else if (c.key === "hydration" && inputs.hydrationPctToday != null) {
      contributors.push(
        contributorFor({
          label: "Hydration",
          score: c.score,
          subWeight: c.weight,
          subScore: "lifestyle",
          headlineWeight: HEADLINE_WEIGHTS.lifestyle,
          detail: `${Math.round(clamp01(inputs.hydrationPctToday) * 100)}% of target`,
        })
      );
    } else if (c.key === "routine") {
      contributors.push(
        contributorFor({
          label: "Morning routine",
          score: c.score,
          subWeight: c.weight,
          subScore: "lifestyle",
          headlineWeight: HEADLINE_WEIGHTS.lifestyle,
          detail: `${Math.round(clamp01(inputs.morningRoutineCompletionPct) * 100)}% complete`,
        })
      );
    }
  }

  contributors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  const recovered = recovery.result.score == null ? null : Math.round(recovery.result.score);
  const strained = strain.score == null ? null : Math.round(strain.score);
  const lifed = lifestyle.score == null ? null : Math.round(lifestyle.score);

  return {
    peakState,
    recovery: recovered,
    strain: strained,
    lifestyle: lifed,
    recommendation: recommendationFor(recovered, strained),
    contributors,
    availableInputs,
    baselineStatus,
    preliminary: availableInputs >= HEADLINE_HIDE_THRESHOLD && availableInputs < 7,
  };
}

/* ─── Hand-checked example calculations ──────────────────────────────────────
 *
 * These are mental unit-test rows — inputs paired with their expected outputs.
 * If any diverge in a code change, the reviewer should know about it.
 *
 * 1. ALL-NULL → renderable threshold not met.
 *    computePeakState({
 *      hrvToday: null, hrvLast30Days: [], rhrToday: null, rhrLast30Days: [],
 *      sleepScoreLastNight: null, sleepDebtLast7Days: null,
 *      cardioLoadLast7Days: null, cardioLoadLast4WeekAvg: null,
 *      daysSinceLastRest: null, moodToday: null, energyToday: null,
 *      hydrationPctToday: null, morningRoutineCompletionPct: 0,
 *    })
 *    → { peakState: null, recovery: null, strain: null, lifestyle: null,
 *        recommendation: null, contributors: [], availableInputs: 0,
 *        baselineStatus: { hrv: 0, rhr: 0, cardio: 0 }, preliminary: false }
 *
 * 2. EXACTLY 4 inputs (subjective only, no baselines yet) →
 *    sleepScore 78 + mood 8 + energy 7 + hydration 0.7
 *    Expected: peakState computed, preliminary: true, availableInputs: 4.
 *    Recovery = sleepScore only (78) — its weight has no peers in
 *    recovery so the sub-score is sleepScore exactly.
 *    Lifestyle = (mood 80 * 0.3 + energy 70 * 0.3 + hydration 70 * 0.25
 *                 + routine 0 * 0.15) / 1.0 = 24 + 21 + 17.5 + 0 ≈ 62.5
 *    Strain  = null (cardio missing + daysSinceLastRest missing).
 *    Headline (recovery + lifestyle only):
 *      total weight = 0.6 + 0.3 = 0.9
 *      ((78 * 0.6) + (62.5 * 0.3)) / 0.9 ≈ (46.8 + 18.75) / 0.9 ≈ 72.8 → 73
 *
 * 3. PEAK case — HRV high, RHR low, great sleep, low strain, great mood.
 *    hrvToday = 80ms, baseline mean=50, sd=10 → z=+3 → score 100
 *    rhrToday = 50 bpm, baseline mean=60, sd=4 → z=-2.5 → score 100 (inverted)
 *    sleepScore = 95, sleepDebt = 0h
 *    cardioLoad7d = 240, 4wk avg = 250 → ratio 0.96 → strain 46 (low)
 *    daysSinceLastRest = 1 → strain contrib 30
 *    mood = 9, energy = 9, hydration = 1.0, routine = 1.0
 *    Recovery ≈ 100*0.4 + 100*0.2 + 95*0.25 + 100*0.15 = 98.75 → 99
 *    Strain ≈ 46*0.7 + 30*0.3 = 32.2 + 9 = 41.2 → 41 (LOW)
 *    Lifestyle ≈ 90*0.3 + 90*0.3 + 100*0.25 + 100*0.15 = 27+27+25+15 = 94
 *    peakState = 99*0.6 + 94*0.3 + (100-41)*0.1 = 59.4 + 28.2 + 5.9 = 93.5 → 94
 *    recommendation: recovery 99 (high) + strain 41 (low) → "go_hard"
 *
 * 4. BURNOUT case — HRV crashed, RHR up, bad sleep, high cardio load.
 *    hrvToday = 20ms vs mean 50, sd 10 → z=−3 → score 0
 *    rhrToday = 75 vs mean 60, sd 4 → z=+3.75 → score 0
 *    sleepScore = 55, sleepDebt = 8h
 *    cardioLoad7d = 360, 4wk avg = 240 → ratio 1.5 → strain 100 (cap)
 *    daysSinceLastRest = 8 → strain contrib 90 (cap)
 *    mood = 4, energy = 3, hydration = 0.5, routine = 0.25
 *    Recovery ≈ 0*0.4 + 0*0.2 + 55*0.25 + ((14-8)/14*100)*0.15
 *             = 0 + 0 + 13.75 + 6.43 ≈ 20.2 → 20
 *    Strain ≈ 100*0.7 + 90*0.3 = 70 + 27 = 97 → 97 (HIGH)
 *    Lifestyle ≈ 40*0.3 + 30*0.3 + 50*0.25 + 25*0.15 = 12+9+12.5+3.75 = 37.25
 *    peakState = 20*0.6 + 37*0.3 + (100-97)*0.1 = 12 + 11.1 + 0.3 = 23.4 → 23
 *    recommendation: recovery 20 (low) + strain 97 (high) → "full_rest"
 *
 * 5. BASELINE BUILDING — only 9 days of HRV history, today's HRV is 45.
 *    HRV drops out of recovery (its 40% weight redistributes). If the
 *    other recovery inputs (sleep + sleep debt + RHR) are present, the
 *    sub-score reads from those instead.
 *    baselineStatus: { hrv: 9, ... } — UI shows "building" copy.
 *
 * 6. NEUTRAL day — every available input lands at exactly the midpoint.
 *    score(sleepScore)=50, mood=5, energy=5, hydration=0.5, routine=0.5,
 *    HRV z=0, RHR z=0, cardio ratio=1, daysSinceLastRest=3 (score≈50).
 *    Each sub-score is 50. peakState = 50*0.6 + 50*0.3 + 50*0.1 = 50.
 *    contributors all clustered around impact ≈ 0.
 *
 * 7. RECOMMENDATION matrix edge cases (recovery, strain) → label:
 *    (70, 70)  → "maintain"          // boundary inclusive for "high"
 *    (69, 69)  → "train_normal"
 *    (44, 69)  → "active_recovery"
 *    (44, 70)  → "full_rest"
 *    (70, 0)   → "go_hard"
 *    (null, x) → null
 *    (x, null) → null
 *
 * 8. CONTRIBUTORS sorted by |impact|. A score of 100 in HRV against a
 *    score of 80 in Mood: HRV impact = (100-50)*0.4*0.6 = 12. Mood
 *    impact = (80-50)*0.3*0.3 = 2.7. HRV ranks first. The list intent
 *    is "here's what moved the score most" so absolute magnitude.
 */
