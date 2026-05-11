"use client";

import { lastNDates, todayStr } from "@/lib/date";
import {
  dayScore,
  streakForHabit,
  longestStreak,
  routineStreak,
  routineLongestStreak,
} from "@/lib/score";
import type {
  DateStr,
  Goal,
  Habit,
  JournalEntry,
  MorningRoutineItem,
} from "@/lib/types";
import { useStore } from "./index";

export function useToday(): DateStr {
  return todayStr();
}

export function useTodayGoals(): Goal[] {
  const today = todayStr();
  return useStore((s) =>
    s.goals
      .filter((g) => g.date === today)
      .sort((a, b) => a.order - b.order)
  );
}

export function useGoalsByDate(date: DateStr) {
  return useStore((s) =>
    s.goals
      .filter((g) => g.date === date)
      .sort((a, b) => a.order - b.order)
  );
}

export function useHabits(): Habit[] {
  return useStore((s) => [...s.habits].sort((a, b) => a.order - b.order));
}

export function useHabitStreak(id: string) {
  const today = todayStr();
  return useStore((s) => {
    const h = s.habits.find((x) => x.id === id);
    if (!h) return 0;
    return streakForHabit(h.history, today);
  });
}

export function useHabitLongestStreak(id: string) {
  return useStore((s) => {
    const h = s.habits.find((x) => x.id === id);
    if (!h) return 0;
    return longestStreak(h.history);
  });
}

export function useHealth(date: DateStr) {
  return useStore((s) => s.health[date]);
}

