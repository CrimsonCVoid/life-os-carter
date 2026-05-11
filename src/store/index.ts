"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { todayStr } from "@/lib/date";
import { shouldGenerateForDate } from "@/lib/recurrence";
import { uid } from "@/lib/utils";
import {
  DEFAULT_DAY_TYPES,
  DEFAULT_MORNING_ROUTINE,
  DEFAULT_MORNING_ROUTINE_SETTINGS,
  DEFAULT_VOICE_JOURNAL_SETTINGS,
  Block,
  BlockType,
  BodyMeasurement,
  Day,
  EnergyLog,
  EnergyPeriod,
  ENERGY_PERIODS,
  ENERGY_PERIOD_RANGES,
  Goal,
  Habit,
  HABIT_TEMPLATES,
  HealthLog,
  JournalEntry,
  ListItem,
  Meal,
  MorningRoutineItem,
  MorningRoutineSettings,
  NutritionTargets,
  PhotoAngle,
  PhotoMeta,
  Plan,
  RecurringGoal,
  RecurringGoalGeneration,
  SavedMeal,
  Settings,
  VoiceJournalSettings,
  Struggle,
  Win,
  Workout,
  CachedBriefing,
  Priority,
  AccentColor,
  Units,
  HabitIcon,
  DateStr,
  ChatMessage,
} from "@/lib/types";

const STORE_VERSION = 2;

type State = {
  hydrated: boolean;
  settings: Settings;
  days: Record<DateStr, Day>;
  goals: Goal[];
  habits: Habit[];
  workouts: Workout[];
  health: Record<DateStr, HealthLog>;
  journal: JournalEntry[];
  plans: Plan[];
  wins: Win[];
  struggles: Struggle[];
  routine: MorningRoutineItem[];
  blocks: Block[];
  energy: Record<DateStr, EnergyLog>;
  meals: Meal[];
  savedMeals: SavedMeal[];
  body: BodyMeasurement[];
  photos: PhotoMeta[];
  recurringGoals: RecurringGoal[];
  recurringGenerations: RecurringGoalGeneration[];
};

