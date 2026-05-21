import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import { listWorkoutRoutines, createWorkoutRoutine } from "@/lib/data/workout-routines";
import type { WorkoutRoutine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser((userId) => listWorkoutRoutines(userId));
}

export async function POST(req: NextRequest) {
  return withUserRequest(req, ({ userId, body }) =>
    createWorkoutRoutine(userId, body as Omit<WorkoutRoutine, "id">)
  );
}
