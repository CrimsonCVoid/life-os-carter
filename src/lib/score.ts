import type {
  Goal,
  Habit,
  HealthLog,
  JournalEntry,
  MorningRoutineItem,
  DateStr,
} from "./types";

type ScoreInputs = {
  goalsForDay: Goal[];
  habits: Habit[];
  routine: MorningRoutineItem[];
  health?: HealthLog;
  journalsForDay: JournalEntry[];
  date: DateStr;
};

/**
 * Compute a 0..1 score for a given day.
 * weights: goals 35%, habits 25%, morning routine 25%,
 *          journaled 10%, sleep logged 5%
 */
export function dayScore({
  goalsForDay,
  habits,
  routine,
  health,
  journalsForDay,
  date,
}: ScoreInputs): number {
  const goalsPart = goalsForDay.length
    ? goalsForDay.filter((g) => g.completed).length / goalsForDay.length
    : 0;

  const activeHabits = habits.length;
  const doneHabits = activeHabits
    ? habits.filter((h) => h.history[date]).length / activeHabits
    : 0;

  const totalRoutine = routine.length;
  const doneRoutine = totalRoutine
    ? routine.filter((r) => r.history[date]?.completed).length / totalRoutine
    : 0;

  const journaled = journalsForDay.length > 0 ? 1 : 0;
  const sleepLogged = health?.sleepHours ? 1 : 0;

  const score =
    goalsPart * 0.35 +
    doneHabits * 0.25 +
    doneRoutine * 0.25 +
    journaled * 0.1 +
    sleepLogged * 0.05;

  return Math.max(0, Math.min(1, score));
}

export function routineStreak(
  routine: MorningRoutineItem[],
  today: DateStr
): number {
  if (!routine.length) return 0;
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    const allDone = routine.every((r) => r.history[key]?.completed);
    if (allDone) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      // allow today not-yet-done without breaking streak
      if (key === today && streak === 0) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}

export function routineLongestStreak(
  routine: MorningRoutineItem[]
): number {
  if (!routine.length) return 0;
  // collect all dates where ALL items completed
  const dateSet = new Set<string>();
  // start from any item's history keys
  const allDates = new Set<string>();
  for (const r of routine) {
    for (const k of Object.keys(r.history)) allDates.add(k);
  }
  for (const d of allDates) {
    if (routine.every((r) => r.history[d]?.completed)) dateSet.add(d);
  }
  const sorted = Array.from(dateSet).sort();
  if (!sorted.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const next = new Date(sorted[i]);
    const diff = Math.round(
      (next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === 1) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

export function streakForHabit(
  history: Record<DateStr, boolean>,
  today: DateStr
): number {
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (history[key]) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      // allow today not-yet-done without breaking streak
      if (key === today && streak === 0) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}

export function longestStreak(history: Record<DateStr, boolean>): number {
  const keys = Object.keys(history).filter((k) => history[k]).sort();
  if (!keys.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1]);
    const next = new Date(keys[i]);
    const diff = Math.round(
      (next.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === 1) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}
