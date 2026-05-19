"use client";

import useSWR, { mutate } from "swr";
import type { HabitRow, HabitLogRow } from "@/lib/data/habits";
import type { HabitIcon } from "@/lib/types";
import { queuedFetch } from "@/lib/offline-queue";

/**
 * Habits data hooks — read from /api/data/habits + /api/data/habits/log
 * via SWR with optimistic toggle.
 *
 * Output shape preserves the legacy Habit.history map so existing UI
 * (e.g. <HabitsGrid>, stats heatmap, streak calc) reads the same fields
 * without restructuring.
 */

const HABITS_KEY = "/api/data/habits";
const LOGS_KEY = "/api/data/habits/log";

export type HabitWithHistory = HabitRow & {
  history: Record<string, boolean>;
};

export function useHabits() {
  const habits = useSWR<HabitRow[]>(HABITS_KEY);
  const logs = useSWR<HabitLogRow[]>(LOGS_KEY);
  return {
    habits: habits.data ?? [],
    logs: logs.data ?? [],
    isLoading: habits.isLoading || logs.isLoading,
    error: habits.error ?? logs.error,
  };
}

/** Habits with their per-date history merged in. The history map keeps
 * the same shape that the old Zustand `Habit.history` exposed. */
export function useHabitsWithHistory(): {
  habits: HabitWithHistory[];
  isLoading: boolean;
  error: unknown;
} {
  const { habits, logs, isLoading, error } = useHabits();
  const byHabit = new Map<string, Record<string, boolean>>();
  for (const l of logs) {
    let m = byHabit.get(l.habitId);
    if (!m) {
      m = {};
      byHabit.set(l.habitId, m);
    }
    if (l.completed) m[l.date] = true;
  }
  const sorted = [...habits].sort(
    (a, b) => a.order - b.order || a.createdAt.toString().localeCompare(b.createdAt.toString())
  );
  return {
    habits: sorted.map((h) => ({
      ...h,
      history: byHabit.get(h.id) ?? {},
    })),
    isLoading,
    error,
  };
}

/**
 * Optimistically toggle a habit log for {habitId, date}. Returns the
 * post-toggle completed state; rolls back the SWR cache on error.
 */
export async function toggleHabit(
  habitId: string,
  date: string
): Promise<boolean> {
  let nextCompleted = false;
  await mutate<HabitLogRow[]>(
    LOGS_KEY,
    async (current) => {
      const list = current ?? [];
      const idx = list.findIndex(
        (l) => l.habitId === habitId && l.date === date
      );
      if (idx >= 0) {
        nextCompleted = false;
        return list.filter((_, i) => i !== idx);
      }
      nextCompleted = true;
      return [
        ...list,
        {
          habitId,
          date,
          completed: true,
          userId: "",
          completedAt: new Date(),
        } as HabitLogRow,
      ];
    },
    { revalidate: false }
  );

  try {
    const res = await queuedFetch(LOGS_KEY, {
      method: "POST",
      body: { habitId, date },
    });
    if (!res.ok && !("queued" in res && res.queued)) {
      throw new Error(`toggle failed: ${res.status}`);
    }
    // Revalidate from server so we converge on the truth — but only when
    // the request actually hit the server. A queued response means the
    // local optimistic state is the closest thing to truth right now.
    if (!("queued" in res) || !res.queued) {
      await mutate(LOGS_KEY);
    }
    return nextCompleted;
  } catch (err) {
    await mutate(LOGS_KEY);
    throw err;
  }
}

export async function createHabitOptimistic(input: {
  name: string;
  icon: HabitIcon;
  target?: number;
}): Promise<HabitRow> {
  const tempId = `temp-${crypto.randomUUID()}`;
  const tempRow: HabitRow = {
    id: tempId,
    userId: "",
    name: input.name,
    icon: input.icon,
    target: input.target ?? null,
    order: 0,
    archivedAt: null,
    createdAt: new Date(),
  };
  await mutate<HabitRow[]>(
    HABITS_KEY,
    (current) => [...(current ?? []), tempRow],
    { revalidate: false }
  );
  try {
    const res = await queuedFetch(HABITS_KEY, {
      method: "POST",
      body: input,
    });
    if (!res.ok && !("queued" in res && res.queued)) {
      throw new Error(`create failed: ${res.status}`);
    }
    if (!("queued" in res) || !res.queued) {
      await mutate(HABITS_KEY);
      return (await res.json()) as HabitRow;
    }
    // Queued: keep the optimistic temp row visible; SWR will reconcile
    // once the queue flushes.
    return tempRow;
  } catch (err) {
    await mutate(HABITS_KEY);
    throw err;
  }
}

export async function deleteHabitOptimistic(habitId: string): Promise<void> {
  await mutate<HabitRow[]>(
    HABITS_KEY,
    (current) => (current ?? []).filter((h) => h.id !== habitId),
    { revalidate: false }
  );
  try {
    const res = await queuedFetch(`${HABITS_KEY}/${habitId}`, {
      method: "DELETE",
    });
    if (!res.ok && !("queued" in res && res.queued)) {
      throw new Error(`delete failed: ${res.status}`);
    }
    if (!("queued" in res) || !res.queued) {
      await mutate(HABITS_KEY);
      await mutate(LOGS_KEY);
    }
  } catch (err) {
    await mutate(HABITS_KEY);
    throw err;
  }
}

export async function updateHabitOptimistic(
  habitId: string,
  patch: Partial<Pick<HabitRow, "name" | "icon" | "target" | "order">>
): Promise<void> {
  await mutate<HabitRow[]>(
    HABITS_KEY,
    (current) =>
      (current ?? []).map((h) => (h.id === habitId ? { ...h, ...patch } : h)),
    { revalidate: false }
  );
  try {
    const res = await queuedFetch(`${HABITS_KEY}/${habitId}`, {
      method: "PATCH",
      body: patch,
    });
    if (!res.ok && !("queued" in res && res.queued)) {
      throw new Error(`update failed: ${res.status}`);
    }
    if (!("queued" in res) || !res.queued) {
      await mutate(HABITS_KEY);
    }
  } catch (err) {
    await mutate(HABITS_KEY);
    throw err;
  }
}
