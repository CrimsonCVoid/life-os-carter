/**
 * GET /api/strava/auth/start
 *
 * DORMANT until STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are set.
 *
 * Kicks off Strava's OAuth consent. Mirrors google-health/auth/start:
 * web callers arrive with a Next session cookie; iOS callers arrive with
 * a `bearer=<JWT>` query param plus `client=ios`. The user is identified
 * here and packed into a signed `state` JWT (via signOAuthState, the same
 * helper google-health uses) so the bearer-less browser callback can
 * attribute tokens back to the right user.
 *
 * Strava does not support PKCE — it's a confidential-client flow keyed by
 * client_secret at the /token exchange — so there's no verifier cookie.
 * The signed state JWT alone carries the userId + nonce.
 */

import { NextRequest, NextResponse } from "next/server";
import { signOAuthState } from "@/lib/integrations/google-health/state-jwt";
import { getCurrentUser } from "@/lib/auth-server";
import { verifyNativeToken } from "@/lib/native-jwt";
import { externalIdToUuid } from "@/lib/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRAVA_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_SCOPE = "activity:read_all";

function randomNonce(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "strava not configured" },
      { status: 503 }
    );
  }
  // Redirect URI: explicit env wins; otherwise derive from request origin.
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI?.trim() ||
    `${req.nextUrl.origin}/api/strava/callback`;

  // Identify the user — bearer query param (iOS) or session cookie (web).
  let userId: string | null = null;
  const bearer = req.nextUrl.searchParams.get("bearer");
  if (bearer) {
    const externalId = await verifyNativeToken(bearer);
    userId = externalId ? externalIdToUuid(externalId) : null;
  }
  if (!userId) {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
  }
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const isIOS = req.nextUrl.searchParams.get("client") === "ios";
  const nonce = randomNonce();
  const state = await signOAuthState({
    userId,
    nonce: isIOS ? `ios:${nonce}` : nonce,
  });

  const url = new URL(STRAVA_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_SCOPE);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
