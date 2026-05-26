/**
 * GET /api/google-health/status
 *
 * Returns connection metadata for the *current user* (web cookie or
 * iOS Bearer JWT — both resolve through `getCurrentUser`). No tokens
 * are surfaced; only `{ connected, email?, needsReconnect, lastSyncedAt? }`
 * so the UI can render the right "Connect / Reconnect / Disconnect"
 * affordance.
 */

import { NextResponse } from "next/server";
import { readStatus } from "@/lib/integrations/google-health/tokens-db";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    // Match the iOS APIClient's "unauthenticated" decoder expectation
    // by returning a structured body — but don't 401 here, since this
    // endpoint is called speculatively to render the Settings card.
    return NextResponse.json({
      connected: false,
      needsReconnect: false,
    });
  }
  const status = await readStatus(user.id);
  return NextResponse.json(status);
}
