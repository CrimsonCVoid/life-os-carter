/**
 * TOTP (RFC 6238) — server-side helpers.
 *
 * Setup flow:
 *   1. /api/auth/totp/setup            → generate secret + QR
 *   2. user scans into Authy/1Password/Google Auth
 *   3. /api/auth/totp/verify-setup     → user enters first code, secret is marked verified
 * Login flow:
 *   /api/auth/totp/login               → user enters 6-digit code
 *
 * Storage: `totp_credentials` has one row per user, RLS denies all client access;
 * only server (via owner role) reads/writes. Replay protection: every accepted
 * step is recorded in `totp_used_steps`.
 */

import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { query, queryOne } from "@/lib/db/client";

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";
// ±1 step window — accommodates clock skew. ~90s total acceptance window.
const VERIFY_WINDOW = 1;

const ISSUER = process.env.WEBAUTHN_RP_NAME ?? "Life OS";

function makeTotp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: STEP_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

export type SetupPayload = {
  secret: string;        // base32 — sent to client ONLY during initial setup
  otpauthUri: string;    // for manual entry
  qrDataUrl: string;     // image/png;base64,...
};

export async function startSetup(userId: string, email: string): Promise<SetupPayload> {
  // Always regenerate — re-running setup invalidates the old secret.
  const secret = new Secret({ size: 20 });  // 160-bit, RFC 6238 §5.1
  const secretB32 = secret.base32;
  const totp = makeTotp(secretB32, email);
  const uri = totp.toString();
  const qr = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, scale: 6 });

  await query(
    `INSERT INTO totp_credentials (user_id, secret_base32, issuer, verified)
       VALUES ($1, $2, $3, false)
     ON CONFLICT (user_id) DO UPDATE
       SET secret_base32 = EXCLUDED.secret_base32,
           verified      = false,
           created_at    = now(),
           last_used_at  = NULL`,
    [userId, secretB32, ISSUER]
  );

  // Clear any prior used-step history — old secret is gone.
  await query("DELETE FROM totp_used_steps WHERE user_id = $1", [userId]);

  return { secret: secretB32, otpauthUri: uri, qrDataUrl: qr };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "no-credential" | "not-verified" | "bad-code" | "replay" };

/** Verify a 6-digit code for a known user. Sets verified=true on first success. */
export async function verifyCodeForUser(
  userId: string,
  code: string
): Promise<VerifyResult> {
  const cred = await queryOne<{ secret_base32: string; verified: boolean }>(
    "SELECT secret_base32, verified FROM totp_credentials WHERE user_id = $1",
    [userId]
  );
  if (!cred) return { ok: false, reason: "no-credential" };

  const user = await queryOne<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [userId]
  );
  if (!user) return { ok: false, reason: "no-credential" };

  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return { ok: false, reason: "bad-code" };

  const totp = makeTotp(cred.secret_base32, user.email);
  // .validate returns delta (steps off from current) or null if invalid.
  const delta = totp.validate({ token: cleaned, window: VERIFY_WINDOW });
  if (delta === null) return { ok: false, reason: "bad-code" };

  const currentStep = Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;

  // Replay protection — reject if this exact step was already used.
  const already = await queryOne(
    "SELECT 1 FROM totp_used_steps WHERE user_id = $1 AND step = $2",
    [userId, currentStep]
  );
  if (already) return { ok: false, reason: "replay" };

  await query(
    "INSERT INTO totp_used_steps (user_id, step) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, currentStep]
  );

  // Mark verified on first success; bump last_used_at.
  await query(
    "UPDATE totp_credentials SET verified = true, last_used_at = now() WHERE user_id = $1",
    [userId]
  );

  // Opportunistic cleanup of old replay rows (older than 5 minutes are irrelevant).
  void query("DELETE FROM totp_used_steps WHERE used_at < now() - interval '5 minutes'");

  return { ok: true, userId };
}

/** Username-less verify: find the single seeded user with a verified secret
 *  and try the code against it. Single-user app shortcut. */
export async function verifyCodeUsernameLess(code: string): Promise<VerifyResult> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id::text FROM totp_credentials
      WHERE verified = true
      ORDER BY last_used_at DESC NULLS LAST, created_at DESC
      LIMIT 1`
  );
  if (!row) return { ok: false, reason: "no-credential" };
  return verifyCodeForUser(row.user_id, code);
}
