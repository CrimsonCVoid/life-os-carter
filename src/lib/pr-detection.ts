import type { LiftSession, LiftSet } from "@/lib/types";
import { estimated1RM } from "@/lib/repcount";

export type PRType =
  | "top-set-weight"
  | "top-set-reps"
  | "e1rm"
  | "volume";

export type PR = {
  exerciseName: string;
  normalizedName: string;
  type: PRType;
  previousValue: number;
  newValue: number;
  delta: number;
  contextReps?: number;
};

const E1RM_EPSILON = 0.05;

const TYPE_PRIORITY: Record<PRType, number> = {
  "top-set-weight": 0,
  "top-set-reps": 1,
  e1rm: 2,
  volume: 3,
};

function topWeightAndReps(sets: LiftSet[]): { weight: number; reps: number } {
  let weight = 0;
  let reps = 0;
  for (const s of sets) {
    if (s.weight > weight) {
      weight = s.weight;
      reps = s.reps;
    } else if (s.weight === weight && s.reps > reps) {
      reps = s.reps;
    }
  }
  return { weight, reps };
}

function sumVolume(sets: LiftSet[]): number {
  let v = 0;
  for (const s of sets) v += s.weight * s.reps;
  return v;
}

function maxE1RM(sets: LiftSet[]): number {
  let best = 0;
  for (const s of sets) {
    const e = estimated1RM(s.weight, s.reps);
    if (e > best) best = e;
  }
  return best;
}

export function detectPRs(
  newSession: LiftSession,
  history: LiftSession[]
): PR[] {
  const prior = history.filter((s) => s.id !== newSession.id);

  const prs: PR[] = [];

  for (const ex of newSession.exercises) {
    const key = ex.normalizedName;
    if (!ex.sets.length) continue;

    const newTop = topWeightAndReps(ex.sets);
    const newE1 = maxE1RM(ex.sets);
    const newVol = sumVolume(ex.sets);

    let prevTopWeight = 0;
    let prevTopWeightReps = 0;
    let prevE1 = 0;
    let prevVol = 0;

    for (const sess of prior) {
      for (const pex of sess.exercises) {
        if (pex.normalizedName !== key) continue;
        const t = topWeightAndReps(pex.sets);
        if (t.weight > prevTopWeight) {
          prevTopWeight = t.weight;
          prevTopWeightReps = t.reps;
        } else if (t.weight === prevTopWeight && t.reps > prevTopWeightReps) {
          prevTopWeightReps = t.reps;
        }
        const e = maxE1RM(pex.sets);
        if (e > prevE1) prevE1 = e;
        const v = sumVolume(pex.sets);
        if (v > prevVol) prevVol = v;
      }
    }

    const exPRs: PR[] = [];

    if (newTop.weight > prevTopWeight && newTop.weight > 0) {
      exPRs.push({
        exerciseName: ex.name,
        normalizedName: key,
        type: "top-set-weight",
        previousValue: prevTopWeight,
        newValue: newTop.weight,
        delta: newTop.weight - prevTopWeight,
        contextReps: newTop.reps,
      });
    } else if (
      newTop.weight > 0 &&
      newTop.weight === prevTopWeight &&
      newTop.reps > prevTopWeightReps
    ) {
      exPRs.push({
        exerciseName: ex.name,
        normalizedName: key,
        type: "top-set-reps",
        previousValue: prevTopWeightReps,
        newValue: newTop.reps,
        delta: newTop.reps - prevTopWeightReps,
      });
    }

    if (newE1 > prevE1 + E1RM_EPSILON) {
      const roundedNew = Math.round(newE1 * 10) / 10;
      const roundedPrev = Math.round(prevE1 * 10) / 10;
      exPRs.push({
        exerciseName: ex.name,
        normalizedName: key,
        type: "e1rm",
        previousValue: roundedPrev,
        newValue: roundedNew,
        delta: Math.round((roundedNew - roundedPrev) * 10) / 10,
      });
    }

    if (newVol > prevVol && newVol > 0) {
      exPRs.push({
        exerciseName: ex.name,
        normalizedName: key,
        type: "volume",
        previousValue: prevVol,
        newValue: newVol,
        delta: newVol - prevVol,
      });
    }

    exPRs.sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
    prs.push(...exPRs);
  }

  return prs;
}

/* ------------------------------------------------------------------------- */
/* All-time records (for the per-exercise deep-dive page)                    */
/* ------------------------------------------------------------------------- */

export type ExerciseRecord = {
  topSetWeight: { value: number; reps: number; date: string } | null;
  topSetReps: { value: number; weight: number; date: string } | null;
  e1rm: { value: number; date: string } | null;
  sessionVolume: { value: number; date: string } | null;
};

/**
 * Compute all-time records for a single exercise across the given sessions.
 * `normalizedName` is the canonical key — every LiftExercise stores one.
 */
