import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db/client";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "./config";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
};

/** Look up the current user from the session cookie. Returns null if unauthenticated. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  // Single round-trip: join session → user, filter not-expired.
  const row = await queryOne<UserRow & { expires_at: string }>(
    `SELECT u.id, u.email, u.display_name, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
        AND s.expires_at > now()
      LIMIT 1`,
    [sid]
  );
  if (!row) return null;

  // Touch last_seen_at (fire-and-forget — don't block the request)
  void query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [sid]);

  return { id: row.id, email: row.email, displayName: row.display_name };
}

/** Throws a 401-style error if no session. Use in API routes that require auth. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("unauthorized");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return user;
}

/** Create a session row and set the cookie. */
export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null }
): Promise<{ sessionId: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const row = await queryOne<SessionRow>(
    `INSERT INTO sessions (user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, expires_at`,
    [userId, expiresAt.toISOString(), meta?.userAgent ?? null, meta?.ip ?? null]
  );
  if (!row) throw new Error("session-insert-failed");

  const jar = await cookies();
  jar.set(SESSION_COOKIE, row.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { sessionId: row.id, expiresAt };
}

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    await query("DELETE FROM sessions WHERE id = $1", [sid]);
  }
  jar.delete(SESSION_COOKIE);
}
