"use client";
import useSWR, { mutate } from "swr";
import type { WorkoutRoutine } from "@/lib/types";

const KEY = "/api/data/workout-routines";

export function useWorkoutRoutines() {
  const swr = useSWR<WorkoutRoutine[]>(KEY);
  return {
    routines: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
  };
}

export async function createRoutine(input: Omit<WorkoutRoutine, "id">): Promise<WorkoutRoutine | undefined> {
  let created: WorkoutRoutine | undefined;
  const tempId = "temp-" + Date.now().toString(36);
  await mutate<WorkoutRoutine[]>(
    KEY,
    async (current) => {
      const list = current ?? [];
      const res = await fetch(KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      created = await res.json();
      return [...list.filter((r) => r.id !== tempId), created!].sort((a, b) => a.order - b.order);
    },
    {
      optimisticData: (current) => [...(current ?? []), { ...input, id: tempId } as WorkoutRoutine],
      rollbackOnError: true,
      revalidate: true,
    }
  );
  return created;
}

export async function updateRoutine(id: string, patch: Partial<Omit<WorkoutRoutine, "id">>): Promise<void> {
  await mutate<WorkoutRoutine[]>(
    KEY,
    async (current) => {
      const list = current ?? [];
      const res = await fetch(`${KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`update failed: ${res.status}`);
      const next: WorkoutRoutine = await res.json();
      return list.map((r) => (r.id === id ? next : r));
    },
    {
      optimisticData: (current) => (current ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      rollbackOnError: true,
      revalidate: true,
    }
  );
}

export async function deleteRoutine(id: string): Promise<void> {
  await mutate<WorkoutRoutine[]>(
    KEY,
    async (current) => {
      const list = current ?? [];
      const res = await fetch(`${KEY}/${id}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      return list.filter((r) => r.id !== id);
    },
    {
      optimisticData: (current) => (current ?? []).filter((r) => r.id !== id),
      rollbackOnError: true,
      revalidate: true,
    }
  );
}
