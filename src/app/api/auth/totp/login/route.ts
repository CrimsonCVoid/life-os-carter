import { createSession } from "@/lib/auth/session";
import { verifyCodeUsernameLess } from "@/lib/auth/totp";
import { checkAllowed, clearCounter, clientIp, recordFailure } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND = "totp_login";

type Body = { code: string };

export async function POST(req: Request) {
  const ip = clientIp(req);
  const gate = await checkAllowed(ip, KIND);
  if (!gate.allowed) {
    return Response.json(
      {
        error: gate.reason === "blocked" ? "ip-blocked" : "too-many-attempts",
        blockedUntil: gate.reason === "blocked" ? gate.blockedUntil.toISOString() : null,
      },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.code) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const result = await verifyCodeUsernameLess(body.code);
  if (!result.ok) {
    const after = await recordFailure(ip, KIND);
    return Response.json(
      {
        error: result.reason,
        attemptsRemaining: after.allowed ? after.remaining : 0,
        blockedUntil:
          !after.allowed && after.reason === "blocked"
            ? after.blockedUntil.toISOString()
            : null,
      },
      { status: 401 }
    );
  }

  await clearCounter(ip, KIND);

  const ua = req.headers.get("user-agent");
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await createSession(result.userId, { userAgent: ua, ip: fwd });
  return Response.json({ ok: true });
}
