import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import { updateWorkoutRoutine, deleteWorkoutRoutine } from "@/lib/data/workout-routines";
import type { WorkoutRoutine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUserRequest(req, ({ userId, body }) =>
    updateWorkoutRoutine(userId, id, body as Partial<Omit<WorkoutRoutine, "id">>)
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteWorkoutRoutine(userId, id);
    return { ok: true };
  });
}
