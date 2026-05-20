import { requireUser } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendPushToUser(user.id, {
      title: "Life OS",
      body: "Push is wired up. You'll get daily briefings here.",
      url: "/",
      tag: "test",
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "push-failed" },
      { status: 500 }
    );
  }
}
