import { requireUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return Response.json({ error: "bad-endpoint" }, { status: 400 });
  }
  await query(
    "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
    [user.id, body.endpoint]
  );
  return Response.json({ ok: true });
}
