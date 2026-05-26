/**
 * Signed-state passthrough for the OAuth handshake.
 *
 * Why this exists: the iOS app authenticates against the server via
 * Bearer JWT. The Google OAuth consent dance runs in Safari, which
 * has no JWT context. We need a way to attribute the eventual
 * /callback's tokens to the *iOS user* that initiated the flow.
 *
 * Solution: when iOS opens /api/google-health/auth/start it passes
 * its Bearer JWT in a `bearer` query param. The server verifies it,
 * extracts the userId, and packs that userId + an OAuth random nonce
 * into a JWT that goes into Google's `state` parameter. At /callback,
 * we decode the state JWT, get the userId back, and persist the
 * tokens to the integrations table under that user.
 *
 * Short TTL (10 min) — plenty for the consent round-trip, won't
 * outlive a stalled tab.
 */

import { SignJWT, jwtVerify } from "jose";

const STATE_TTL_S = 60 * 10;
const ISSUER = "life-os-google-health-state";

function secret(): Uint8Array {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error("NEXTAUTH_SECRET not configured");
  }
  // The state JWT and native JWTs share the same base secret —
  // safe because they have different `iss` values, so cross-signing
  // attempts fail on verification.
  return new TextEncoder().encode(s);
}

export type OAuthState = {
  userId: string;
  nonce: string;
};

/**
 * Sign `{ userId, nonce }` into a JWT for the OAuth `state` param.
 * The nonce is the random state we'd otherwise have stored in a
 * cookie — we put it inside the JWT so it round-trips with the
 * state and we don't need a cookie on the Safari session.
 */
export async function signOAuthState(payload: OAuthState): Promise<string> {
  return await new SignJWT({ nonce: payload.nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_S}s`)
    .sign(secret());
}

/**
 * Verify the state JWT round-tripped from Google. Returns the
 * decoded `{ userId, nonce }` on success, null on signature
 * mismatch, expiry, or wrong issuer.
 */
export async function verifyOAuthState(token: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const nonce = typeof payload.nonce === "string" ? payload.nonce : null;
    if (!userId || !nonce) return null;
    return { userId, nonce };
  } catch {
    return null;
  }
}
