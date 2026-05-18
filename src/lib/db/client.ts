import { Pool, type PoolClient } from "@neondatabase/serverless";

// Neon serverless Pool — works in Node runtime API routes. For Edge runtime
// (middleware), use the `neon()` HTTP client; we keep middleware DB-free.

const connectionString = process.env.DATABASE_URL;
if (!connectionString && typeof window === "undefined") {
  // Don't throw at import time on the client bundle; server callers will throw on use.
  console.warn("[db] DATABASE_URL is not set");
}

declare global {
  // eslint-disable-next-line no-var
  var __life_os_pool: Pool | undefined;
}

export const pool: Pool =
  global.__life_os_pool ??
  new Pool({ connectionString, max: 10 });

if (process.env.NODE_ENV !== "production") {
  global.__life_os_pool = pool;
}

/**
 * Run `fn` inside a transaction that has `app.user_id` set to `userId`.
 * RLS policies use `current_user_id()` which reads this setting.
 *
 *   await withUser(uid, async (tx) => {
 *     const { rows } = await tx.query('SELECT * FROM goals WHERE date = $1', [date]);
 *     return rows;
 *   });
 *
 * Pass `null` for unauthenticated server-side work (e.g. the WebAuthn login
 * flow before we know the user). RLS-protected tables will see no rows.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (tx: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (userId) {
      // set_config takes a parameter; SET LOCAL does not. is_local = true.
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback failures */
    }
    throw err;
  } finally {
    client.release();
  }
}

type Row = Record<string, unknown>;

/** One-shot query convenience. Returns rows. */
export async function query<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Returns the first row or null. */
export async function queryOne<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
