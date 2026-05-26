/**
 * POST /api/google-health/disconnect
 *
 * Revokes the stored refresh token with Google (best-effort) and
 * clears the user's row in the integrations table. Returns 200
 * either way — disconnect should never fail noisily.
 */

import { NextRequest, NextResponse } from "next/server";
import { revokeToken } from "@/lib/integrations/google-health/oauth-server";
import {
  clearTokens,
  readStatus,
} from "@/lib/integrations/google-health/tokens-db";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decrypt } from "@/lib/db/encryption";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  void _req;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Best-effort token revocation. Read encrypted tokens before
  // wiping the row so we can send Google a heads-up; revoke
  // failures don't block the local clear.
  try {
    const rows = await db
      .select({
        refreshTokenEncrypted: integrations.refreshTokenEncrypted,
        accessTokenEncrypted: integrations.accessTokenEncrypted,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, user.id),
          eq(integrations.provider, "google_health")
        )
      )
      .limit(1);
    const row = rows[0];
    const tokenToRevoke = row?.refreshTokenEncrypted
      ? decrypt(row.refreshTokenEncrypted)
      : row?.accessTokenEncrypted
        ? decrypt(row.accessTokenEncrypted)
        : null;
    if (tokenToRevoke) {
      await revokeToken(tokenToRevoke);
    }
  } catch {
    // intentional: revoke failures shouldn't block disconnect
  }

  await clearTokens(user.id);
  return NextResponse.json({ ok: true, status: await readStatus(user.id) });
}
