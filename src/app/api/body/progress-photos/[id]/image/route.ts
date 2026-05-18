import { get } from "@vercel/blob";
import { requireUser } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
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

  const row = await queryOne<{ blob_pathname: string }>(
    "SELECT blob_pathname FROM body_progress_photos WHERE id = $1 AND user_id = $2",
    [id, user.id]
  );
  if (!row) return Response.json({ error: "not-found" }, { status: 404 });

  const ifNoneMatch = req.headers.get("if-none-match") ?? undefined;
  const result = await get(row.blob_pathname, { access: "private", ifNoneMatch });
  if (!result) return new Response("Not found", { status: 404 });

  if (result.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" },
    });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    },
  });
}
