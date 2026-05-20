import { requireUser } from "@/lib/auth/session";
import { queryOne, withUser } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  headline: string;
  observations: string[] | null;
  generated_at: string;
};

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const row = await withUser(user.id, async (tx) => {
    const r = await tx.query<Row>(
      `SELECT headline, observations, generated_at
         FROM daily_briefings
         WHERE user_id = $1 AND date = $2`,
      [user.id, today]
    );
    return r.rows[0] ?? null;
  });

  if (!row) return Response.json({ briefing: null });
  return Response.json({
    briefing: {
      headline: row.headline,
      observations: Array.isArray(row.observations) ? row.observations : [],
      generatedAt: row.generated_at,
    },
  });
}
