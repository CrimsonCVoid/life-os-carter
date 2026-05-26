/**
 * DB-backed Google Health token persistence. Replaces the older
 * cookie-only `tokens-server.ts` for iOS compatibility: the iOS app
 * uses Bearer JWTs, not browser cookies, so any token storage that
 * relies on a Safari session is invisible to iOS API calls.
 *
 * Tokens live in the `integrations` table, one row per
 * (user_id, "google_health"). Access + refresh tokens are AES-256-GCM
 * encrypted at rest via `lib/db/encryption.ts` (key derived from
 * NEXTAUTH_SECRET via HKDF).
 *
 * All functions are user-scoped: they take a `userId` and operate on
 * that user's row. Route handlers pull the userId from `getCurrentUser()`
 * (works equally for cookie-auth web users and Bearer-auth iOS users).
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/db/encryption";
import {
  GoogleTokens,
  RefreshFailedError,
  refreshAccessToken,
} from "./oauth-server";

const PROVIDER = "google_health";

export type ConnectionStatus = {
  connected: boolean;
  email?: string;
  needsReconnect: boolean;
  lastSyncedAt?: string;
};

export async function persistTokens(
  userId: string,
  tokens: GoogleTokens,
  opts?: { email?: string }
): Promise<void> {
  const accessEnc = encrypt(tokens.accessToken);
  const refreshEnc = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
  const expiresAtDate = new Date(tokens.expiresAt);

  // UPSERT: insert new row or update the existing (userId, provider)
  // row. The compound primary key means onConflictDoUpdate is the
  // right shape here.
  await db
    .insert(integrations)
    .values({
      userId,
      provider: PROVIDER,
      accessTokenEncrypted: accessEnc,
      refreshTokenEncrypted: refreshEnc,
      expiresAt: expiresAtDate,
      email: opts?.email,
      needsReconnect: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        accessTokenEncrypted: accessEnc,
        // Only overwrite the refresh token when Google actually
        // returned a new one — they typically only re-emit it on
        // first consent. Otherwise preserve what we had.
        ...(refreshEnc ? { refreshTokenEncrypted: refreshEnc } : {}),
        expiresAt: expiresAtDate,
        ...(opts?.email ? { email: opts.email } : {}),
        needsReconnect: false,
        updatedAt: new Date(),
      },
    });
}

export async function clearTokens(userId: string): Promise<void> {
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, PROVIDER)
      )
    );
}

export async function markNeedsReconnect(userId: string): Promise<void> {
  // Don't drop the row — keep the email + needsReconnect flag so the
  // UI can render "Reconnect [email]" instead of just "Connect".
  // Wiping the access/refresh tokens keeps a stale token from being
  // used by accident.
  await db
    .update(integrations)
    .set({
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      expiresAt: null,
      needsReconnect: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, PROVIDER)
      )
    );
}

export async function readStatus(userId: string): Promise<ConnectionStatus> {
  const rows = await db
    .select({
      refreshTokenEncrypted: integrations.refreshTokenEncrypted,
      email: integrations.email,
      needsReconnect: integrations.needsReconnect,
      lastSyncedAt: integrations.lastSyncedAt,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, PROVIDER)
      )
    )
    .limit(1);
  const row = rows[0];
  return {
    connected: Boolean(row?.refreshTokenEncrypted) && !(row?.needsReconnect ?? false),
    email: row?.email ?? undefined,
    needsReconnect: row?.needsReconnect ?? false,
    lastSyncedAt: row?.lastSyncedAt?.toISOString(),
  };
}

export async function setLastSyncedAt(
  userId: string,
  when: Date = new Date()
): Promise<void> {
  await db
    .update(integrations)
    .set({ lastSyncedAt: when, updatedAt: new Date() })
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, PROVIDER)
      )
    );
}

/**
 * Returns a valid access token, refreshing first if the current one
 * is expired or near-expiry. Throws `RefreshFailedError` if refresh
 * fails — callers should mark needsReconnect and propagate to the UI.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const rows = await db
    .select({
      accessTokenEncrypted: integrations.accessTokenEncrypted,
      refreshTokenEncrypted: integrations.refreshTokenEncrypted,
      expiresAt: integrations.expiresAt,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, userId),
        eq(integrations.provider, PROVIDER)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new RefreshFailedError("No google_health integration row");

  const access = row.accessTokenEncrypted ? decrypt(row.accessTokenEncrypted) : null;
  const expiresAtMs = row.expiresAt ? row.expiresAt.getTime() : 0;
  // 60s skew buffer
  const fresh = access && expiresAtMs && expiresAtMs - Date.now() > 60_000;
  if (fresh && access) return access;

  if (!row.refreshTokenEncrypted) {
    throw new RefreshFailedError("No refresh token");
  }
  const refresh = decrypt(row.refreshTokenEncrypted);
  const next = await refreshAccessToken(refresh);
  await persistTokens(userId, next);
  return next.accessToken;
}
