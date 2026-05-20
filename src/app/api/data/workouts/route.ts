import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import {
  getWorkoutForDate,
  listWorkouts,
  upsertWorkout,
} from "@/lib/data/workouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  // Conditional returns either WorkoutRow | null (single date) or
  // WorkoutRow[] (full list) — broaden so withUser's generic doesn't
  // collapse them into one mismatched shape.
  return withUser(async (userId): Promise<unknown> =>
    date ? getWorkoutForDate(userId, date) : listWorkouts(userId)
  );
}

/** Upsert the workout meta for a given date — one workout per day. */
export async function PUT(req: NextRequest) {
  return withUserRequest(req, ({ userId, body }) => {
    const { date, ...patch } = body as {
      date: string;
      type?: string;
      durationMin?: number;
      intensity?: number;
      notes?: string | null;
    };
    return upsertWorkout(userId, date, patch);
  });
}
