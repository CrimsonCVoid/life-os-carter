"use client";

import { lastNDates, todayStr } from "@/lib/date";
import { dayScore, streakForHabit, longestStreak } from "@/lib/score";
import type { DateStr, Goal, Habit, JournalEntry } from "@/lib/types";
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

/** Builds a compact context payload for the AI. */
export function useOverseerContext() {
  const today = todayStr();
  return useStore((s) => {
    const last7 = lastNDates(7);
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
