/**
 * Verify an Apple identity token from Sign in with Apple. The native
 * iOS app POSTs the identityToken it receives from ASAuthorization to
 * /api/auth/native-mint, this verifies it server-side, then we mint
 * our own bearer JWT off the result.
 *
 * Apple's JWKS endpoint is hit on every verify — jose caches it
 * internally so repeated calls in close succession reuse keys.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_ISSUER = "https://appleid.apple.com";

export type AppleIdentity = {
  sub: string;          // stable Apple user ID
  email?: string;
  emailVerified?: boolean;
};

export async function verifyAppleIdentityToken(
  token: string,
  audience: string,
): Promise<AppleIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience,
    });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      emailVerified:
        typeof payload.email_verified === "boolean"
          ? payload.email_verified
          : payload.email_verified === "true",
    };
  } catch (err) {
    console.warn("[apple-token-verify] failed:", err);
    return null;
  }
}
