import { getCurrentUser } from "@/lib/auth/session";
import { startSetup } from "@/lib/auth/totp";
import { checkAllowed, clientIp, recordFailure } from "@/lib/auth/rate-limit";
import { queryOne } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEEDED_USER_ID = "00000000-0000-4000-8000-000000000001";
const KIND = "totp_setup";

type Body = { setupToken?: string };

/** Returns a fresh secret + QR code. Gated by setup token (first-time) or
 *  by being already-signed-in (re-keying an existing device). */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const gate = await checkAllowed(ip, KIND);
  if (!gate.allowed) {
    return Response.json(
      { error: gate.reason === "blocked" ? "ip-blocked" : "too-many-attempts" },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  // Resolve user: signed-in OR bootstrap token → seeded user.
  let userId: string | null = null;
  let email: string | null = null;

  const current = await getCurrentUser();
  if (current) {
    userId = current.id;
    email = current.email;
  } else {
    const expected = process.env.PASSKEY_SETUP_TOKEN;
    if (expected && body.setupToken === expected) {
      const row = await queryOne<{ id: string; email: string }>(
        "SELECT id::text, email FROM users WHERE id = $1",
        [SEEDED_USER_ID]
      );
      if (row) {
        userId = row.id;
        email = row.email;
      }
    }
  }

  if (!userId || !email) {
    await recordFailure(ip, KIND);
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const setup = await startSetup(userId, email);
  return Response.json({
    otpauthUri: setup.otpauthUri,
    qrDataUrl: setup.qrDataUrl,
    // Show the raw secret too so the user can enter manually if QR scanning
    // fails. Grouped in fours for readability on the client.
    manualKey: setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret,
  });
}
