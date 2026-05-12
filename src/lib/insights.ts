import type { DateStr } from "./types";
import { lastNDates } from "./date";
import { useStore } from "@/store";
import { streakForHabit, routineStreak } from "./score";
import { shouldGenerateForDate } from "./recurrence";

/**
 * Normalize a pattern headline to a stable fingerprint for dismiss tracking.
 * Lowercases, strips non-alphanumeric, clamps length. Patterns that say
 * effectively the same thing collapse to the same fingerprint.
 */
export function fingerprintHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/** Compute the Sunday→Saturday boundaries for the week containing `date`. */
export function weekBounds(date: DateStr): { start: DateStr; end: DateStr } {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  const start = new Date(d);
  start.setDate(d.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate()
    ).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

/**
 * Compact 30-day summary of the user's data. Stays under ~3KB so the
 * Gemini call is fast and the model isn't drowning in noise.
 */
export function buildInsightsContext30d() {
  const s = useStore.getState();
  const days = lastNDates(30);

  const goalsByDay = days.map((d) => {
    const dayGoals = s.goals.filter((g) => g.date === d);
    return {
      date: d,
      total: dayGoals.length,
      done: dayGoals.filter((g) => g.completed).length,
    };
  });

  const habitsByDay = days.map((d) => {
    const total = s.habits.length;
    const done = s.habits.filter((h) => h.history[d]).length;
    return { date: d, total, done };
  });

  const morningByDay = days.map((d) => {
    const total = s.routine.length;
    const done = s.routine.filter((r) => r.history[d]?.completed).length;
    // Average completion time when all done
    const stamps = s.routine
      .map((r) => r.history[d]?.completedAt)
      .filter(Boolean) as string[];
    const allDone = done === total && total > 0;
    let finishMin: number | null = null;
    if (allDone && stamps.length) {
      const last = [...stamps].sort().slice(-1)[0];
      const dt = new Date(last);
      finishMin = dt.getHours() * 60 + dt.getMinutes();
    }
    return { date: d, total, done, finishMin };
  });

  const eveningByDay = days.map((d) => {
    const total = s.evening.length;
    const done = s.evening.filter((r) => r.history[d]?.completed).length;
    return { date: d, total, done };
  });

  const health = days.map((d) => ({
    date: d,
    sleepHours: s.health[d]?.sleepHours,
    sleepQuality: s.health[d]?.sleepQuality,
    mood: s.health[d]?.mood,
    water: s.health[d]?.waterOz,
    weight: s.health[d]?.weight,
    steps: s.health[d]?.steps,
  }));

  const workoutsByType: Record<string, number> = {};
  for (const w of s.workouts) {
    if (!days.includes(w.date)) continue;
    workoutsByType[w.type] = (workoutsByType[w.type] ?? 0) + 1;
  }

  const nutritionByDay = days.map((d) => {
    const meals = s.meals.filter((m) => m.date === d);
    const totals = meals.reduce(
      (a, m) => ({
        calories: a.calories + m.calories,
        protein: a.protein + m.protein,
      }),
      { calories: 0, protein: 0 }
    );
    return { date: d, calories: totals.calories, protein: totals.protein };
  });

  const recurringStats = s.recurringGoals
    .filter((r) => r.active)
    .map((r) => {
      let scheduled = 0;
      let completed = 0;
      for (const d of days) {
        if (!shouldGenerateForDate(r, d)) continue;
        scheduled += 1;
        const gen = s.recurringGenerations.find(
          (g) => g.recurringGoalId === r.id && g.date === d
        );
        if (gen) {
          const goal = s.goals.find((g) => g.id === gen.generatedGoalId);
          if (goal?.completed) completed += 1;
        }
      }
      return {
        text: r.text,
        pattern: r.pattern,
        scheduled,
        completed,
        pct: scheduled > 0 ? Math.round((completed / scheduled) * 100) : null,
      };
    });

  const journalCount = s.journal.filter((j) => days.includes(j.date)).length;
  const voiceJournalCount = s.journal.filter(
    (j) => days.includes(j.date) && j.source === "voice"
  ).length;

  const today = days[days.length - 1];
  const habitStreaks = s.habits.map((h) => ({
    name: h.name,
    streak: streakForHabit(h.history, today),
  }));
  const morningStreak = routineStreak(s.routine, today);
  const eveningStreak = routineStreak(s.evening, today);

  return {
    today,
    days,
    goalsByDay,
    habitsByDay,
    morningByDay,
    eveningByDay,
    health,
    workoutsByType,
    nutritionByDay,
    recurringStats,
    journalCount,
    voiceJournalCount,
    habitStreaks,
    morningStreak,
    eveningStreak,
    nutritionEnabled: s.settings.nutrition.enabled,
    nutritionTargets: {
      calories: s.settings.nutrition.calories,
      protein: s.settings.nutrition.protein,
    },
  };
}

export type InsightsContext30d = ReturnType<typeof buildInsightsContext30d>;

/**
 * 7-day window for weekly review. Lighter slice than the 30-day insights
 * context — focuses on the specific Sun→Sat range.
 */
export function buildWeeklyContext(
  weekStart: DateStr,
  weekEnd: DateStr
) {
  const s = useStore.getState();
  const start = new Date(weekStart);
  const days: DateStr[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  const dayRows = days.map((d) => ({
    date: d,
    goalsDone: s.goals.filter((g) => g.date === d && g.completed).length,
    goalsTotal: s.goals.filter((g) => g.date === d).length,
    habitsDone: s.habits.filter((h) => h.history[d]).length,
    habitsTotal: s.habits.length,
    morningDone: s.routine.filter((r) => r.history[d]?.completed).length,
    morningTotal: s.routine.length,
    eveningDone: s.evening.filter((r) => r.history[d]?.completed).length,
    eveningTotal: s.evening.length,
    sleepHours: s.health[d]?.sleepHours,
    sleepQuality: s.health[d]?.sleepQuality,
    mood: s.health[d]?.mood,
    weight: s.health[d]?.weight,
    steps: s.health[d]?.steps,
    waterOz: s.health[d]?.waterOz,
    workoutType: s.workouts.find((w) => w.date === d)?.type ?? null,
    workoutDuration: s.workouts.find((w) => w.date === d)?.durationMin ?? null,
    mealsLogged: s.meals.filter((m) => m.date === d).length,
    caloriesLogged: s.meals
      .filter((m) => m.date === d)
      .reduce((a, m) => a + m.calories, 0),
    proteinLogged: s.meals
      .filter((m) => m.date === d)
      .reduce((a, m) => a + m.protein, 0),
    journaled: s.journal.some((j) => j.date === d),
  }));

  const liftSessions = s.liftSessions
    .filter((l) => days.includes(l.date))
    .map((l) => ({
      date: l.date,
      exerciseCount: l.exercises.length,
      topByName: l.exercises.map((ex) => {
        const top = [...ex.sets].sort(
          (a, b) => b.weight - a.weight || b.reps - a.reps
        )[0];
        return top
          ? { name: ex.name, weight: top.weight, reps: top.reps }
          : null;
      }).filter(Boolean),
    }));

  return {
    weekStart,
    weekEnd,
    days: dayRows,
    liftSessions,
    recurringGoals: s.recurringGoals
      .filter((r) => r.active)
      .map((r) => ({
        text: r.text,
        pattern: r.pattern,
      })),
  };
}

export type WeeklyContext = ReturnType<typeof buildWeeklyContext>;
