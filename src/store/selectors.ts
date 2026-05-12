"use client";

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import { useSelectedDate } from "@/components/today/day-context";
import { lastNDates, todayStr } from "@/lib/date";
import {
  dayScore,
  streakForHabit,
  longestStreak,
  routineStreak,
  routineLongestStreak,
} from "@/lib/score";
import type {
  Block,
  BlockType,
  BodyMeasurement,
  DateStr,
  EnergyLog,
  EnergyPeriod,
  EveningRoutineItem,
  Goal,
  Habit,
  JournalEntry,
  LiftSession,
  Meal,
  MorningRoutineItem,
  PhotoMeta,
  RecurringGoal,
  RecurringGoalGeneration,
  SavedMeal,
  Workout,
} from "@/lib/types";
import { ENERGY_PERIODS, ENERGY_PERIOD_RANGES } from "@/lib/types";
import { computeRecurringStats, shouldGenerateForDate, patternSummary } from "@/lib/recurrence";
import { useStore } from "./index";

/**
 * The "selected" date — what the Day screen is currently focused on.
 * Equals actual today by default; the Day screen wraps content in a
 * DayProvider that swaps this for the user-navigated date.
 */
export function useToday(): DateStr {
  return useSelectedDate();
}

export function useTodayGoals(): Goal[] {
  const date = useToday();
  return useStore(
    useShallow((s) =>
      s.goals
        .filter((g) => g.date === date)
        .sort((a, b) => a.order - b.order)
    )
  );
}

export function useGoalsByDate(date: DateStr) {
  return useStore(
    useShallow((s) =>
      s.goals
        .filter((g) => g.date === date)
        .sort((a, b) => a.order - b.order)
    )
  );
}

export function useHabits(): Habit[] {
  return useStore(
    useShallow((s) => [...s.habits].sort((a, b) => a.order - b.order))
  );
}

export function useHabitStreak(id: string) {
  // Always relative to actual today — streaks don't make sense
  // when computed from a viewed past/future day.
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
  const date = useToday();
  return useStore(
    useShallow((s) =>
      s.workouts
        .filter((w) => w.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    )
  );
}

export function usePlans(date?: DateStr) {
  return useStore(
    useShallow((s) =>
      s.plans
        .filter((p) => (date ? p.date === date : true))
        .sort((a, b) => a.order - b.order)
    )
  );
}
export function useWins(date?: DateStr) {
  return useStore(
    useShallow((s) =>
      s.wins
        .filter((p) => (date ? p.date === date : true))
        .sort((a, b) => a.order - b.order)
    )
  );
}
export function useStruggles(date?: DateStr) {
  return useStore(
    useShallow((s) =>
      s.struggles
        .filter((p) => (date ? p.date === date : true))
        .sort((a, b) => a.order - b.order)
    )
  );
}

export function useJournal() {
  return useStore((s) => s.journal);
}

export function useJournalForDate(date: DateStr): JournalEntry[] {
  return useStore(
    useShallow((s) => s.journal.filter((j) => j.date === date))
  );
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
      evening: s.evening,
      health,
      journalsForDay,
      date,
    });
  });
}

/**
 * Raw data getters — return the underlying store reference directly so
 * downstream components can `useMemo` derived arrays against stable inputs.
 * Recharts in particular loops if its `data` prop is a new array on every
 * render.
 */
export function useHealthMap() {
  return useStore((s) => s.health);
}
export function useGoalsRaw() {
  return useStore((s) => s.goals);
}
export function useJournalRaw() {
  return useStore((s) => s.journal);
}
export function useWorkoutsRaw() {
  return useStore((s) => s.workouts);
}
export function useHabitsRaw() {
  return useStore((s) => s.habits);
}
export function useRoutineRaw() {
  return useStore((s) => s.routine);
}
export function useBlocksRaw() {
  return useStore((s) => s.blocks);
}
export function useEnergyRaw() {
  return useStore((s) => s.energy);
}
export function useMealsRaw() {
  return useStore((s) => s.meals);
}
export function useSavedMealsRaw() {
  return useStore((s) => s.savedMeals);
}
export function useBodyRaw() {
  return useStore((s) => s.body);
}
export function usePhotosRaw() {
  return useStore((s) => s.photos);
}

