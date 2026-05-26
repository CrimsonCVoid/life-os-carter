/**
 * OAuth callback. Lives at /api/fitbit/callback because that's the
 * redirect URI registered in Google Cloud Console / .env.local. The
 * rest of the Google Health integration sits under /api/google-health/*
 * — keep this single legacy-named file aligned with
 * GOOGLE_HEALTH_REDIRECT_URI.
 *
 * Token attribution: the `state` param is a signed JWT containing
 * `{ userId, nonce }` that the /auth/start route minted. We verify
 * it here, cross-check the nonce against the PKCE cookie set on the
 * same Safari session, then exchange the code for tokens and persist
 * them to Neon under that userId. iOS users come back to the app
 * via a `lifeos://google-health/connected` deep link; web users
 * land on `/settings#google-health`.
 */

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAMES } from "@/lib/integrations/google-health/config";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
} from "@/lib/integrations/google-health/oauth-server";
import { persistTokens } from "@/lib/integrations/google-health/tokens-db";
import { verifyOAuthState } from "@/lib/integrations/google-health/state-jwt";

export const dynamic = "force-dynamic";

type ReturnTarget = "web" | "ios";

function targetFromNonce(nonce: string): ReturnTarget {
  return nonce.startsWith("ios:") ? "ios" : "web";
}

function redirectFor(
  target: ReturnTarget,
  req: NextRequest,
  params: Record<string, string>
): NextResponse {
  if (target === "ios") {
    // Deep link back into the LifeOS app. The iOS app registers the
    // `lifeos://` scheme in Info.plist (CFBundleURLTypes) and handles
    // the host `google-health` via .onOpenURL in LifeOSApp.
    const url = new URL("lifeos://google-health/connected");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url.toString());
  }
  const url = new URL("/settings", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.hash = "google-health";
  return NextResponse.redirect(url);
}

function failureRedirect(
  target: ReturnTarget,
  req: NextRequest,
  reason: string
): NextResponse {
  return redirectFor(target, req, { gh: "error", reason });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // Default to web until we've decoded state — covers users hitting
  // /callback with no state at all.
  let target: ReturnTarget = "web";

  if (error) {
    return failureRedirect(target, req, error);
  }
  if (!code || !state) {
    return failureRedirect(target, req, "missing_code");
  }

  const decoded = await verifyOAuthState(state);
  if (!decoded) {
    return failureRedirect(target, req, "state_invalid");
  }
  target = targetFromNonce(decoded.nonce);

  const cookieNonce = req.cookies.get(COOKIE_NAMES.oauthState)?.value;
  const verifier = req.cookies.get(COOKIE_NAMES.pkceVerifier)?.value;
  // The cookie stored the raw nonce; the state JWT may have
  // prefixed it with "ios:" to mark the return target. Strip the
  // prefix for the equality check.
  const expectedNonce = decoded.nonce.startsWith("ios:")
    ? decoded.nonce.slice(4)
    : decoded.nonce;
  if (!cookieNonce || cookieNonce !== expectedNonce || !verifier) {
    return failureRedirect(target, req, "state_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: verifier,
    });
    const email = await fetchUserEmail(tokens.accessToken);
    await persistTokens(decoded.userId, tokens, { email });

    const res = redirectFor(target, req, { gh: "connected" });
    res.cookies.delete(COOKIE_NAMES.pkceVerifier);
    res.cookies.delete(COOKIE_NAMES.oauthState);
    return res;
  } catch (e) {
    const reason = e instanceof Error ? e.message.slice(0, 80) : "exchange_failed";
    return failureRedirect(target, req, reason);
  }
}
