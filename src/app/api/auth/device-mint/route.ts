/**
 * Device-bound auto sign-in for the native iOS client. The app sends a
 * stable per-install UUID (stored in iOS Keychain) and gets back the
 * same bearer JWT shape the SIWA path mints — so every existing
 * /api/data/* route works unchanged.
 *
 *   POST /api/auth/device-mint
 *   { "deviceId": "<uuid>" }
 *   →    { "token": "<jwt>", "userId": "device:<uuid>" }
 *
 * No identity verification — this is anonymous per-device persistence.
 * Each device gets its own users row. If/when Sign in with Apple is
 * wired back later, we can fold the device user into the Apple-bound
 * user via a one-time merge endpoint; for now devices are silos.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signNativeToken } from "@/lib/native-jwt";
import { externalIdToUuid } from "@/lib/user-id";

export const runtime = "nodejs";

const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { deviceId?: string } | null;
  const deviceId = body?.deviceId?.trim();

  if (!deviceId || !UUID_RE.test(deviceId)) {
    return NextResponse.json(
      { error: "deviceId (UUID) required" },
      { status: 400 },
    );
  }

  const externalId = `device:${deviceId.toLowerCase()}`;
  const dbId = externalIdToUuid(externalId);

  // The live Neon `users.id` is uuid-typed even though schema.ts says
  // text. Hash the prefixed external ID into a deterministic UUID for
  // storage; the JWT subject still carries the prefixed form so iOS
  // can derive the provider from AuthStore.identityProvider.
  // Also column-explicit because the live table may be missing
  // optional columns (name/image/etc) declared in schema.ts.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, dbId))
    .limit(1);

  if (!existing[0]) {
    await db.insert(users).values({ id: dbId });
  }

  const token = await signNativeToken(externalId);
  return NextResponse.json({ token, userId: externalId });
}
