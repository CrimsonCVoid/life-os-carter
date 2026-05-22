import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { meals, savedMeals } from "@/lib/db/schema";

export type MealRow = typeof meals.$inferSelect;
export type SavedMealRow = typeof savedMeals.$inferSelect;

export async function listMealsForDate(userId: string, date: string) {
  // Column-explicit — schema.ts declares photo_indexeddb_key,
  // thumbnail_data_url, ai_analysis, ai_logged columns the live Neon
  // table is missing. Project only what the native client needs.
  const rows = await db.execute(
    sql`SELECT id, user_id AS "userId", date, time, name,
               calories, protein, carbs, fat, created_at AS "createdAt"
        FROM meals
        WHERE user_id = ${userId} AND date = ${date}::date
        ORDER BY time ASC, created_at ASC`
  );
  return (rows as unknown as { rows: MealRow[] }).rows;
}

export async function createMeal(
  userId: string,
  input: {
    date: string;
    time: string;
    name?: string | null;
    calories?: number;
    protein?: number;
    carbs?: number | null;
    fat?: number | null;
  }
): Promise<{ id: string }> {
  // Raw SQL — Drizzle's .returning() with no args pulls every schema
  // column including ones the live Neon table is missing
  // (photo_indexeddb_key, ai_analysis, etc). Only insert + return the
  // columns we actually use.
  const result = await db.execute(
    sql`INSERT INTO meals (user_id, date, time, name, calories, protein, carbs, fat)
        VALUES (${userId}, ${input.date}::date, ${input.time},
                ${input.name ?? null}, ${input.calories ?? 0},
                ${input.protein ?? 0}, ${input.carbs ?? null}, ${input.fat ?? null})
        RETURNING id`
  );
  const rows = result as unknown as { rows: Array<{ id: string }> };
  return { id: rows.rows[0]?.id ?? "" };
}

export async function updateMeal(
  userId: string,
  id: string,
  patch: Partial<MealRow>
) {
  const [row] = await db
    .update(meals)
    .set(patch)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteMeal(userId: string, id: string): Promise<void> {
  await db
    .delete(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)));
}

// ── Saved meals (quick-tap chips) ──────────────────────────────────────────

export async function listSavedMeals(userId: string) {
  return db
    .select()
    .from(savedMeals)
    .where(eq(savedMeals.userId, userId))
    .orderBy(asc(savedMeals.useCount));
}

export async function createSavedMeal(
  userId: string,
  input: Omit<SavedMealRow, "id" | "userId" | "createdAt" | "useCount">
) {
  const [row] = await db
    .insert(savedMeals)
    .values({ userId, ...input, useCount: 0 })
    .returning();
  return row;
}

export async function updateSavedMeal(
  userId: string,
  id: string,
  patch: Partial<SavedMealRow>
) {
  const [row] = await db
    .update(savedMeals)
    .set(patch)
    .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteSavedMeal(
  userId: string,
  id: string
): Promise<void> {
  await db
    .delete(savedMeals)
    .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)));
}
