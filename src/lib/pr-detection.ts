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
