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
      const userId = await verifyNativeToken(bearer);
      if (userId) {
        // Column-explicit so the query doesn't 42703 if the live Neon
        // table is missing any optional columns declared in schema.ts.
        // We only need id to authenticate; email/name/image are nice-
        // to-haves we'll start returning again once the schema is in
        // sync (npm run db:push).
        const row = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (row[0]) {
          return { id: row[0].id, email: null, name: null, image: null };
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