/* ---------- TIME BLOCKING ---------- */

export function useScheduleForDay(date: DateStr): Block[] {
  return useStore(
    useShallow((s) =>
      s.blocks
        .filter((b) => b.date === date)
        .sort((a, b) => a.startMin - b.startMin)
    )
  );
}

export function useTotalScheduledMinutes(date: DateStr, type?: BlockType) {
  return useStore((s) =>
    s.blocks
      .filter((b) => b.date === date && (!type || b.type === type))
      .reduce((a, b) => a + (b.endMin - b.startMin), 0)
  );
}

export function useUnscheduledGoals(date: DateStr) {
  return useStore(
    useShallow((s) => {
      const scheduledIds = new Set(
        s.blocks
          .filter((b) => b.date === date && b.goalId)
          .map((b) => b.goalId as string)
      );
      return s.goals
        .filter((g) => g.date === date && !scheduledIds.has(g.id))
        .sort((a, b) => a.order - b.order);
    })
  );
}

/* ---------- ENERGY ---------- */

export function useEnergyForDay(date: DateStr): EnergyLog | undefined {
  return useStore((s) => s.energy[date]);
}

/** Average per period, across the last N days. */
export function computeAverageEnergyByPeriod(
  energy: Record<DateStr, EnergyLog>,
  dates: DateStr[]
): Record<EnergyPeriod, number | null> {
  const sums: Record<EnergyPeriod, { sum: number; n: number }> = {
    morning: { sum: 0, n: 0 },
    midday: { sum: 0, n: 0 },
    afternoon: { sum: 0, n: 0 },
    evening: { sum: 0, n: 0 },
  };
  for (const d of dates) {
    const log = energy[d];
    if (!log) continue;
    for (const p of ENERGY_PERIODS) {
      const v = log.values[p];
      if (v != null) {
        sums[p].sum += v;
        sums[p].n += 1;
      }
    }
  }
  const out: Record<EnergyPeriod, number | null> = {
    morning: null,
    midday: null,
    afternoon: null,
    evening: null,
  };
  for (const p of ENERGY_PERIODS) {
    out[p] = sums[p].n ? sums[p].sum / sums[p].n : null;
  }
  return out;
}

/** Return today's current period based on local hour. */
export function currentPeriod(now = new Date()): EnergyPeriod {
  const h = now.getHours();
  for (const p of ENERGY_PERIODS) {
    const [a, b] = ENERGY_PERIOD_RANGES[p];
    if (h >= a && h < b) return p;
  }
  return "morning";
}

