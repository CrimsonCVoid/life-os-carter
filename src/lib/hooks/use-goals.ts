"use client";

import useSWR, { mutate } from "swr";
import type { GoalRow, RecurringGoalRow } from "@/lib/data/goals";

const keyForDate = (date: string) => `/api/data/goals?date=${date}`;
const RECURRING_KEY = "/api/data/recurring-goals";

export function useGoalsForDate(date: string) {
  const swr = useSWR<GoalRow[]>(keyForDate(date));
  return { goals: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createGoal(
  input: Parameters<typeof window.fetch>[1] extends infer _
    ? {
        text: string;
        priority: "P1" | "P2" | "P3";
        date: string;
        emoji?: string | null;
        category?: string | null;
        timeEstimateMin?: number | null;
        order?: number;
        recurringGoalId?: string | null;
      }
    : never
): Promise<GoalRow> {
  const res = await fetch("/api/data/goals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create goal failed: ${res.status}`);
  const row = (await res.json()) as GoalRow;
  await mutate(keyForDate(input.date));
  return row;
}

export async function updateGoal(
  id: string,
  patch: Partial<GoalRow>,
  date: string
): Promise<void> {
  await mutate<GoalRow[]>(
    keyForDate(date),
    (cur) =>
      (cur ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    { revalidate: false }
  );
  const res = await fetch(`/api/data/goals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    await mutate(keyForDate(date));
    throw new Error(`update goal failed: ${res.status}`);
  }
  await mutate(keyForDate(date));
}

export async function deleteGoal(id: string, date: string): Promise<void> {
  await mutate<GoalRow[]>(
    keyForDate(date),
    (cur) => (cur ?? []).filter((g) => g.id !== id),
    { revalidate: false }
  );
  await fetch(`/api/data/goals/${id}`, { method: "DELETE" });
  await mutate(keyForDate(date));
}

// ── Recurring goal templates ──────────────────────────────────────────────

export function useRecurringGoals() {
  const swr = useSWR<RecurringGoalRow[]>(RECURRING_KEY);
  return { templates: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createRecurringGoal(
  input: Parameters<typeof window.fetch>[1] extends infer _
    ? {
        text: string;
        pattern: string;
        patternConfig: Record<string, unknown>;
        startDate: string;
        priority: "P1" | "P2" | "P3";
        emoji?: string | null;
        category?: string | null;
        timeEstimateMin?: number | null;
        active?: boolean;
      }
    : never
): Promise<RecurringGoalRow> {
  const res = await fetch(RECURRING_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create recurring failed: ${res.status}`);
  const row = (await res.json()) as RecurringGoalRow;
  await mutate(RECURRING_KEY);
  return row;
}

export async function updateRecurringGoal(
  id: string,
  patch: Partial<RecurringGoalRow>
): Promise<void> {
  await mutate<RecurringGoalRow[]>(
    RECURRING_KEY,
    (cur) => (cur ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    { revalidate: false }
  );
  await fetch(`/api/data/recurring-goals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(RECURRING_KEY);
}

export async function deleteRecurringGoal(id: string): Promise<void> {
  await mutate<RecurringGoalRow[]>(
    RECURRING_KEY,
    (cur) => (cur ?? []).filter((r) => r.id !== id),
    { revalidate: false }
  );
  await fetch(`/api/data/recurring-goals/${id}`, { method: "DELETE" });
  await mutate(RECURRING_KEY);
}
