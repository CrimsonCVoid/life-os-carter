/**
 * GET    /api/data/lift-sessions       — list all sessions for current user
 * POST   /api/data/lift-sessions       — persist a finished session
 *
 * The Drizzle data layer (src/lib/data/workouts.ts) already exists; this
 * file is the missing REST surface so finishActiveWorkout and the gym
 * page can stop being Zustand-only.
 *
 * Lift sessions are large (the `exercises` jsonb roundtrips full sets +
 * RPE + notes per exercise), so the hook is conservative about
 * revalidation — we read once on focus and after every write.
 */

import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import {
  createLiftSession,
  listLiftSessions,
} from "@/lib/data/workouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser((userId) => listLiftSessions(userId));
}

export async function POST(req: NextRequest) {
  return withUserRequest(req, ({ userId, body }) => {
    const input = body as {
      date: string;
      raw?: string;
      exercises: unknown[];
    };
    if (!input?.date || !Array.isArray(input?.exercises)) {
      throw new Error("date + exercises[] required");
    }
    return createLiftSession(userId, input);
  });
}
