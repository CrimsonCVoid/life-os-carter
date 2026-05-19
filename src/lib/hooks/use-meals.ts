"use client";

import useSWR, { mutate } from "swr";
import type { MealRow, SavedMealRow } from "@/lib/data/meals";

const mealsKey = (date: string) => `/api/data/meals?date=${date}`;
const SAVED_KEY = "/api/data/saved-meals";

export function useMealsForDate(date: string) {
  const swr = useSWR<MealRow[]>(mealsKey(date));
  return { meals: swr.data ?? [], isLoading: swr.isLoading };
}

export function useSavedMeals() {
  const swr = useSWR<SavedMealRow[]>(SAVED_KEY);
  return { savedMeals: swr.data ?? [], isLoading: swr.isLoading };
}

export async function createMeal(
  input: Omit<MealRow, "id" | "userId" | "createdAt"> & {
    aiAnalysis?: unknown;
  }
): Promise<MealRow> {
  const res = await fetch("/api/data/meals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create meal failed: ${res.status}`);
  const row = (await res.json()) as MealRow;
  await mutate(mealsKey(input.date));
  return row;
}

export async function updateMeal(
  id: string,
  date: string,
  patch: Partial<MealRow>
): Promise<void> {
  await fetch(`/api/data/meals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await mutate(mealsKey(date));
}

export async function deleteMeal(id: string, date: string): Promise<void> {
  await fetch(`/api/data/meals/${id}`, { method: "DELETE" });
  await mutate(mealsKey(date));
}

export async function createSavedMeal(
  input: Omit<SavedMealRow, "id" | "userId" | "createdAt" | "useCount">
): Promise<SavedMealRow> {
  const res = await fetch(SAVED_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create saved meal failed: ${res.status}`);
  const row = (await res.json()) as SavedMealRow;
  await mutate(SAVED_KEY);
  return row;
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await fetch(`${SAVED_KEY}/${id}`, { method: "DELETE" });
  await mutate(SAVED_KEY);
}
