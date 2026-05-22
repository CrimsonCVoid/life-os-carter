/**
 * Native sign-in token mint endpoint. The iOS app calls this once
 * after Sign in with Apple succeeds locally, sending the Apple
 * identityToken. We verify it against Apple's JWKS, upsert the user
 * into Neon, and return a long-lived bearer JWT for subsequent
 * /api/* calls.
 *
 *   POST /api/auth/native-mint
 *   { "identityToken": "...", "bundleId": "com.hbrady.lifeos" }
 *   →  { "token": "<jwt>", "userId": "..." }
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyAppleIdentityToken } from "@/lib/apple-token-verify";
import { signNativeToken } from "@/lib/native-jwt";
import { externalIdToUuid } from "@/lib/user-id";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { identityToken?: string; bundleId?: string }
      | null;

    if (!body?.identityToken || !body?.bundleId) {
      return NextResponse.json(
        { error: "identityToken and bundleId required" },
        { status: 400 },
      );
    }

    const apple = await verifyAppleIdentityToken(body.identityToken, body.bundleId);
    if (!apple) {
      return NextResponse.json({ error: "invalid Apple identity token" }, { status: 401 });
    }

    const externalId = `apple:${apple.sub}`;
    const dbId = externalIdToUuid(externalId);

    // Raw SQL upsert — same pattern as device-mint. Bypasses Drizzle's
    // schema-driven query builder which references columns the live
    // table is missing (42703), and supplies an email value to satisfy
    // the live NOT NULL constraint.
    const emailForInsert = apple.email && apple.email.trim().length > 0
      ? apple.email
      : `${dbId}@native.lifeos.local`;
    await db.execute(
      sql`INSERT INTO users (id, email) VALUES (${dbId}::uuid, ${emailForInsert}) ON CONFLICT (id) DO NOTHING`
    );

    const token = await signNativeToken(externalId);
    return NextResponse.json({ token, userId: externalId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = typeof (e as { code?: unknown }).code === "string"
      ? (e as { code: string }).code
      : undefined;
    console.error("[native-mint] failed:", msg, "code:", code);
    return NextResponse.json(
      { error: "internal", message: msg, code },
      { status: 500 },
    );
  }
}
