import { getCurrentUser } from "@/lib/auth/session";
import { getRegistrationOptions } from "@/lib/auth/webauthn";
import { queryOne } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEEDED_USER_ID = "00000000-0000-4000-8000-000000000001";

// Resolves which user we're enrolling a passkey for:
//   - If signed in → that user (adding another device).
//   - Else if `setupToken` matches PASSKEY_SETUP_TOKEN env → the seeded user (first-device bootstrap).
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
  const body = (await req.json().catch(() => ({}))) as { setupToken?: string };
  const userId = await resolveUserId(body.setupToken);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const options = await getRegistrationOptions(userId);
    return Response.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "registration-options-failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
