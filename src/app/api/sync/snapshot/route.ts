import { requireUser } from "@/lib/auth/session";
import { queryOne, withUser } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — generous for life-os state, well under Postgres jsonb size limits

type PutBody = {
  schemaVer?: number;
  state: Record<string, unknown>;
};

/** GET: return the latest snapshot for the current user, or 204 if none. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const row = await queryOne<{
    schema_ver: number;
    state: Record<string, unknown>;
    bytes: number;
    updated_at: string;
  }>(
    "SELECT schema_ver, state, bytes, updated_at FROM user_state_snapshots WHERE user_id = $1",
    [user.id]
  );

  if (!row) {
    return new Response(null, { status: 204 });
  }
  return Response.json({
    schemaVer: row.schema_ver,
    state: row.state,
    bytes: row.bytes,
    updatedAt: row.updated_at,
  });
}

/** PUT: replace the snapshot. Whole-blob replacement is intentional — clients
 *  send the entire state on every sync (debounced). Postgres jsonb diff is
 *  efficient enough that this scales fine for a personal app. */
export async function PUT(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body || typeof body.state !== "object" || body.state === null) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }

  const json = JSON.stringify(body.state);
  if (json.length > MAX_BYTES) {
    return Response.json({ error: "snapshot-too-large", bytes: json.length }, { status: 413 });
  }

  const schemaVer = Number.isFinite(body.schemaVer as number) ? Number(body.schemaVer) : 2;

  const result = await withUser(user.id, async (tx) => {
    const r = await tx.query<{ updated_at: string }>(
      `INSERT INTO user_state_snapshots (user_id, schema_ver, state, bytes)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET schema_ver = EXCLUDED.schema_ver,
             state      = EXCLUDED.state,
             bytes      = EXCLUDED.bytes,
             updated_at = now()
       RETURNING updated_at`,
      [user.id, schemaVer, json, json.length]
    );
    return r.rows[0];
  });

  return Response.json({ ok: true, updatedAt: result.updated_at, bytes: json.length });
}
