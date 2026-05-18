import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";
import { query, queryOne } from "@/lib/db/client";
import { RP_ID, RP_NAME, RP_ORIGIN, CHALLENGE_TTL_MIN } from "./config";

// ---------- types ----------

type StoredCredential = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: Buffer;
  counter: string; // bigint comes back as string
  transports: string[];
};

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
};

// ---------- helpers ----------

function uuidToBytes(uuid: string): Uint8Array {
  return new Uint8Array(uuid.replace(/-/g, "").match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function challengeExpiry(): Date {
  return new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000);
}

async function storeChallenge(
  challenge: string,
  kind: "register" | "login",
  userId: string | null
): Promise<void> {
  await query(
    `INSERT INTO webauthn_challenges (user_id, challenge, kind, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, challenge, kind, challengeExpiry().toISOString()]
  );
  // Opportunistic cleanup of expired rows.
  void query("DELETE FROM webauthn_challenges WHERE expires_at < now()");
}

async function consumeChallenge(
  challenge: string,
  kind: "register" | "login"
): Promise<{ user_id: string | null } | null> {
  const row = await queryOne<{ id: string; user_id: string | null }>(
    `DELETE FROM webauthn_challenges
      WHERE challenge = $1 AND kind = $2 AND expires_at > now()
      RETURNING id, user_id`,
    [challenge, kind]
  );
  return row ? { user_id: row.user_id } : null;
}

// ---------- registration ----------

export async function getRegistrationOptions(userId: string) {
  const user = await queryOne<UserRow>(
    "SELECT id, email, display_name FROM users WHERE id = $1",
    [userId]
  );
  if (!user) throw new Error("user-not-found");

  // Existing credentials so the OS doesn't offer to overwrite the same passkey.
  const existing = await query<{ credential_id: string; transports: string[] }>(
    "SELECT credential_id, transports FROM passkey_credentials WHERE user_id = $1",
    [userId]
  );

  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: uuidToBytes(user.id),
    userName: user.email,
    userDisplayName: user.display_name ?? user.email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await storeChallenge(opts.challenge, "register", userId);
  return opts;
}

export async function verifyRegistration(
  userId: string,
  body: RegistrationResponseJSON,
  deviceName?: string
) {
  // We trust the challenge that came back rides the response; pull it from clientDataJSON via the lib.
  // The lib re-verifies the challenge matches what we passed in `expectedChallenge`.
  // So: look up the stored challenge for this user, then verify.
  const stored = await queryOne<{ challenge: string }>(
    `SELECT challenge FROM webauthn_challenges
      WHERE user_id = $1 AND kind = 'register' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!stored) throw new Error("challenge-not-found");

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: stored.challenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("verification-failed");
  }

  const info = verification.registrationInfo;
  const cred = info.credential;

  await query(
    `INSERT INTO passkey_credentials
       (user_id, credential_id, public_key, counter, transports, device_name, device_type, backed_up, aaguid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (credential_id) DO NOTHING`,
    [
      userId,
      cred.id,
      Buffer.from(cred.publicKey),
      cred.counter,
      cred.transports ?? [],
      deviceName ?? null,
      info.credentialDeviceType,
      info.credentialBackedUp,
      info.aaguid && info.aaguid !== "00000000-0000-0000-0000-000000000000" ? info.aaguid : null,
    ]
  );

  await consumeChallenge(stored.challenge, "register");

  return { verified: true as const };
}

// ---------- authentication ----------

export async function getLoginOptions() {
  // Usernameless / discoverable-credential flow: don't pre-filter credentials.
  // The authenticator picks one it knows.
  const opts = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
  });
  await storeChallenge(opts.challenge, "login", null);
  return opts;
}

export async function verifyLogin(body: AuthenticationResponseJSON) {
  // Resolve credential → user
  const credId = body.id;
  const stored = await queryOne<StoredCredential>(
    `SELECT id, user_id, credential_id, public_key, counter, transports
       FROM passkey_credentials
      WHERE credential_id = $1`,
    [credId]
  );
  if (!stored) throw new Error("credential-not-found");

  // Pull the most recent unconsumed login challenge.
  const challengeRow = await queryOne<{ challenge: string }>(
    `SELECT challenge FROM webauthn_challenges
      WHERE kind = 'login' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`
  );
  if (!challengeRow) throw new Error("challenge-not-found");

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
    credential: {
      id: stored.credential_id,
      publicKey: new Uint8Array(stored.public_key),
      counter: Number(stored.counter),
      transports: stored.transports as AuthenticatorTransportFuture[],
    },
  });

  if (!verification.verified) throw new Error("verification-failed");

  // Roll the counter forward + mark last-used.
  await query(
    `UPDATE passkey_credentials
        SET counter = $1, last_used_at = now()
      WHERE id = $2`,
    [verification.authenticationInfo.newCounter, stored.id]
  );

  await consumeChallenge(challengeRow.challenge, "login");

  return { userId: stored.user_id };
}