export function averageOfPeriodValues(values: EnergyLog["values"]): number | null {
  const nums = Object.values(values).filter(
    (v): v is number => typeof v === "number"
  );
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/* ---------- NUTRITION ---------- */

export function useMealsForDay(date: DateStr): Meal[] {
  return useStore(
    useShallow((s) =>
      s.meals
        .filter((m) => m.date === date)
        .sort((a, b) => a.time.localeCompare(b.time))
    )
  );
}

export function useTopSavedMeals(n: number): SavedMeal[] {
  return useStore(
    useShallow((s) =>
      [...s.savedMeals]
        .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
        .slice(0, n)
    )
  );
}

export function computeTotalsForDay(meals: Meal[]) {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/* ---------- BODY ---------- */

export function useLatestMeasurement(): BodyMeasurement | undefined {
  return useStore((s) => {
    const sorted = [...s.body].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0];
  });
}

/** Suppress unused-var warnings on types only re-exported for callers. */
export type { Block, BlockType, EnergyPeriod, JournalEntry, Meal, SavedMeal, PhotoMeta, BodyMeasurement };

export function useLastNHabitHistory(habit: Habit, n: number) {
  const dates = lastNDates(n);
  return dates.map((date) => ({ date, done: !!habit.history[date] }));
}

export function useRoutine(): MorningRoutineItem[] {
  return useStore(
    useShallow((s) => [...s.routine].sort((a, b) => a.order - b.order))
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

/* ---------- EVENING ROUTINE ---------- */

export function useEveningRoutine(): EveningRoutineItem[] {
  return useStore(
    useShallow((s) => [...s.evening].sort((a, b) => a.order - b.order))
  );
}

export function useEveningRaw() {
  return useStore((s) => s.evening);
}

export function useEveningStreak(): number {
  const today = todayStr();
  return useStore((s) => routineStreak(s.evening, today));
}

export function useEveningLongestStreak(): number {
  return useStore((s) => routineLongestStreak(s.evening));
}

export function useEveningCompletionRate(days: number): number {
  return useStore((s) => {
    if (!s.evening.length) return 0;
    const dates = lastNDates(days);
    const totalItems = dates.length * s.evening.length;
    const completed = dates.reduce(
      (acc, d) =>
        acc + s.evening.filter((r) => r.history[d]?.completed).length,
      0
    );
    return totalItems ? completed / totalItems : 0;
  });
}

export function useEveningAvgCompletionMin(days: number): number | null {
  return useStore((s) => {
    if (!s.evening.length) return null;
    const dates = lastNDates(days);
    const finishMins: number[] = [];
    for (const date of dates) {
      const stamps: number[] = [];
      let allDone = true;
      for (const r of s.evening) {
        const entry = r.history[date];
        if (!entry?.completed) {
          allDone = false;
          break;
        }
        if (entry.completedAt) {
          const t = new Date(entry.completedAt);
          let mins = t.getHours() * 60 + t.getMinutes();
          // Evening completions can land after midnight — treat them as
          // a continuation of the prior evening for "average wind-down time"
          // by shifting 0-3am into the 24-27h range.
          if (mins < 3 * 60) mins += 24 * 60;
          stamps.push(mins);
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

/* ---------- RECURRING GOALS ---------- */

export function useRecurringGoals(): RecurringGoal[] {
  return useStore(useShallow((s) => s.recurringGoals));
}

export function useActiveRecurringGoals(): RecurringGoal[] {
  return useStore(
    useShallow((s) =>
      s.recurringGoals
        .filter((r) => r.active)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    )
  );
}

export function useRecurringGoalsForDate(date: DateStr): RecurringGoal[] {
  return useStore(
    useShallow((s) =>
      s.recurringGoals.filter(
        (r) => r.active && shouldGenerateForDate(r, date)
      )
    )
  );
}

export function useRecurringGenerations(): RecurringGoalGeneration[] {
  return useStore(useShallow((s) => s.recurringGenerations));
}

/**
 * Get completion rate for a recurring goal over the last N days.
 * Returns null when there were no scheduled days in the window.
 */
export function computeRecurringCompletionRate(
  rg: RecurringGoal,
  days: number,
  generations: RecurringGoalGeneration[],
  goals: Goal[]
): { scheduled: number; completed: number; pct: number | null } {
  const dates = lastNDates(days);
  const completedById = new Map(goals.map((g) => [g.id, g.completed]));
  const { scheduled, completed } = computeRecurringStats(
    rg,
    dates,
    generations,
    completedById
  );
  return {
    scheduled,
    completed,
    pct: scheduled === 0 ? null : Math.round((completed / scheduled) * 100),
  };
}

/** Hook variant — recomputes when relevant slices change. */
export function useRecurringCompletionRate(
  rg: RecurringGoal,
  days: number
): { scheduled: number; completed: number; pct: number | null } {
  return useStore(
    useShallow((s) =>
      computeRecurringCompletionRate(
        rg,
        days,
        s.recurringGenerations,
        s.goals
      )
    )
  );
}

export { patternSummary };

export function computePerItemRate(
  routine: MorningRoutineItem[] | EveningRoutineItem[],
  days: number
): Array<{ id: string; name: string; icon: string; pct: number }> {
  const dates = lastNDates(days);
  return [...routine]
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
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${mm.toString().padStart(2, "0")}${ampm}`;
}

/**
 * Builds a compact context payload for the AI.
 *
 * NOTE: not a hook — call it lazily right before posting to /api/overseer.
 * Subscribing to the entire deeply-nested object via useStore would force
 * every consumer to re-render on every state change (the selector returns
 * a new reference each call and shallow equality can't help for nested
 * data), and that produced an infinite update loop on initial hydration.
 */
/**
 * Pulls the matched {workout, liftSession} for a date — either or both may
 * be present. Used by the unified Gym page to render one row per session.
 */
export function getSessionForDate(
  date: DateStr
): { workout?: Workout; liftSession?: LiftSession } {
  const s = useStore.getState();
  return {
    workout: s.workouts.find((w) => w.date === date),
    liftSession: s.liftSessions.find((l) => l.date === date),
  };
}

export function useUnifiedGymSessions(): Array<{
  date: DateStr;
  workout?: Workout;
  liftSession?: LiftSession;
}> {
  const liftSessions = useStore((s) => s.liftSessions);
  const workouts = useStore((s) => s.workouts);
  return React.useMemo(() => {
    const dates = new Set<DateStr>();
    for (const l of liftSessions) dates.add(l.date);
    for (const w of workouts) dates.add(w.date);
    return [...dates]
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        workout: workouts.find((w) => w.date === date),
        liftSession: liftSessions.find((l) => l.date === date),
      }));
  }, [liftSessions, workouts]);
}

export function getOverseerContext() {
  const today = todayStr();
  const s = useStore.getState();
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
      ? [...routineCompletedAtToday].sort().slice(-1)[0]
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
    eveningRoutine: (() => {
      const today2 = today;
      const totalE = s.evening.length;
      const doneE = s.evening.filter(
        (r) => r.history[today2]?.completed
      ).length;
      const eveningStamps = s.evening
        .map((r) => r.history[today2]?.completedAt)
        .filter(Boolean) as string[];
      const completedAtE =
        eveningStamps.length === totalE && totalE > 0
          ? [...eveningStamps].sort().slice(-1)[0]
          : null;
      const last7E = last7.reduce(
        (acc, d) =>
          acc + s.evening.filter((r) => r.history[d]?.completed).length,
        0
      );
      const last7TotalE = last7.length * totalE;
      const skippedE = s.evening
        .map((r) => ({
          name: r.name,
          skipped: last14.filter((d) => !r.history[d]?.completed).length,
        }))
        .sort((a, b) => b.skipped - a.skipped)
        .slice(0, 5);
      return {
        total: totalE,
        doneToday: doneE,
        completedAtToday: completedAtE,
        currentStreak: routineStreak(s.evening, today2),
        last7DayRatePct: last7TotalE
          ? Math.round((last7E / last7TotalE) * 100)
          : 0,
        items: [...s.evening]
          .sort((a, b) => a.order - b.order)
          .map((r) => ({
            name: r.name,
            doneToday: !!r.history[today2]?.completed,
            completedAt: r.history[today2]?.completedAt,
          })),
        mostSkipped14d: skippedE,
      };
    })(),
    morningRoutine: {
      total: s.routine.length,
      doneToday: routineTodayDone,
      items: [...s.routine]
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
      morningDone: s.routine.filter((r) => r.history[date]?.completed).length,
      morningTotal: s.routine.length,
    })),
    recentJournal: s.journal.slice(0, 3).map((j) => ({
      date: j.date,
      snippet: j.text.slice(0, 200),
      mood: j.mood,
    })),
    recentVoiceSummaries: s.journal
      .filter((j) => j.source === "voice")
      .slice(0, 3)
      .map((j) => ({
        date: j.date,
        summary: (j.summary ?? j.text).slice(0, 240),
        mood: j.mood,
        moodWord: j.moodWord,
      })),
    scheduleToday: [...s.blocks]
      .filter((b) => b.date === today)
      .sort((a, b) => a.startMin - b.startMin)
      .map((b) => {
        const linkedGoal = b.goalId
          ? s.goals.find((g) => g.id === b.goalId)
          : undefined;
        return {
          start: fmtMin(b.startMin),
          end: fmtMin(b.endMin),
          type: b.type,
          title: b.title,
          done: linkedGoal?.completed ?? false,
        };
      }),
    energyToday: s.energy[today]?.values ?? null,
    nutritionToday: s.settings.nutrition.enabled
      ? (() => {
          const meals = s.meals.filter((m) => m.date === today);
          const totals = meals.reduce(
            (acc, m) => ({
              calories: acc.calories + m.calories,
              protein: acc.protein + m.protein,
              carbs: acc.carbs + (m.carbs ?? 0),
              fat: acc.fat + (m.fat ?? 0),
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );
          const proteinByDay = last7.map((d) => {
            const dm = s.meals.filter((m) => m.date === d);
            return dm.reduce((a, m) => a + m.protein, 0);
          });
          const valid = proteinByDay.filter((n) => n > 0);
          const proteinAvg7 = valid.length
            ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
            : null;
          return {
            totals,
            targets: s.settings.nutrition,
            proteinAvg7,
          };
        })()
      : null,
    bodyLatest: (() => {
      const sorted = [...s.body].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const m = sorted[0];
      if (!m) return null;
      return {
        date: m.date,
        weight: m.weight,
        bodyFatPct: m.bodyFatPct,
        chest: m.chest,
        waist: m.waist,
      };
    })(),
    currentPattern: (() => {
      const c = s.cachedPatterns;
      if (!c || c.patterns.length === 0) return null;
      const p = c.patterns[c.currentIndex];
      if (!p) return null;
      return {
        headline: p.headline,
        tone: p.tone,
        metric: p.metric,
        dataPoint: p.dataPoint,
        generatedOn: c.date,
      };
    })(),
    recentWeeklyReviews: [...s.weeklyReviews]
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 4)
      .map((r) => ({
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        summary: r.summary,
        wins: r.wins,
        struggles: r.struggles,
        trends: r.trends,
        nextWeekPriorities: r.nextWeekPriorities,
      })),
    recurringGoals: (() => {
      const goalCompletedById = new Map(
        s.goals.map((g) => [g.id, g.completed])
      );
      const last30 = lastNDates(30);
      const last14 = lastNDates(14);
      return s.recurringGoals
        .filter((r) => r.active)
        .map((r) => {
          const stats30 = computeRecurringStats(
            r,
            last30,
            s.recurringGenerations,
            goalCompletedById
          );
          const stats14 = computeRecurringStats(
            r,
            last14,
            s.recurringGenerations,
            goalCompletedById
          );
          const rate30 =
            stats30.scheduled === 0
              ? null
              : Math.round((stats30.completed / stats30.scheduled) * 100);
          const rate14 =
            stats14.scheduled === 0
              ? null
              : Math.round((stats14.completed / stats14.scheduled) * 100);
          return {
            text: r.text,
            pattern: patternSummary(r),
            scheduled30: stats30.scheduled,
            completed30: stats30.completed,
            rate30Pct: rate30,
            rate14Pct: rate14,
            struggling: rate14 != null && rate14 < 50,
          };
        });
    })(),
  };
}

export type OverseerContext = ReturnType<typeof getOverseerContext>;
