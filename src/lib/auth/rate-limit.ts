/**
 * IP-based rate limiting for auth endpoints.
 *
 * Policy: 5 failed attempts per WINDOW; on 5th failure, block for BLOCK duration.
 * Successful attempts reset the counter. Counter rows live in `auth_rate_limits`
 * (RLS-denied to clients).
 *
 * `kind` separates the buckets — e.g. 'totp_login' has its own counter
 * independent of 'totp_setup'. This way we can rate-limit each surface.
 */

import { query, queryOne } from "@/lib/db/client";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const BLOCK_MS = 30 * 60 * 1000;   // 30 minutes after lockout

export type RateLimitCheck =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "blocked"; blockedUntil: Date }
  | { allowed: false; reason: "too-many"; resetAt: Date };

/** Read IP from request headers. Falls back to a synthetic id if absent. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  // Last resort — local dev or no proxy. Bucket all local hits together.
  return "unknown";
}

export async function checkAllowed(ip: string, kind: string): Promise<RateLimitCheck> {
  const row = await queryOne<{
    attempt_count: number;
    window_started_at: string;
    blocked_until: string | null;
  }>(
    "SELECT attempt_count, window_started_at, blocked_until FROM auth_rate_limits WHERE ip = $1 AND kind = $2",
    [ip, kind]
  );

  const now = Date.now();
  if (row?.blocked_until) {
    const until = new Date(row.blocked_until);
    if (until.getTime() > now) {
      return { allowed: false, reason: "blocked", blockedUntil: until };
    }
    // Block expired — reset.
    await query(
      "UPDATE auth_rate_limits SET attempt_count = 0, window_started_at = now(), blocked_until = NULL WHERE ip = $1 AND kind = $2",
      [ip, kind]
    );
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (!row) return { allowed: true, remaining: MAX_ATTEMPTS };

  const windowStart = new Date(row.window_started_at).getTime();
  if (now - windowStart > WINDOW_MS) {
    // Window expired — reset on next failure write. Allow this attempt.
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (row.attempt_count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      reason: "too-many",
      resetAt: new Date(windowStart + WINDOW_MS),
    };
  }
  return { allowed: true, remaining: MAX_ATTEMPTS - row.attempt_count };
}

/** Record a failure. If this pushes us over MAX_ATTEMPTS, set blocked_until. */
export async function recordFailure(ip: string, kind: string): Promise<RateLimitCheck> {
  // Use UPSERT with window-aware reset logic inline.
  await query(
    `INSERT INTO auth_rate_limits (ip, kind, attempt_count, window_started_at)
       VALUES ($1, $2, 1, now())
     ON CONFLICT (ip, kind) DO UPDATE SET
       attempt_count = CASE
         WHEN auth_rate_limits.window_started_at < now() - interval '${Math.floor(
           WINDOW_MS / 1000
         )} seconds' THEN 1
         ELSE auth_rate_limits.attempt_count + 1
       END,
       window_started_at = CASE
         WHEN auth_rate_limits.window_started_at < now() - interval '${Math.floor(
           WINDOW_MS / 1000
         )} seconds' THEN now()
         ELSE auth_rate_limits.window_started_at
       END`,
    [ip, kind]
  );

  // If we just crossed the threshold, set blocked_until.
  const updated = await queryOne<{ attempt_count: number; window_started_at: string }>(
    "SELECT attempt_count, window_started_at FROM auth_rate_limits WHERE ip = $1 AND kind = $2",
    [ip, kind]
  );
  if (updated && updated.attempt_count >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + BLOCK_MS);
    await query(
      "UPDATE auth_rate_limits SET blocked_until = $1 WHERE ip = $2 AND kind = $3",
      [until.toISOString(), ip, kind]
    );
    return { allowed: false, reason: "blocked", blockedUntil: until };
  }
  const remaining = updated ? MAX_ATTEMPTS - updated.attempt_count : MAX_ATTEMPTS;
  return { allowed: true, remaining };
}

/** Clear the counter for an IP+kind. Call on successful login so the next user
 *  who shares the IP isn't punished for someone else's earlier failures. */
export async function clearCounter(ip: string, kind: string): Promise<void> {
  await query(
    "UPDATE auth_rate_limits SET attempt_count = 0, window_started_at = now(), blocked_until = NULL WHERE ip = $1 AND kind = $2",
    [ip, kind]
  );
}
