import type {
  Goal,
  Habit,
  HealthLog,
  JournalEntry,
  DateStr,
} from "./types";

type ScoreInputs = {
  goalsForDay: Goal[];
  habits: Habit[];
  health?: HealthLog;
  journalsForDay: JournalEntry[];
  date: DateStr;
};

/**
 * Compute a 0..1 score for a given day.
 * weights: goals 40%, habits 30%, journal 15%, sleep logged 15%
 */
export function dayScore({
  goalsForDay,
  habits,
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

  const journaled = journalsForDay.length > 0 ? 1 : 0;
  const sleepLogged = health?.sleepHours ? 1 : 0;

  const score =
    goalsPart * 0.4 + doneHabits * 0.3 + journaled * 0.15 + sleepLogged * 0.15;

  return Math.max(0, Math.min(1, score));
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
