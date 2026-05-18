import { getCurrentUser, createSession } from "@/lib/auth/session";
import { verifyCodeForUser } from "@/lib/auth/totp";
import { checkAllowed, clearCounter, clientIp, recordFailure } from "@/lib/auth/rate-limit";
import { queryOne } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEEDED_USER_ID = "00000000-0000-4000-8000-000000000001";
const KIND = "totp_setup";

type Body = { code: string; setupToken?: string };

/** First-code confirmation. Marks secret verified, opens session. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const gate = await checkAllowed(ip, KIND);
  if (!gate.allowed) {
    return Response.json(
      { error: gate.reason === "blocked" ? "ip-blocked" : "too-many-attempts" },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.code) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  // Same gate as /setup: signed-in OR bootstrap token.
  let userId: string | null = null;
  const current = await getCurrentUser();
  if (current) {
    userId = current.id;
  } else {
    const expected = process.env.PASSKEY_SETUP_TOKEN;
    if (expected && body.setupToken === expected) {
      const row = await queryOne<{ id: string }>(
        "SELECT id::text FROM users WHERE id = $1",
        [SEEDED_USER_ID]
      );
      if (row) userId = row.id;
    }
  }
  if (!userId) {
    await recordFailure(ip, KIND);
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await verifyCodeForUser(userId, body.code);
  if (!result.ok) {
    const after = await recordFailure(ip, KIND);
    const status = result.reason === "no-credential" ? 400 : 401;
    return Response.json(
      {
        error: result.reason,
        attemptsRemaining: after.allowed ? after.remaining : 0,
      },
      { status }
    );
  }

  await clearCounter(ip, KIND);

  // Open session for the just-verified user if not already signed in.
  if (!current) {
    const ua = req.headers.get("user-agent");
    const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createSession(userId, { userAgent: ua, ip: fwd });
  }
  return Response.json({ ok: true });
}
