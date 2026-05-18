/**
 * AES-256-GCM encryption for OAuth tokens and other secrets stored in Postgres.
 *
 * Key derivation:
 *   HKDF-SHA-256(NEXTAUTH_SECRET, salt="life-os:db", info="oauth-tokens", 32B)
 *
 * Ciphertext format (base64 URL-safe, no padding):
 *   IV (12B) ‖ ciphertext ‖ auth-tag (16B)
 *
 * Why not store tokens in cookies forever? Cookies survive the browser
 * session but die when the user signs out or rotates a device. Integrations
 * persist across sessions and devices, so they need server-side storage.
 *
 * Why GCM? Authenticated, well-supported in Node's built-in `crypto`, no
 * extra dep. Safe so long as IVs never repeat — we generate 12 random bytes
 * per encrypt call.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = Buffer.from("life-os:db", "utf8");
const INFO = Buffer.from("oauth-tokens:v1", "utf8");

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "NEXTAUTH_SECRET is not set — required to derive the DB encryption key."
    );
  }
  const ikm = Buffer.from(secret, "utf8");
  cachedKey = Buffer.from(hkdfSync("sha256", ikm, SALT, INFO, KEY_LENGTH));
  return cachedKey;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, "base64");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return b64urlEncode(Buffer.concat([iv, ct, tag]));
}

export function decrypt(payload: string): string {
  const buf = b64urlDecode(payload);
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("encrypted payload too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8"
  );
}

export function maybeEncrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  return encrypt(plain);
}

export function maybeDecrypt(
  enc: string | null | undefined
): string | undefined {
  if (enc == null || enc === "") return undefined;
  return decrypt(enc);
}
