import { getCurrentUser, createSession } from "@/lib/auth/session";
import { verifyRegistration } from "@/lib/auth/webauthn";
import { queryOne } from "@/lib/db/client";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEEDED_USER_ID = "00000000-0000-4000-8000-000000000001";

type Body = {
  setupToken?: string;
  deviceName?: string;
  response: RegistrationResponseJSON;
};

async function resolveUserId(setupToken: string | undefined): Promise<string | null> {
  const current = await getCurrentUser();
  if (current) return current.id;
  const expected = process.env.PASSKEY_SETUP_TOKEN;
  if (expected && setupToken && setupToken === expected) {
    const exists = await queryOne<{ id: string }>(
      "SELECT id FROM users WHERE id = $1",
      [SEEDED_USER_ID]
    );
    return exists?.id ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.response) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const userId = await resolveUserId(body.setupToken);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await verifyRegistration(userId, body.response, body.deviceName);
  } catch (err) {
    const message = err instanceof Error ? err.message : "verification-failed";
    return Response.json({ error: message }, { status: 400 });
  }

  // Bootstrap path: if nobody was signed in before this, sign them in now.
  const current = await getCurrentUser();
  if (!current) {
    const ua = req.headers.get("user-agent");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createSession(userId, { userAgent: ua, ip });
  }

  return Response.json({ ok: true });
}
