/**
 * PATCH  /api/data/lift-sessions/[id] — partial update (date / raw / exercises)
 * DELETE /api/data/lift-sessions/[id]
 *
 * Next 15 promise-params shape, matching every other /api/data/[id] route.
 */

import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import {
  deleteLiftSession,
  updateLiftSession,
  type LiftSessionRow,
} from "@/lib/data/workouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUserRequest(req, ({ userId, body }) =>
    updateLiftSession(
      userId,
      id,
      body as Partial<Pick<LiftSessionRow, "date" | "raw" | "exercises">>
    )
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteLiftSession(userId, id);
    return { ok: true };
  });
}
