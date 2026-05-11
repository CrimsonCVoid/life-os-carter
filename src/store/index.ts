"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { todayStr } from "@/lib/date";
import { uid } from "@/lib/utils";
import {
  DEFAULT_DAY_TYPES,
  Day,
  Goal,
  Habit,
  HABIT_TEMPLATES,
  HealthLog,
  JournalEntry,
  ListItem,
  Plan,
  Settings,
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

const STORE_VERSION = 1;

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
});

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
};

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
          },
        };
        return JSON.stringify(payload, null, 2);
      },
      importAll: (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const state = parsed.state ?? parsed;
          set(() => ({
            settings: { ...defaultSettings(), ...(state.settings ?? {}) },
            days: state.days ?? {},
            goals: state.goals ?? [],
            habits: state.habits ?? [],
            workouts: state.workouts ?? [],
            health: state.health ?? {},
            journal: state.journal ?? [],
            plans: state.plans ?? [],
            wins: state.wins ?? [],
            struggles: state.struggles ?? [],
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
          settings: { ...defaultSettings(), hasOnboarded: true },
        })),
    }),
    {
      name: "life-os:v2",
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { hydrated: _hydrated, ...rest } = state;
        void _hydrated;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

// helper exports for use in components without re-importing types
export type LifeOSState = State & Actions;
export type { Priority, ListItem };
