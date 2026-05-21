import { NextRequest } from "next/server";
import { withUser, withUserRequest } from "@/lib/api-helpers";
import { updateFastingWindow, deleteFastingWindow } from "@/lib/data/fasting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUserRequest(req, ({ userId, body }) =>
    updateFastingWindow(userId, id, body as Parameters<typeof updateFastingWindow>[2])
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteFastingWindow(userId, id);
    return { ok: true };
  });
}
