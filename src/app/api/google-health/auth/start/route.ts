/**
 * GET /api/google-health/auth/start
 *
 * Kicks off the OAuth consent dance. Web callers come in via the
 * Settings card with a Next session cookie; iOS callers come in
 * with a `bearer=<JWT>` query param plus a `client=ios` marker so
 * the callback knows to redirect back into the app via the
 * `lifeos://` scheme instead of the web `/settings` route.
 *
 * The `state` query param sent to Google encodes a signed JWT
 * containing `{ userId, nonce, client }` — that lets the callback
 * attribute tokens to the correct user without needing the Safari
 * session to hold a JWT cookie. PKCE verifier still goes in a
 * cookie because Google's spec says state can be opaque but verifier
 * must be presented back at /token (cookies on the same origin work
 * for that since the callback hits this server, not iOS).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAMES,
  readEnv,
} from "@/lib/integrations/google-health/config";
import {
  buildAuthUrl,
} from "@/lib/integrations/google-health/oauth-server";
import {
  challengeForVerifier,
  randomState,
  randomVerifier,
} from "@/lib/integrations/google-health/pkce";
import { signOAuthState } from "@/lib/integrations/google-health/state-jwt";
import { getCurrentUser } from "@/lib/auth-server";
import { verifyNativeToken } from "@/lib/native-jwt";
import { externalIdToUuid } from "@/lib/user-id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    readEnv();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "env not configured" },
      { status: 500 }
    );
  }

  // Identify the user. Two paths:
  //  - Web: getCurrentUser() resolves the Next session cookie
  //  - iOS: ?bearer=<JWT> on the URL since Safari has no JWT cookie
  let userId: string | null = null;
  const bearer = req.nextUrl.searchParams.get("bearer");
  if (bearer) {
    // verifyNativeToken returns the prefixed external id ("google:<sub>").
    // The integrations table — like every user-scoped table — is keyed
    // by the hashed UUID that getCurrentUser() returns, so hash it here.
    // Without this the callback persists tokens under "google:<sub>"
    // while status/sync look them up by the UUID; they never match and
    // the connection reads as not-connected with no data.
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
  const verifier = randomVerifier();
  const challenge = await challengeForVerifier(verifier);
  const nonce = randomState();
  // State JWT carries both userId and nonce, signed with NEXTAUTH_SECRET.
  // The callback verifies the signature + extracts userId; the cookie
  // below carries the same nonce for CSRF binding on the Safari
  // session.
  const stateJWT = await signOAuthState({
    userId,
    nonce: isIOS ? `ios:${nonce}` : nonce,
  });
  const url = buildAuthUrl({ state: stateJWT, codeChallenge: challenge });

  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";
  const maxAge = 60 * 10;
  res.cookies.set(COOKIE_NAMES.pkceVerifier, verifier, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  res.cookies.set(COOKIE_NAMES.oauthState, nonce, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
