import { requireUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Delete a progress photo row. The analysis row cascades. Blob bytes are
 * not auto-deleted from Vercel; that's a follow-up cleanup job. */
export async function DELETE(_req: Request, { params }: Params) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id.match(/^[0-9a-f-]{36}$/i)) {
    return Response.json({ error: "invalid-id" }, { status: 400 });
  }

  const deleted = await query<{ id: string }>(
    "DELETE FROM body_progress_photos WHERE id = $1 AND user_id = $2 RETURNING id::text",
    [id, user.id]
  );
  if (deleted.length === 0) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
