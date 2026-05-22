/**
 * Server-side auth helpers. Every API route handler under /api/data/*
 * MUST call `requireUser()` (or `getCurrentUser()` + manual guard) before
 * touching the database. There must be no path to a query that doesn't
 * filter by `userId`.
 *
 * Auth lookup order:
 *   1. `Authorization: Bearer <jwt>` header — native iOS client. The
 *      bearer JWT is minted by /api/auth/native-mint after Sign in with
 *      Apple verification.
 *   2. Auth.js session cookie — web client. Falls through to this.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyNativeToken } from "@/lib/native-jwt";
import { externalIdToUuid } from "@/lib/user-id";

export type CurrentUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 1. Bearer-token path (native iOS app)
  try {
    const hdrs = await headers();
    const bearer = hdrs.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (bearer) {
      const externalId = await verifyNativeToken(bearer);
      if (externalId) {
        // JWT subject carries the prefixed external ID
        // ("device:<uuid>" / "apple:<sub>" / "google:<sub>"). The live
        // Neon users.id column is uuid-typed, so we hash to a
        // deterministic UUID for storage + FK references. The returned
        // `id` is the UUID — every /api/data/* route filters its child
        // tables (meals.user_id, habits.user_id, etc.) by this value
        // and those columns are uuid-typed too, so a UUID compares
        // cleanly. iOS keeps the prefixed external ID locally in the
        // Keychain for AuthStore.identityProvider's prefix sniffing.
        const dbId = externalIdToUuid(externalId);
        const row = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, dbId))
          .limit(1);
        if (row[0]) {
          return { id: dbId, email: null, name: null, image: null };
        }
      }
    }
  } catch {
    // headers() throws outside a request context — fall through.
  }

  // 2. Auth.js session cookie (web)
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
}

export async function requireUser(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return user;
}
