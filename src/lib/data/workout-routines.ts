import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workoutRoutines } from "@/lib/db/schema";
import type { WorkoutRoutine, TemplateExerciseEntry } from "@/lib/types";

export type WorkoutRoutineRow = typeof workoutRoutines.$inferSelect;

function rowToRoutine(r: WorkoutRoutineRow): WorkoutRoutine {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? undefined,
    notes: r.notes ?? undefined,
    exercises: (r.exercises as TemplateExerciseEntry[]) ?? [],
    scheduledDays: (r.scheduledDays as number[] | null) ?? undefined,
    order: r.order,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listWorkoutRoutines(userId: string): Promise<WorkoutRoutine[]> {
  const rows = await db
    .select()
    .from(workoutRoutines)
    .where(eq(workoutRoutines.userId, userId))
    .orderBy(asc(workoutRoutines.order));
  return rows.map(rowToRoutine);
}

export async function createWorkoutRoutine(
  userId: string,
  input: Omit<WorkoutRoutine, "id">
): Promise<WorkoutRoutine> {
  const [row] = await db
    .insert(workoutRoutines)
    .values({
      userId,
      name: input.name,
      icon: input.icon ?? null,
      notes: input.notes ?? null,
      exercises: input.exercises ?? [],
      scheduledDays: input.scheduledDays ?? null,
      order: input.order ?? 0,
    })
    .returning();
  return rowToRoutine(row);
}

export async function updateWorkoutRoutine(
  userId: string,
  id: string,
  patch: Partial<Omit<WorkoutRoutine, "id">>
): Promise<WorkoutRoutine | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if ("icon" in patch) update.icon = patch.icon ?? null;
  if ("notes" in patch) update.notes = patch.notes ?? null;
  if (patch.exercises !== undefined) update.exercises = patch.exercises;
  if ("scheduledDays" in patch) update.scheduledDays = patch.scheduledDays ?? null;
  if (patch.order !== undefined) update.order = patch.order;
  const [row] = await db
    .update(workoutRoutines)
    .set(update)
    .where(and(eq(workoutRoutines.id, id), eq(workoutRoutines.userId, userId)))
    .returning();
  return row ? rowToRoutine(row) : null;
}

export async function deleteWorkoutRoutine(userId: string, id: string): Promise<void> {
  await db
    .delete(workoutRoutines)
    .where(and(eq(workoutRoutines.id, id), eq(workoutRoutines.userId, userId)));
}
