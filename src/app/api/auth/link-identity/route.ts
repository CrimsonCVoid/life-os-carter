/**
 * POST /api/auth/link-identity
 *
 * Upgrades the caller's device-bound account (or whichever bearer they
 * have) into an Apple- or Google-bound account. The user keeps all
 * their existing data — we migrate every user-scoped row to the new
 * users.id, then mint and return a fresh bearer JWT for the new id.
 *
 *   Body: { provider: "apple" | "google", idToken: string, bundleId?: string }
 *   →     { token, userId }
 *
 * The endpoint MUST be called with an authenticated bearer token
 * (the existing device JWT). No bearer == 401.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { signNativeToken } from "@/lib/native-jwt";
import { verifyAppleIdentityToken } from "@/lib/apple-token-verify";
import { verifyGoogleIdToken } from "@/lib/google-token-verify";
import { migrateUserIdAndCollapse } from "@/lib/migrate-user-id";
import { externalIdToUuid } from "@/lib/user-id";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { provider?: string; idToken?: string; bundleId?: string }
    | null;
  if (!body?.provider || !body?.idToken) {
    return NextResponse.json(
      { error: "provider + idToken required" },
      { status: 400 },
    );
  }

  // 1. Verify the identity token, derive the target users.id.
  let targetExternalId: string;
  let email: string | undefined;
  if (body.provider === "apple") {
    if (!body.bundleId) {
      return NextResponse.json(
        { error: "bundleId required for apple" },
        { status: 400 },
      );
    }
    const apple = await verifyAppleIdentityToken(body.idToken, body.bundleId);
    if (!apple) {
      return NextResponse.json(
        { error: "invalid Apple identity token" },
        { status: 401 },
      );
    }
    targetExternalId = `apple:${apple.sub}`;
    email = apple.email;
  } else if (body.provider === "google") {
    const google = await verifyGoogleIdToken(body.idToken);
    if (!google) {
      return NextResponse.json(
        { error: "invalid Google id token" },
        { status: 401 },
      );
    }
    targetExternalId = `google:${google.sub}`;
    email = google.email;
  } else {
    return NextResponse.json(
      { error: "provider must be 'apple' or 'google'" },
      { status: 400 },
    );
  }

  const targetDbId = externalIdToUuid(targetExternalId);

  // 2. Already linked to this identity — nothing to do, just hand back a fresh JWT.
  if (current.id === targetDbId) {
    const token = await signNativeToken(targetExternalId);
    return NextResponse.json({ token, userId: targetExternalId, merged: false });
  }

  // 3. Ensure target row exists (insert if not).
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetDbId))
    .limit(1);
  if (!existing[0]) {
    await db.insert(users).values({ id: targetDbId, email });
  }

  // 4. Move every user-scoped row from current.id (db UUID) →
  //    targetDbId. Both sides are UUIDs so the SQL works against the
  //    uuid-typed user_id columns. Transactional.
  const moved = await migrateUserIdAndCollapse(current.id, targetDbId);

  // 5. Mint a new bearer carrying the prefixed external ID. iOS uses
  //    it for provider tagging; the next request will hash back to
  //    the same UUID at the auth boundary.
  const token = await signNativeToken(targetExternalId);
  return NextResponse.json({
    token,
    userId: targetExternalId,
    merged: true,
    rowsMoved: moved.rowsMoved,
  });
}
