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
import { externalIdToUuid } from "@/lib/user-id";

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
  const externalId = `apple:${apple.sub}`;
  const dbId = externalIdToUuid(externalId);

  const byApple = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, dbId))
    .limit(1);

  if (!byApple[0]) {
    if (apple.email) {
      const byEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, apple.email))
        .limit(1);
      if (!byEmail[0]) {
        await db.insert(users).values({ id: dbId, email: apple.email });
      }
      // If a row already exists by email (web account), we LEAVE it
      // alone and create the apple-bound row separately — link-identity
      // can collapse them later via migrateUserIdAndCollapse if the
      // user explicitly links.
      else {
        await db.insert(users).values({ id: dbId });
      }
    } else {
      await db.insert(users).values({ id: dbId });
    }
  }

  // JWT subject carries the prefixed external ID so iOS retains
  // provider-tagging via AuthStore.identityProvider, while DB queries
  // use the hashed UUID at the SQL boundary.
  const token = await signNativeToken(externalId);
  return NextResponse.json({ token, userId: externalId });
}
