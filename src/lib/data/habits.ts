import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { habits, habitLogs } from "@/lib/db/schema";

export type HabitRow = typeof habits.$inferSelect;
export type HabitInsert = typeof habits.$inferInsert;
export type HabitLogRow = typeof habitLogs.$inferSelect;

export async function listHabits(userId: string): Promise<HabitRow[]> {
  // Column-explicit select — schema.ts declares an archived_at column
  // the live Neon table is missing. Returning a minimal projection
  // shields the route from that drift; the iOS side doesn't read it.
  const rows = await db.execute(
    sql`SELECT id, user_id AS "userId", name, icon, "order"
        FROM habits
        WHERE user_id = ${userId}
        ORDER BY "order" ASC`
  );
  return (rows as unknown as { rows: HabitRow[] }).rows;
}

export async function createHabit(
  userId: string,
  input: { name: string; icon: string; target?: number | null; order?: number }
): Promise<{ id: string }> {
  // Raw SQL — Drizzle's .returning() pulls every schema column
  // including ones the live Neon table is missing (archived_at).
  // Explicit column list keeps the insert robust to drift.
  const result = await db.execute(
    sql`INSERT INTO habits (user_id, name, icon, "order")
        VALUES (${userId}, ${input.name}, ${input.icon}, ${input.order ?? 0})
        RETURNING id`
  );
  const rows = result as unknown as { rows: Array<{ id: string }> };
  return { id: rows.rows[0]?.id ?? "" };
}

export async function updateHabit(
  userId: string,
  habitId: string,
  patch: Partial<Pick<HabitRow, "name" | "icon" | "target" | "order">>
): Promise<HabitRow | null> {
  const [row] = await db
    .update(habits)
    .set(patch)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning();
  return row ?? null;
}

export async function archiveHabit(
  userId: string,
  habitId: string
): Promise<void> {
  await db
    .update(habits)
    .set({ archivedAt: new Date() })
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));
}

export async function deleteHabit(
  userId: string,
  habitId: string
): Promise<void> {
  await db
    .delete(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));
}

export async function listHabitLogs(
  userId: string,
  opts?: { habitId?: string }
): Promise<HabitLogRow[]> {
  if (opts?.habitId) {
    return db
      .select()
      .from(habitLogs)
      .where(
        and(eq(habitLogs.userId, userId), eq(habitLogs.habitId, opts.habitId))
      );
  }
  return db.select().from(habitLogs).where(eq(habitLogs.userId, userId));
}

/** Toggle a habit log for a date. Returns the new state. */
export async function toggleHabitLog(
  userId: string,
  habitId: string,
  date: string
): Promise<{ completed: boolean }> {
  const existing = await db
    .select()
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.userId, userId),
        eq(habitLogs.habitId, habitId),
        eq(habitLogs.date, date)
      )
    );
  if (existing.length > 0) {
    await db
      .delete(habitLogs)
      .where(
        and(
          eq(habitLogs.userId, userId),
          eq(habitLogs.habitId, habitId),
          eq(habitLogs.date, date)
        )
      );
    return { completed: false };
  }
  await db.insert(habitLogs).values({
    userId,
    habitId,
    date,
    completed: true,
    completedAt: new Date(),
  });
  return { completed: true };
}

export async function reorderHabits(
  userId: string,
  orderedIds: string[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await db
      .update(habits)
      .set({ order: i })
      .where(and(eq(habits.id, orderedIds[i]), eq(habits.userId, userId)));
  }
}