type Actions = {
  // hydration
  setHydrated: () => void;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;
  setAccent: (a: AccentColor) => void;
  setUnits: (u: Partial<Units>) => void;
  setWaterTarget: (oz: number) => void;
  addDayType: (name: string) => void;
  removeDayType: (name: string) => void;
  setMorningBriefing: (b: CachedBriefing) => void;
  setEveningSummary: (b: CachedBriefing) => void;

  // days
  setDayType: (date: DateStr, type: string) => void;
  setReminder: (date: DateStr, reminder: string) => void;

  // goals
  addGoal: (input: Omit<Goal, "id" | "date" | "completed" | "order">) => void;
  toggleGoal: (id: string) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  removeGoal: (id: string) => void;
  reorderGoals: (date: DateStr, orderedIds: string[]) => void;
  moveToToday: (planId: string) => void;

  // habits
  addHabit: (name: string, icon: HabitIcon) => void;
  toggleHabit: (id: string, date?: DateStr) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  removeHabit: (id: string) => void;
  reorderHabits: (orderedIds: string[]) => void;

  // workouts
  addWorkout: (w: Omit<Workout, "id" | "createdAt">) => void;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  removeWorkout: (id: string) => void;

  // health
  setHealth: (date: DateStr, patch: Partial<HealthLog>) => void;
  addWater: (date: DateStr, oz: number) => void;

  // journal
  addJournal: (e: Omit<JournalEntry, "id" | "createdAt">) => void;
  updateJournal: (id: string, patch: Partial<JournalEntry>) => void;
  removeJournal: (id: string) => void;

  // plans/wins/struggles (per-day lists)
  addPlan: (text: string, date?: DateStr) => void;
  removePlan: (id: string) => void;
  updatePlan: (id: string, text: string) => void;

  addWin: (text: string, date?: DateStr) => void;
  removeWin: (id: string) => void;
  updateWin: (id: string, text: string) => void;

  addStruggle: (text: string, date?: DateStr) => void;
  removeStruggle: (id: string) => void;
  updateStruggle: (id: string, text: string) => void;

  // morning routine
  addRoutineItem: (name: string, icon: string) => void;
  toggleRoutineItem: (id: string, date?: DateStr) => void;
  updateRoutineItem: (id: string, patch: Partial<MorningRoutineItem>) => void;
  removeRoutineItem: (id: string) => void;
  reorderRoutine: (orderedIds: string[]) => void;
  resetRoutineToDefaults: (selectedNames?: string[]) => void;
  setRoutineSettings: (patch: Partial<MorningRoutineSettings>) => void;

  // time blocking
  addBlock: (b: Omit<Block, "id" | "createdAt">) => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, newStartMin: number) => void;
  resizeBlock: (id: string, newEndMin: number) => void;

  // energy
  setEnergy: (date: DateStr, period: EnergyPeriod, value: number) => void;
  clearEnergy: (date: DateStr, period: EnergyPeriod) => void;

  // nutrition
  addMeal: (m: Omit<Meal, "id" | "createdAt">) => void;
  updateMeal: (id: string, patch: Partial<Meal>) => void;
  removeMeal: (id: string) => void;
  clearMealsForDay: (date: DateStr) => void;
  addSavedMeal: (m: Omit<SavedMeal, "id" | "useCount">) => void;
  updateSavedMeal: (id: string, patch: Partial<SavedMeal>) => void;
  removeSavedMeal: (id: string) => void;
  logSavedMeal: (savedId: string) => void;
  setNutritionTargets: (patch: Partial<NutritionTargets>) => void;
  setShowNutritionOnToday: (v: boolean) => void;
  setVoiceJournalSettings: (patch: Partial<VoiceJournalSettings>) => void;
  setShowRecurringIcon: (v: boolean) => void;

  // recurring goals
  addRecurringGoal: (
    g: Omit<RecurringGoal, "id" | "createdAt" | "active"> & { active?: boolean }
  ) => string;
  updateRecurringGoal: (id: string, patch: Partial<RecurringGoal>) => void;
  removeRecurringGoal: (id: string) => void;
  toggleRecurringGoalActive: (id: string) => void;
  /** Idempotent generation pass for the given date (defaults to today). */
  runRecurringGeneration: (date?: DateStr) => void;
  /** Marks the generation for {recurringGoalId, date} as skipped so it
   * won't regenerate on the next pass. */
  skipRecurringGeneration: (recurringGoalId: string, date: DateStr) => void;
  /** Clears all generation history (recurring goal templates kept). */
  resetRecurringGenerations: () => void;

  // body measurements + photos
  addBodyMeasurement: (m: Omit<BodyMeasurement, "id" | "createdAt">) => void;
  updateBodyMeasurement: (id: string, patch: Partial<BodyMeasurement>) => void;
  removeBodyMeasurement: (id: string) => void;
  addPhotoMeta: (p: Omit<PhotoMeta, "id" | "createdAt">) => void;
  removePhotoMeta: (id: string) => void;

  // bulk
  exportAll: () => string;
  importAll: (raw: string) => boolean;
  clearAll: () => void;
};

const defaultSettings = (): Settings => ({
  units: { weight: "lb", liquid: "oz" },
  accent: "violet",
  dayTypePresets: DEFAULT_DAY_TYPES,
  hasOnboarded: false,
  waterTargetOz: 96,
  habitTemplates: HABIT_TEMPLATES,
  morningRoutine: { ...DEFAULT_MORNING_ROUTINE_SETTINGS },
  routineSeeded: false,
  nutrition: {
    enabled: false,
    calories: undefined,
    protein: undefined,
    carbs: undefined,
    fat: undefined,
  },
  showNutritionOnToday: true,
  voiceJournal: { ...DEFAULT_VOICE_JOURNAL_SETTINGS },
  showRecurringIcon: true,
});

