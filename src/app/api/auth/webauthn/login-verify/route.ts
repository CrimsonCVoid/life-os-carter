import { createSession } from "@/lib/auth/session";
import { verifyLogin } from "@/lib/auth/webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { response: AuthenticationResponseJSON };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.response) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    const { userId } = await verifyLogin(body.response);
    const ua = req.headers.get("user-agent");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createSession(userId, { userAgent: ua, ip });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "login-failed";
    return Response.json({ error: message }, { status: 401 });
  }
}
