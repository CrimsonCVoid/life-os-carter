"use client";

import useSWR, { mutate } from "swr";
import type {
  LiftSessionRow,
  WorkoutRow,
} from "@/lib/data/workouts";

const dateKey = (date: string) => `/api/data/workouts?date=${date}`;
const ALL_KEY = "/api/data/workouts";

export function useWorkoutForDate(date: string) {
  const swr = useSWR<WorkoutRow | null>(dateKey(date));
  return { workout: swr.data ?? null, isLoading: swr.isLoading };
}

export function useAllWorkouts() {
  const swr = useSWR<WorkoutRow[]>(ALL_KEY);
  return { workouts: swr.data ?? [], isLoading: swr.isLoading };
}

export async function upsertWorkout(
  date: string,
  patch: Partial<Pick<WorkoutRow, "type" | "durationMin" | "intensity" | "notes">>
): Promise<void> {
  await fetch(ALL_KEY, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, ...patch }),
  });
  await mutate(dateKey(date));
  await mutate(ALL_KEY);
}

export async function deleteWorkout(id: string): Promise<void> {
  await fetch(`${ALL_KEY}/${id}`, { method: "DELETE" });
  await mutate((k) => typeof k === "string" && k.startsWith(ALL_KEY));
}

// Lift sessions intentionally left for direct fetch from the gym page —
// they roundtrip a large `exercises` JSON blob that isn't shared across
// surfaces, so SWR caching offers little benefit.
export type { LiftSessionRow };