function buildDefaultRoutine(
  selected?: string[]
): MorningRoutineItem[] {
  const source = selected
    ? DEFAULT_MORNING_ROUTINE.filter((d) => selected.includes(d.name))
    : DEFAULT_MORNING_ROUTINE;
  return source.map((d, i) => ({
    id: uid(),
    name: d.name,
    icon: d.icon,
    order: i,
    history: {},
  }));
}

const initialState: State = {
  hydrated: false,
  settings: defaultSettings(),
  days: {},
  goals: [],
  habits: [],
  workouts: [],
  health: {},
  journal: [],
  plans: [],
  wins: [],
  struggles: [],
  routine: [],
  blocks: [],
  energy: {},
  meals: [],
  savedMeals: [],
  body: [],
  photos: [],
  recurringGoals: [],
  recurringGenerations: [],
};

/** Pick the energy period from a clock hour. */
function periodForHour(hour: number): EnergyPeriod {
  for (const p of ENERGY_PERIODS) {
    const [a, b] = ENERGY_PERIOD_RANGES[p];
    if (hour >= a && hour < b) return p;
  }
  return "morning";
}

/** Migrate legacy single-value `health.energy` into per-period EnergyLog map. */
function migrateLegacyEnergy(
  health: Record<DateStr, HealthLog>,
  existingEnergy: Record<DateStr, EnergyLog>
): Record<DateStr, EnergyLog> {
  const out = { ...existingEnergy };
  for (const date of Object.keys(health)) {
    const log = health[date];
    if (log?.energy != null && !out[date]) {
      // Choose period based on date's hour if it's today; otherwise morning.
      // We don't have a timestamp on HealthLog, so default to morning.
      out[date] = {
        date,
        values: { morning: log.energy },
      };
    }
  }
  return out;
}
void periodForHour; // exported indirectly via setEnergy below if needed

