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

  const userId = `device:${deviceId.toLowerCase()}`;

  // Column-explicit to avoid breaking if the live Neon table is missing
  // any of the optional columns declared in schema.ts (name/image/etc).
  // SELECT * would 42703 with "column does not exist" on schema drift.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing[0]) {
    await db.insert(users).values({ id: userId });
  }

  const token = await signNativeToken(userId);
  return NextResponse.json({ token, userId });
}