export function allTimeRecords(
  normalizedName: string,
  sessions: LiftSession[]
): ExerciseRecord {
  const out: ExerciseRecord = {
    topSetWeight: null,
    topSetReps: null,
    e1rm: null,
    sessionVolume: null,
  };
  for (const sess of sessions) {
    for (const ex of sess.exercises) {
      if (ex.normalizedName !== normalizedName) continue;
      const vol = sumVolume(ex.sets);
      if (vol > 0 && (!out.sessionVolume || vol > out.sessionVolume.value)) {
        out.sessionVolume = { value: vol, date: sess.date };
      }
      for (const s of ex.sets) {
        if (s.weight > 0) {
          if (!out.topSetWeight || s.weight > out.topSetWeight.value) {
            out.topSetWeight = {
              value: s.weight,
              reps: s.reps,
              date: sess.date,
            };
          }
          const e1 = estimated1RM(s.weight, s.reps);
          if (!out.e1rm || e1 > out.e1rm.value) {
            out.e1rm = { value: Math.round(e1 * 10) / 10, date: sess.date };
          }
        }
        if (!out.topSetReps || s.reps > out.topSetReps.value) {
          out.topSetReps = {
            value: s.reps,
            weight: s.weight,
            date: sess.date,
          };
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Per-rep-range PRs (RepCount-style "best at 5 reps", "best at 8", etc.)    */
/* ------------------------------------------------------------------------- */

/** Standard rep-range buckets. Each PR = heaviest weight where reps >= bucket. */
export const REP_RANGE_BUCKETS = [1, 3, 5, 8, 10, 12, 15] as const;

export type RepRangePR = {
  reps: number;            // bucket label
  weight: number;          // heaviest weight achieved at >= this many reps
  actualReps: number;      // reps logged at that weight
  date: string;
};

export function repRangePRs(
  normalizedName: string,
  sessions: LiftSession[]
): RepRangePR[] {
  const out: RepRangePR[] = [];
  for (const bucket of REP_RANGE_BUCKETS) {
    let best: RepRangePR | null = null;
    for (const sess of sessions) {
      for (const ex of sess.exercises) {
        if (ex.normalizedName !== normalizedName) continue;
        for (const s of ex.sets) {
          if (s.weight <= 0) continue;
          if (s.reps < bucket) continue;
          if (!best || s.weight > best.weight) {
            best = {
              reps: bucket,
              weight: s.weight,
              actualReps: s.reps,
              date: sess.date,
            };
          }
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Compound (per-session) records — max reps / sets / volume in a session    */
/* ------------------------------------------------------------------------- */

export type CompoundRecord = {
  label: string;
  value: number;
  unit: string;
  date: string;
};

/** Cross-exercise per-session bests across all liftSessions. */
export function compoundRecords(sessions: LiftSession[]): CompoundRecord[] {
  let mostReps = { value: 0, date: "" };
  let mostSets = { value: 0, date: "" };
  let mostVolume = { value: 0, date: "" };
  let mostExercises = { value: 0, date: "" };
  for (const sess of sessions) {
    let reps = 0;
    let sets = 0;
    let volume = 0;
    for (const ex of sess.exercises) {
      sets += ex.sets.length;
      for (const s of ex.sets) {
        reps += s.reps;
        volume += s.weight * s.reps;
      }
    }
    if (reps > mostReps.value) mostReps = { value: reps, date: sess.date };
    if (sets > mostSets.value) mostSets = { value: sets, date: sess.date };
    if (volume > mostVolume.value)
      mostVolume = { value: Math.round(volume), date: sess.date };
    if (sess.exercises.length > mostExercises.value)
      mostExercises = { value: sess.exercises.length, date: sess.date };
  }
  const out: CompoundRecord[] = [];
  if (mostVolume.value > 0)
    out.push({ label: "Most volume in a session", value: mostVolume.value, unit: "lb", date: mostVolume.date });
  if (mostReps.value > 0)
    out.push({ label: "Most reps in a session", value: mostReps.value, unit: "reps", date: mostReps.date });
  if (mostSets.value > 0)
    out.push({ label: "Most sets in a session", value: mostSets.value, unit: "sets", date: mostSets.date });
  if (mostExercises.value > 0)
    out.push({ label: "Most exercises in a session", value: mostExercises.value, unit: "ex", date: mostExercises.date });
  return out;
}

/* ------------------------------------------------------------------------- */
/* Year helpers (seasonal best)                                              */
/* ------------------------------------------------------------------------- */

export function yearsWithSessions(sessions: LiftSession[]): number[] {
  const set = new Set<number>();
  for (const s of sessions) {
    const y = Number(s.date.slice(0, 4));
    if (Number.isFinite(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

export function filterSessionsByYear(
  sessions: LiftSession[],
  year: number | null
): LiftSession[] {
  if (year == null) return sessions;
  const prefix = String(year);
  return sessions.filter((s) => s.date.startsWith(prefix));
}
