import { getLoginOptions } from "@/lib/auth/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const options = await getLoginOptions();
    return Response.json(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : "login-options-failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