export function useTodayWorkouts() {
  const today = todayStr();
  return useStore((s) =>
    s.workouts
      .filter((w) => w.date === today)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
}

export function usePlans(date?: DateStr) {
  return useStore((s) =>
    s.plans
      .filter((p) => (date ? p.date === date : true))
      .sort((a, b) => a.order - b.order)
  );
}
export function useWins(date?: DateStr) {
  return useStore((s) =>
    s.wins
      .filter((p) => (date ? p.date === date : true))
      .sort((a, b) => a.order - b.order)
  );
}
export function useStruggles(date?: DateStr) {
  return useStore((s) =>
    s.struggles
      .filter((p) => (date ? p.date === date : true))
      .sort((a, b) => a.order - b.order)
  );
}

export function useJournal() {
  return useStore((s) => s.journal);
}

export function useJournalForDate(date: DateStr): JournalEntry[] {
  return useStore((s) => s.journal.filter((j) => j.date === date));
}

export function useScoreFor(date: DateStr): number {
  return useStore((s) => {
    const goalsForDay = s.goals.filter((g) => g.date === date);
    const journalsForDay = s.journal.filter((j) => j.date === date);
    const health = s.health[date];
    return dayScore({
      goalsForDay,
      habits: s.habits,
      routine: s.routine,
      health,
      journalsForDay,
      date,
    });
  });
}

export function useLastNDayScores(n: number) {
  const dates = lastNDates(n);
  return useStore((s) =>
    dates.map((date) => {
      const goalsForDay = s.goals.filter((g) => g.date === date);
      const journalsForDay = s.journal.filter((j) => j.date === date);
      const health = s.health[date];
      return {
        date,
        score: dayScore({
          goalsForDay,
          habits: s.habits,
          routine: s.routine,
          health,
          journalsForDay,
          date,
        }),
      };
    })
  );
}

export function useLastNHealth(n: number) {
  const dates = lastNDates(n);
  return useStore((s) =>
    dates.map((date) => ({ date, log: s.health[date] }))
  );
}

export function useLastNWorkouts(n: number) {
  return useStore((s) => {
    const dates = new Set(lastNDates(n));
    return s.workouts.filter((w) => dates.has(w.date));
  });
}

export function useLastNHabitHistory(habit: Habit, n: number) {
  const dates = lastNDates(n);
  return dates.map((date) => ({ date, done: !!habit.history[date] }));
}

export function useRoutine(): MorningRoutineItem[] {
  return useStore((s) =>
    [...s.routine].sort((a, b) => a.order - b.order)
  );
}

export function useRoutineStreak(): number {
  const today = todayStr();
  return useStore((s) => routineStreak(s.routine, today));
}

export function useRoutineLongestStreak(): number {
  return useStore((s) => routineLongestStreak(s.routine));
}

export function useRoutineCompletionRate(days: number): number {
  return useStore((s) => {
    if (!s.routine.length) return 0;
    const dates = lastNDates(days);
    const totalItems = dates.length * s.routine.length;
    const completed = dates.reduce(
      (acc, d) => acc + s.routine.filter((r) => r.history[d]?.completed).length,
      0
    );
    return totalItems ? completed / totalItems : 0;
  });
}

/** Returns the avg time-of-day (in minutes since midnight) the routine
 * was fully completed, over the last N days. Null if not enough data. */
export function useRoutineAvgCompletionMin(days: number): number | null {
  return useStore((s) => {
    if (!s.routine.length) return null;
    const dates = lastNDates(days);
    const finishMins: number[] = [];
    for (const date of dates) {
      const stamps: number[] = [];
      let allDone = true;
      for (const r of s.routine) {
        const entry = r.history[date];
        if (!entry?.completed) {
          allDone = false;
          break;
        }
        if (entry.completedAt) {
          const t = new Date(entry.completedAt);
          stamps.push(t.getHours() * 60 + t.getMinutes());
        }
      }
      if (allDone && stamps.length) {
        finishMins.push(Math.max(...stamps));
      }
    }
    if (!finishMins.length) return null;
    return Math.round(
      finishMins.reduce((a, b) => a + b, 0) / finishMins.length
    );
  });
}

export function useRoutinePerItemRate(
  days: number
): Array<{ id: string; name: string; icon: string; pct: number }> {
  return useStore((s) => {
    const dates = lastNDates(days);
    return [...s.routine]
      .sort((a, b) => a.order - b.order)
      .map((r) => {
        const done = dates.filter((d) => r.history[d]?.completed).length;
        return {
          id: r.id,
          name: r.name,
          icon: r.icon,
          pct: Math.round((done / dates.length) * 100),
        };
      });
  });
}

/** Builds a compact context payload for the AI. */
export function useOverseerContext() {
  const today = todayStr();
  return useStore((s) => {
    const last7 = lastNDates(7);
    const last14 = lastNDates(14);

    const routineTodayDone = s.routine.filter(
      (r) => r.history[today]?.completed
    ).length;
    const routineCompletedAtToday = s.routine
      .map((r) => r.history[today]?.completedAt)
      .filter(Boolean) as string[];
    const finalCompletionStamp =
      routineCompletedAtToday.length === s.routine.length &&
      routineCompletedAtToday.length > 0
        ? routineCompletedAtToday.sort().slice(-1)[0]
        : null;

    const skippedCounts: Array<{ name: string; skipped: number }> = s.routine
      .map((r) => ({
        name: r.name,
        skipped: last14.filter((d) => !r.history[d]?.completed).length,
      }))
      .sort((a, b) => b.skipped - a.skipped)
      .slice(0, 5);

    const last7RoutineDone = last7.reduce(
      (acc, d) =>
        acc + s.routine.filter((r) => r.history[d]?.completed).length,
      0
    );
    const last7RoutineTotal = last7.length * s.routine.length;

    return {
      today,
      dayType: s.days[today]?.dayType ?? "",
      reminder: s.days[today]?.reminder ?? "",
      goalsToday: s.goals
        .filter((g) => g.date === today)
        .map((g) => ({
          text: g.text,
          done: g.completed,
          priority: g.priority,
          emoji: g.emoji,
          category: g.category,
        })),
      habits: s.habits.map((h) => ({
        name: h.name,
        doneToday: !!h.history[today],
        streak: streakForHabit(h.history, today),
      })),
      morningRoutine: {
        total: s.routine.length,
        doneToday: routineTodayDone,
        items: s.routine
          .sort((a, b) => a.order - b.order)
          .map((r) => ({
            name: r.name,
            doneToday: !!r.history[today]?.completed,
            completedAt: r.history[today]?.completedAt,
          })),
        completedAtToday: finalCompletionStamp,
        currentStreak: routineStreak(s.routine, today),
        last7DayRatePct: last7RoutineTotal
          ? Math.round((last7RoutineDone / last7RoutineTotal) * 100)
          : 0,
        mostSkipped14d: skippedCounts,
      },
      workoutsToday: s.workouts
        .filter((w) => w.date === today)
        .map((w) => ({
          type: w.type,
          durationMin: w.durationMin,
          intensity: w.intensity,
        })),
      health: s.health[today],
      plansTomorrow: s.plans
        .filter((p) => p.date === today)
        .map((p) => p.text),
      winsToday: s.wins.filter((w) => w.date === today).map((w) => w.text),
      strugglesToday: s.struggles
        .filter((x) => x.date === today)
        .map((x) => x.text),
      last7DaysSummary: last7.map((date) => ({
        date,
        goalsDone: s.goals.filter((g) => g.date === date && g.completed).length,
        goalsTotal: s.goals.filter((g) => g.date === date).length,
        sleepHours: s.health[date]?.sleepHours,
        mood: s.health[date]?.mood,
        energy: s.health[date]?.energy,
        habitsDone: s.habits.filter((h) => h.history[date]).length,
        habitsTotal: s.habits.length,
        morningDone: s.routine.filter((r) => r.history[date]?.completed)
          .length,
        morningTotal: s.routine.length,
      })),
      recentJournal: s.journal.slice(0, 3).map((j) => ({
        date: j.date,
        snippet: j.text.slice(0, 200),
        mood: j.mood,
      })),
    };
  });
}

export type OverseerContext = ReturnType<typeof useOverseerContext>;
