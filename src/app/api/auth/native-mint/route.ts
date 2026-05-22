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
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyAppleIdentityToken } from "@/lib/apple-token-verify";
import { signNativeToken } from "@/lib/native-jwt";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  // Upsert user — match on the Apple sub stored in users.id (we use
  // a synthetic "apple:<sub>" id when no existing row matches by email).
  // Same DrizzleAdapter table the web flow writes to.
  const appleId = `apple:${apple.sub}`;
  let userId: string;

  const byApple = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, appleId))
    .limit(1);

  if (byApple[0]) {
    userId = byApple[0].id;
  } else if (apple.email) {
    const byEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, apple.email))
      .limit(1);
    if (byEmail[0]) {
      userId = byEmail[0].id;
    } else {
      const [row] = await db
        .insert(users)
        .values({ id: appleId, email: apple.email })
        .returning();
      userId = row.id;
    }
  } else {
    // No email (user opted to hide it) and no prior row — create a
    // bare row keyed by appleId only.
    const [row] = await db.insert(users).values({ id: appleId }).returning();
    userId = row.id;
  }

  const token = await signNativeToken(userId);
  return NextResponse.json({ token, userId });
}
