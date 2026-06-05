/**
 * GET /api/strava/callback
 *
 * DORMANT until STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are set.
 *
 * Strava redirects the browser here after consent with no Authorization
 * header — so this path is whitelisted in src/middleware.ts PUBLIC_PATHS
 * ("/api/strava/callback"). It authenticates via the signed `state` JWT
 * (signOAuthState) minted in /api/strava/auth/start, exactly like the
 * google-health callback at /api/fitbit/callback.
 *
 * On success it exchanges the code at Strava's /token endpoint and
 * AES-encrypts the refresh token (encryption.ts) before any persistence.
 * There is currently no schema column for Strava tokens, so the encrypted
 * token is NOT persisted — see the TODO below. Web users land on
 * /settings#strava; iOS users deep-link back via lifeos://strava/connected.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/integrations/google-health/state-jwt";
import { encrypt } from "@/lib/db/encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRAVA_TOKEN = "https://www.strava.com/oauth/token";

type ReturnTarget = "web" | "ios";

type StravaTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch seconds
  athlete?: { id?: number };
};

function targetFromNonce(nonce: string): ReturnTarget {
  return nonce.startsWith("ios:") ? "ios" : "web";
}

function redirectFor(
  target: ReturnTarget,
  req: NextRequest,
  params: Record<string, string>
): NextResponse {
  if (target === "ios") {
    const url = new URL("lifeos://strava/connected");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url.toString());
  }
  const url = new URL("/settings", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "strava";
  return NextResponse.redirect(url);
}

function failureRedirect(
  target: ReturnTarget,
  req: NextRequest,
  reason: string
): NextResponse {
  return redirectFor(target, req, { strava: "error", reason });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  let target: ReturnTarget = "web";

  if (!clientId || !clientSecret) {
    return failureRedirect(target, req, "not_configured");
  }
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

  let tokens: StravaTokenResponse;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });
    const res = await fetch(STRAVA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      return failureRedirect(target, req, `exchange_failed_${res.status}`.slice(0, 60));
    }
    tokens = (await res.json()) as StravaTokenResponse;
  } catch {
    return failureRedirect(target, req, "exchange_failed");
  }

  if (!tokens.refresh_token) {
    return failureRedirect(target, req, "no_refresh_token");
  }

  // Encrypt before any storage — even though we can't persist yet, prove the
  // ciphertext path works and never log the plaintext token.
  const encryptedRefreshToken = encrypt(tokens.refresh_token);
  void encryptedRefreshToken;
  void decoded.userId;
  // TODO: persist encrypted refresh token once a column exists. No
  // integrations/strava schema today, so we deliberately store nothing and
  // treat connection as ephemeral — the user re-runs the OAuth flow per
  // session until a `strava_tokens` (or integrations-row) column lands.

  return redirectFor(target, req, { strava: "connected" });
}