function nextOrder<T extends { order: number }>(arr: T[]) {
  return arr.length ? Math.max(...arr.map((a) => a.order)) + 1 : 0;
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setHydrated: () => set({ hydrated: true }),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setAccent: (a) =>
        set((s) => ({ settings: { ...s.settings, accent: a } })),
      setUnits: (u) =>
        set((s) => ({
          settings: { ...s.settings, units: { ...s.settings.units, ...u } },
        })),
      setWaterTarget: (oz) =>
        set((s) => ({ settings: { ...s.settings, waterTargetOz: oz } })),
      addDayType: (name) =>
        set((s) => ({
          settings: {
            ...s.settings,
            dayTypePresets: Array.from(
              new Set([...s.settings.dayTypePresets, name])
            ),
          },
        })),
      removeDayType: (name) =>
        set((s) => ({
          settings: {
            ...s.settings,
            dayTypePresets: s.settings.dayTypePresets.filter((d) => d !== name),
          },
        })),
      setMorningBriefing: (b) =>
        set((s) => ({ settings: { ...s.settings, morningBriefing: b } })),
      setEveningSummary: (b) =>
        set((s) => ({ settings: { ...s.settings, eveningSummary: b } })),

      setDayType: (date, type) =>
        set((s) => ({
          days: { ...s.days, [date]: { ...(s.days[date] ?? { date, dayType: "" }), dayType: type } },
        })),
      setReminder: (date, reminder) =>
        set((s) => ({
          days: { ...s.days, [date]: { ...(s.days[date] ?? { date, dayType: "" }), reminder } },
        })),

      addGoal: (input) =>
        set((s) => {
          const date = todayStr();
          const sameDay = s.goals.filter((g) => g.date === date);
          const goal: Goal = {
            id: uid(),
            date,
            completed: false,
            order: nextOrder(sameDay),
            ...input,
          };
          return { goals: [...s.goals, goal] };
        }),
      toggleGoal: (id) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === id ? { ...g, completed: !g.completed } : g
          ),
        })),
      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      reorderGoals: (date, orderedIds) =>
        set((s) => {
          const byId = new Map(s.goals.map((g) => [g.id, g]));
          const reordered = orderedIds
            .map((id, i) => {
              const g = byId.get(id);
              return g ? { ...g, order: i } : null;
            })
            .filter(Boolean) as Goal[];
          const others = s.goals.filter(
            (g) => g.date !== date || !orderedIds.includes(g.id)
          );
          return { goals: [...others, ...reordered] };
        }),
      moveToToday: (planId) =>
        set((s) => {
          const plan = s.plans.find((p) => p.id === planId);
          if (!plan) return s;
          const date = todayStr();
          const sameDay = s.goals.filter((g) => g.date === date);
          const goal: Goal = {
            id: uid(),
            text: plan.text,
            completed: false,
            priority: "P2",
            date,
            order: nextOrder(sameDay),
          };
          return {
            goals: [...s.goals, goal],
            plans: s.plans.filter((p) => p.id !== planId),
          };
        }),

      addHabit: (name, icon) =>
        set((s) => ({
          habits: [
            ...s.habits,
            {
              id: uid(),
              name,
              icon,
              history: {},
              order: nextOrder(s.habits),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      toggleHabit: (id, date) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== id) return h;
            const key = date ?? todayStr();
            const next = { ...h.history };
            if (next[key]) delete next[key];
            else next[key] = true;
            return { ...h, history: next };
          }),
        })),
      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        })),
      removeHabit: (id) =>
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      reorderHabits: (orderedIds) =>
        set((s) => {
          const byId = new Map(s.habits.map((h) => [h.id, h]));
          const reordered = orderedIds
            .map((id, i) => {
              const h = byId.get(id);
              return h ? { ...h, order: i } : null;
            })
            .filter(Boolean) as Habit[];
          return { habits: reordered };
        }),

      addWorkout: (w) =>
        set((s) => ({
          workouts: [
            ...s.workouts,
            { ...w, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateWorkout: (id, patch) =>
        set((s) => ({
          workouts: s.workouts.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),
      removeWorkout: (id) =>
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      setHealth: (date, patch) =>
        set((s) => ({
          health: {
            ...s.health,
            [date]: { ...(s.health[date] ?? { date }), ...patch },
          },
        })),
      addWater: (date, oz) =>
        set((s) => {
          const cur = s.health[date] ?? { date };
          const next = (cur.waterOz ?? 0) + oz;
          return {
            health: { ...s.health, [date]: { ...cur, waterOz: Math.max(0, next) } },
          };
        }),

      addJournal: (e) =>
        set((s) => ({
          journal: [
            { ...e, id: uid(), createdAt: new Date().toISOString() },
            ...s.journal,
          ],
        })),
      updateJournal: (id, patch) =>
        set((s) => ({
          journal: s.journal.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        })),
      removeJournal: (id) =>
        set((s) => ({ journal: s.journal.filter((j) => j.id !== id) })),

      addPlan: (text, date) =>
        set((s) => {
          const d = date ?? todayStr();
          const same = s.plans.filter((p) => p.date === d);
          return {
            plans: [
              ...s.plans,
              { id: uid(), text, date: d, order: nextOrder(same) },
            ],
          };
        }),
      removePlan: (id) =>
        set((s) => ({ plans: s.plans.filter((p) => p.id !== id) })),
      updatePlan: (id, text) =>
        set((s) => ({
          plans: s.plans.map((p) => (p.id === id ? { ...p, text } : p)),
        })),

      addWin: (text, date) =>
        set((s) => {
          const d = date ?? todayStr();
          const same = s.wins.filter((w) => w.date === d);
          return {
            wins: [
              ...s.wins,
              { id: uid(), text, date: d, order: nextOrder(same) },
            ],
          };
        }),
      removeWin: (id) =>
        set((s) => ({ wins: s.wins.filter((w) => w.id !== id) })),
      updateWin: (id, text) =>
        set((s) => ({
          wins: s.wins.map((w) => (w.id === id ? { ...w, text } : w)),
        })),

      addStruggle: (text, date) =>
        set((s) => {
          const d = date ?? todayStr();
          const same = s.struggles.filter((x) => x.date === d);
          return {
            struggles: [
              ...s.struggles,
              { id: uid(), text, date: d, order: nextOrder(same) },
            ],
          };
        }),
      removeStruggle: (id) =>
        set((s) => ({ struggles: s.struggles.filter((x) => x.id !== id) })),
      updateStruggle: (id, text) =>
        set((s) => ({
          struggles: s.struggles.map((x) =>
            x.id === id ? { ...x, text } : x
          ),
        })),

      addRoutineItem: (name, icon) =>
        set((s) => ({
          routine: [
            ...s.routine,
            {
              id: uid(),
              name,
              icon,
              order: nextOrder(s.routine),
              history: {},
            },
          ],
        })),
      toggleRoutineItem: (id, date) =>
        set((s) => ({
          routine: s.routine.map((r) => {
            if (r.id !== id) return r;
            const key = date ?? todayStr();
            const next = { ...r.history };
            const current = next[key];
            if (current?.completed) {
              delete next[key];
            } else {
              next[key] = {
                completed: true,
                completedAt: new Date().toISOString(),
              };
            }
            return { ...r, history: next };
          }),
        })),
      updateRoutineItem: (id, patch) =>
        set((s) => ({
          routine: s.routine.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      removeRoutineItem: (id) =>
        set((s) => ({ routine: s.routine.filter((r) => r.id !== id) })),
      reorderRoutine: (orderedIds) =>
        set((s) => {
          const byId = new Map(s.routine.map((r) => [r.id, r]));
          const reordered = orderedIds
            .map((id, i) => {
              const r = byId.get(id);
              return r ? { ...r, order: i } : null;
            })
            .filter(Boolean) as MorningRoutineItem[];
          return { routine: reordered };
        }),
      resetRoutineToDefaults: (selectedNames) =>
        set((s) => ({
          routine: buildDefaultRoutine(selectedNames),
          settings: { ...s.settings, routineSeeded: true },
        })),
      setRoutineSettings: (patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            morningRoutine: { ...s.settings.morningRoutine, ...patch },
          },
        })),

      addBlock: (b) =>
        set((s) => ({
          blocks: [
            ...s.blocks,
            { ...b, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateBlock: (id, patch) =>
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      removeBlock: (id) =>
        set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),
      moveBlock: (id, newStartMin) =>
        set((s) => ({
          blocks: s.blocks.map((b) => {
            if (b.id !== id) return b;
            const duration = b.endMin - b.startMin;
            return { ...b, startMin: newStartMin, endMin: newStartMin + duration };
          }),
        })),
      resizeBlock: (id, newEndMin) =>
        set((s) => ({
          blocks: s.blocks.map((b) =>
            b.id === id
              ? { ...b, endMin: Math.max(b.startMin + 15, newEndMin) }
              : b
          ),
        })),

      setEnergy: (date, period, value) =>
        set((s) => {
          const existing = s.energy[date] ?? { date, values: {} };
          return {
            energy: {
              ...s.energy,
              [date]: {
                ...existing,
                values: { ...existing.values, [period]: value },
              },
            },
          };
        }),
      clearEnergy: (date, period) =>
        set((s) => {
          const existing = s.energy[date];
          if (!existing) return s;
          const values = { ...existing.values };
          delete values[period];
          return {
            energy: {
              ...s.energy,
              [date]: { ...existing, values },
            },
          };
        }),

      addMeal: (m) =>
        set((s) => ({
          meals: [
            ...s.meals,
            { ...m, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      updateMeal: (id, patch) =>
        set((s) => ({
          meals: s.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMeal: (id) =>
        set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),
      clearMealsForDay: (date) =>
        set((s) => ({ meals: s.meals.filter((m) => m.date !== date) })),
      addSavedMeal: (m) =>
        set((s) => ({
          savedMeals: [
            ...s.savedMeals,
            { ...m, id: uid(), useCount: 0 },
          ],
        })),
      updateSavedMeal: (id, patch) =>
        set((s) => ({
          savedMeals: s.savedMeals.map((m) =>
            m.id === id ? { ...m, ...patch } : m
          ),
        })),
      removeSavedMeal: (id) =>
        set((s) => ({ savedMeals: s.savedMeals.filter((m) => m.id !== id) })),
      logSavedMeal: (savedId) =>
        set((s) => {
          const sm = s.savedMeals.find((x) => x.id === savedId);
          if (!sm) return s;
          const now = new Date();
          const time = `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;
          return {
            meals: [
              ...s.meals,
              {
                id: uid(),
                date: todayStr(),
                time,
                name: sm.name,
                calories: sm.calories,
                protein: sm.protein,
                carbs: sm.carbs,
                fat: sm.fat,
                savedMealId: sm.id,
                createdAt: now.toISOString(),
              },
            ],
            savedMeals: s.savedMeals.map((x) =>
              x.id === sm.id
                ? { ...x, useCount: (x.useCount ?? 0) + 1 }
                : x
            ),
          };
        }),
      setNutritionTargets: (patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            nutrition: { ...s.settings.nutrition, ...patch },
          },
        })),
      setShowNutritionOnToday: (v) =>
        set((s) => ({
          settings: { ...s.settings, showNutritionOnToday: v },
        })),
      setVoiceJournalSettings: (patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            voiceJournal: { ...s.settings.voiceJournal, ...patch },
          },
        })),
      setShowRecurringIcon: (v) =>
        set((s) => ({
          settings: { ...s.settings, showRecurringIcon: v },
        })),

      addRecurringGoal: (g) => {
        const id = uid();
        set((s) => ({
          recurringGoals: [
            ...s.recurringGoals,
            {
              id,
              active: g.active ?? true,
              createdAt: new Date().toISOString(),
              text: g.text,
              emoji: g.emoji,
              priority: g.priority,
              category: g.category,
              timeEstimateMin: g.timeEstimateMin,
              pattern: g.pattern,
              daysOfWeek: g.daysOfWeek,
              dayOfMonth: g.dayOfMonth,
              monthlyLastDay: g.monthlyLastDay,
              intervalDays: g.intervalDays,
              startDate: g.startDate,
            },
          ],
        }));
        return id;
      },
      updateRecurringGoal: (id, patch) =>
        set((s) => ({
          recurringGoals: s.recurringGoals.map((r) =>
            r.id === id ? { ...r, ...patch } : r
          ),
        })),
      removeRecurringGoal: (id) =>
        set((s) => ({
          recurringGoals: s.recurringGoals.filter((r) => r.id !== id),
          // keep generation history rows for orphaned recurring goals;
          // already-generated Goal entries are independent and remain
          // visible as plain goals.
        })),
      toggleRecurringGoalActive: (id) =>
        set((s) => ({
          recurringGoals: s.recurringGoals.map((r) =>
            r.id === id ? { ...r, active: !r.active } : r
          ),
        })),
      runRecurringGeneration: (dateArg) =>
        set((s) => {
          const date = dateArg ?? todayStr();
          if (s.recurringGoals.length === 0) return s;

          const genByKey = new Map<string, RecurringGoalGeneration>();
          for (const g of s.recurringGenerations) {
            genByKey.set(`${g.recurringGoalId}:${g.date}`, g);
          }

          const newGoals: Goal[] = [];
          const newGenerations: RecurringGoalGeneration[] = [];
          const sameDayGoals = s.goals.filter((g) => g.date === date);
          let orderCursor = nextOrder(sameDayGoals);

          for (const rg of s.recurringGoals) {
            if (!rg.active) continue;
            if (!shouldGenerateForDate(rg, date)) continue;
            const key = `${rg.id}:${date}`;
            if (genByKey.has(key)) continue;
            const goal: Goal = {
              id: uid(),
              date,
              completed: false,
              order: orderCursor++,
              text: rg.text,
              priority: rg.priority,
              emoji: rg.emoji,
              category: rg.category,
              timeEstimateMin: rg.timeEstimateMin,
              recurringGoalId: rg.id,
            };
            newGoals.push(goal);
            newGenerations.push({
              recurringGoalId: rg.id,
              date,
              generatedGoalId: goal.id,
              status: "generated",
            });
          }

          if (newGoals.length === 0) return s;
          return {
            goals: [...s.goals, ...newGoals],
            recurringGenerations: [
              ...s.recurringGenerations,
              ...newGenerations,
            ],
          };
        }),
      skipRecurringGeneration: (recurringGoalId, date) =>
        set((s) => {
          const idx = s.recurringGenerations.findIndex(
            (g) => g.recurringGoalId === recurringGoalId && g.date === date
          );
          if (idx >= 0) {
            const next = s.recurringGenerations.slice();
            next[idx] = {
              ...next[idx],
              status: "skipped",
              generatedGoalId: "",
            };
            return { recurringGenerations: next };
          }
          return {
            recurringGenerations: [
              ...s.recurringGenerations,
              { recurringGoalId, date, generatedGoalId: "", status: "skipped" },
            ],
          };
        }),
      resetRecurringGenerations: () =>
        set(() => ({ recurringGenerations: [] })),

      addBodyMeasurement: (m) =>
        set((s) => {
          const entry: BodyMeasurement = {
            ...m,
            id: uid(),
            createdAt: new Date().toISOString(),
          };
          // bidirectional weight sync with health log
          const next = { ...s };
          if (entry.weight != null) {
            const cur = s.health[entry.date] ?? { date: entry.date };
            next.health = {
              ...s.health,
              [entry.date]: { ...cur, weight: entry.weight },
            };
          }
          return { body: [...s.body, entry], health: next.health ?? s.health };
        }),
      updateBodyMeasurement: (id, patch) =>
        set((s) => {
          const next = s.body.map((m) =>
            m.id === id ? { ...m, ...patch } : m
          );
          const updated = next.find((x) => x.id === id);
          if (updated && patch.weight !== undefined) {
            const cur = s.health[updated.date] ?? { date: updated.date };
            return {
              body: next,
              health: {
                ...s.health,
                [updated.date]: { ...cur, weight: patch.weight },
              },
            };
          }
          return { body: next };
        }),
      removeBodyMeasurement: (id) =>
        set((s) => ({ body: s.body.filter((m) => m.id !== id) })),
      addPhotoMeta: (p) =>
        set((s) => ({
          photos: [
            ...s.photos,
            { ...p, id: uid(), createdAt: new Date().toISOString() },
          ],
        })),
      removePhotoMeta: (id) =>
        set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),

      exportAll: () => {
        const s = get();
        const payload = {
          version: STORE_VERSION,
          exportedAt: new Date().toISOString(),
          state: {
            settings: s.settings,
            days: s.days,
            goals: s.goals,
            habits: s.habits,
            workouts: s.workouts,
            health: s.health,
            journal: s.journal,
            plans: s.plans,
            wins: s.wins,
            struggles: s.struggles,
            routine: s.routine,
            blocks: s.blocks,
            energy: s.energy,
            meals: s.meals,
            savedMeals: s.savedMeals,
            body: s.body,
            // photo metadata is included but actual image blobs live in
            // IndexedDB and are exported separately via the photos-zip flow.
            photos: s.photos,
            recurringGoals: s.recurringGoals,
            recurringGenerations: s.recurringGenerations,
          },
        };
        return JSON.stringify(payload, null, 2);
      },
      importAll: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const state = parsed.state ?? parsed;
          set(() => ({
            settings: {
              ...defaultSettings(),
              ...(state.settings ?? {}),
              morningRoutine: {
                ...DEFAULT_MORNING_ROUTINE_SETTINGS,
                ...((state.settings as Partial<Settings>)?.morningRoutine ?? {}),
              },
              nutrition: {
                ...defaultSettings().nutrition,
                ...((state.settings as Partial<Settings>)?.nutrition ?? {}),
              },
              voiceJournal: {
                ...DEFAULT_VOICE_JOURNAL_SETTINGS,
                ...((state.settings as Partial<Settings>)?.voiceJournal ?? {}),
              },
            },
            days: state.days ?? {},
            goals: state.goals ?? [],
            habits: state.habits ?? [],
            workouts: state.workouts ?? [],
            health: state.health ?? {},
            journal: state.journal ?? [],
            plans: state.plans ?? [],
            wins: state.wins ?? [],
            struggles: state.struggles ?? [],
            routine: state.routine ?? [],
            blocks: state.blocks ?? [],
            energy: state.energy ?? {},
            meals: state.meals ?? [],
            savedMeals: state.savedMeals ?? [],
            body: state.body ?? [],
            photos: state.photos ?? [],
            recurringGoals: state.recurringGoals ?? [],
            recurringGenerations: state.recurringGenerations ?? [],
          }));
          return true;
        } catch {
          return false;
        }
      },
      clearAll: () =>
        set(() => ({
          ...initialState,
          hydrated: true,
          settings: {
            ...defaultSettings(),
            hasOnboarded: true,
            routineSeeded: true,
          },
          routine: buildDefaultRoutine(),
        })),
    }),
    {
      name: "life-os:v2",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        // No structural changes: merge() handles new defaults for added
        // slices. Returning the persisted state unchanged is correct.
        return persisted as State;
      },
      partialize: (state) => {
        const { hydrated: _hydrated, ...rest } = state;
        void _hydrated;
        return rest;
      },
      merge: (persisted, current) => {
        // shallow merge with settings deep-merged so new fields get defaults
        const p = (persisted ?? {}) as Partial<State>;
        const merged: State & Actions = {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...(p.settings ?? {}),
            morningRoutine: {
              ...current.settings.morningRoutine,
              ...((p.settings as Partial<Settings>)?.morningRoutine ?? {}),
            },
            nutrition: {
              ...current.settings.nutrition,
              ...((p.settings as Partial<Settings>)?.nutrition ?? {}),
            },
            voiceJournal: {
              ...current.settings.voiceJournal,
              ...((p.settings as Partial<Settings>)?.voiceJournal ?? {}),
            },
          },
          routine: p.routine ?? current.routine,
          blocks: p.blocks ?? current.blocks,
          energy: p.energy ?? current.energy,
          meals: p.meals ?? current.meals,
          savedMeals: p.savedMeals ?? current.savedMeals,
          body: p.body ?? current.body,
          photos: p.photos ?? current.photos,
          recurringGoals: p.recurringGoals ?? current.recurringGoals,
          recurringGenerations:
            p.recurringGenerations ?? current.recurringGenerations,
        } as State & Actions;
        return merged;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setHydrated();
        // first-run seed (also fires for existing users upgrading)
        if (!state.settings.routineSeeded) {
          state.resetRoutineToDefaults();
        }
        // migrate legacy single-value energy into per-period log
        const haveLegacy = Object.values(state.health).some(
          (h) => h && h.energy != null
        );
        const haveNew = Object.keys(state.energy).length > 0;
        if (haveLegacy && !haveNew) {
          const next = migrateLegacyEnergy(state.health, state.energy);
          // direct state mutation via the underlying set
          useStore.setState({ energy: next });
        }
      },
    }
  )
);

// helper exports for use in components without re-importing types
export type LifeOSState = State & Actions;
export type { Priority, ListItem };
