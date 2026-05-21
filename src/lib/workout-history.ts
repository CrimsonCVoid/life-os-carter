/**
 * Look up the most recent prior session that contained a given exercise.
 * Used by the active-workout sheet to show "Last time: 185×8, 185×8, 175×6"
 * above the input pad, RepCount-style.
 */

import type { LiftExercise, LiftSession, LiftSet } from "@/lib/types";

export type ExerciseLastSession = {
  date: string;       // YYYY-MM-DD
  sets: LiftSet[];
  daysAgo: number;
  /** Top working set (highest weight × highest reps tie-break) for quick PR check. */
  topSet: LiftSet | null;
} | null;

function tieBreakTop(a: LiftSet, b: LiftSet): LiftSet {
  if (a.weight !== b.weight) return a.weight > b.weight ? a : b;
  return a.reps >= b.reps ? a : b;
}

export function findLastSessionFor(
  sessions: LiftSession[],
  exerciseName: string
): ExerciseLastSession {
  const norm = exerciseName.trim().toLowerCase();
  if (!norm) return null;
  // Newest first.
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const sess of ordered) {
    const found = sess.exercises.find(
      (e: LiftExercise) => e.normalizedName === norm
    );
    if (found && found.sets.length > 0) {
      const topSet = found.sets.reduce<LiftSet>(
        (acc, s) => tieBreakTop(acc, s),
        found.sets[0]
      );
      return {
        date: sess.date,
        sets: found.sets,
        daysAgo: daysBetween(sess.date),
        topSet,
      };
    }
  }
  return null;
}

function daysBetween(dateStr: string): number {
  const then = new Date(dateStr + "T00:00:00").getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.max(0, now.getTime() - then) / 86_400_000;
  return Math.round(diff);
}

export function formatSetsCompact(sets: LiftSet[]): string {
  return sets
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => `${s.weight > 0 ? s.weight : "BW"}×${s.reps}`)
    .join(", ");
}

export function formatDaysAgo(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n}d ago`;
  if (n < 30) return `${Math.round(n / 7)}w ago`;
  if (n < 365) return `${Math.round(n / 30)}mo ago`;
  return `${Math.round(n / 365)}y ago`;
}
