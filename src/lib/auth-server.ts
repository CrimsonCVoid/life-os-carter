/**
 * Server-side auth helpers. Every API route handler under /api/data/*
 * MUST call `requireUser()` (or `getCurrentUser()` + manual guard) before
 * touching the database. There must be no path to a query that doesn't
 * filter by `userId`.
 */

import { auth } from "@/auth";
import { NextResponse } from "next/server";

export type CurrentUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
}

/**
 * Throws a JSON 401 response if there's no session. Designed to be used
 * inside an API route:
 *
 *   const userOrResponse = await requireUser();
 *   if (userOrResponse instanceof NextResponse) return userOrResponse;
 *   const user = userOrResponse;
 *   // ... use user.id ...
 */
export async function requireUser(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  return user;
}
