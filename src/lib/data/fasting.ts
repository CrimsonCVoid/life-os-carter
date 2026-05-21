import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { fastingWindows } from "@/lib/db/schema";
import type { FastingWindow } from "@/lib/types";

export type FastingRow = typeof fastingWindows.$inferSelect;

function rowToWindow(r: FastingRow): FastingWindow {
  return {
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : undefined,
    targetHours: r.targetHours,
    notes: r.notes ?? undefined,
  };
}

export async function listFastingWindows(userId: string): Promise<FastingWindow[]> {
  const rows = await db
    .select()
    .from(fastingWindows)
    .where(eq(fastingWindows.userId, userId))
    .orderBy(desc(fastingWindows.startedAt));
  return rows.map(rowToWindow);
}

export async function getActiveFastingWindow(userId: string): Promise<FastingWindow | null> {
  const rows = await db
    .select()
    .from(fastingWindows)
    .where(and(eq(fastingWindows.userId, userId), isNull(fastingWindows.endedAt)))
    .orderBy(desc(fastingWindows.startedAt))
    .limit(1);
  return rows[0] ? rowToWindow(rows[0]) : null;
}

export async function startFastingWindow(
  userId: string,
  input: { startedAt?: string; targetHours?: number; notes?: string }
): Promise<FastingWindow> {
  // Defensively close any existing active window before opening a new one
  await db
    .update(fastingWindows)
    .set({ endedAt: new Date() })
    .where(and(eq(fastingWindows.userId, userId), isNull(fastingWindows.endedAt)));
  const [row] = await db
    .insert(fastingWindows)
    .values({
      userId,
      startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
      endedAt: null,
      targetHours: input.targetHours ?? 16,
      notes: input.notes ?? null,
    })
    .returning();
  return rowToWindow(row);
}

export async function updateFastingWindow(
  userId: string,
  id: string,
  patch: Partial<{ startedAt: string; endedAt: string | null; targetHours: number; notes: string | null }>
): Promise<FastingWindow | null> {
  const update: Record<string, unknown> = {};
  if (patch.startedAt !== undefined) update.startedAt = new Date(patch.startedAt);
  if ("endedAt" in patch) update.endedAt = patch.endedAt ? new Date(patch.endedAt) : null;
  if (patch.targetHours !== undefined) update.targetHours = patch.targetHours;
  if ("notes" in patch) update.notes = patch.notes;
  const [row] = await db
    .update(fastingWindows)
    .set(update)
    .where(and(eq(fastingWindows.id, id), eq(fastingWindows.userId, userId)))
    .returning();
  return row ? rowToWindow(row) : null;
}

export async function deleteFastingWindow(userId: string, id: string): Promise<void> {
  await db
    .delete(fastingWindows)
    .where(and(eq(fastingWindows.id, id), eq(fastingWindows.userId, userId)));
}
