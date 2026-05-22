/**
 * Verify a Google `id_token` JWT from the native iOS app's OAuth flow.
 * The app gets the token via ASWebAuthenticationSession against
 * accounts.google.com, ships it here, and we verify it against
 * Google's JWKS before trusting any claims.
 *
 * Audience MUST be the iOS OAuth client ID (set in
 * `GOOGLE_IOS_CLIENT_ID` env var on Vercel). Without that check anyone
 * could send a Google token minted for another app.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = {
  sub: string;        // stable Google account ID
  email?: string;
  emailVerified?: boolean;
  name?: string;
};

export async function verifyGoogleIdToken(token: string): Promise<GoogleIdentity | null> {
  const audience = process.env.GOOGLE_IOS_CLIENT_ID;
  if (!audience) {
    console.warn("[google-token-verify] GOOGLE_IOS_CLIENT_ID not set");
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
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
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch (err) {
    console.warn("[google-token-verify] failed:", err);
    return null;
  }
}
