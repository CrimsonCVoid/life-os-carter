/**
 * Bearer-token JWT helpers for the native iOS client. Signed with a
 * key derived from NEXTAUTH_SECRET so we don't need a new env var.
 * 180-day expiry — long enough that the user doesn't have to re-sign-
 * in on iPhone constantly, short enough that a compromised token
 * eventually expires.
 */

import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";

const ISSUER = "life-os-native";
const TTL_SECONDS = 60 * 60 * 24 * 180;

function key(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET required");
  // HKDF-lite: SHA-256 of "native-jwt|" + secret. Domain-separated
  // from Auth.js's own JWT signer.
  return createHash("sha256").update("native-jwt|" + secret).digest();
}

export async function signNativeToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key());
}

export async function verifyNativeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
