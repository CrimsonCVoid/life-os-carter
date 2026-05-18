import { requireUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns only the completed analyses for trend charting. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    id: string;
    photo_id: string;
    captured_at: string;
    angle: string;
    bf_estimate_pct: number | null;
    bf_confidence_low: number | null;
    bf_confidence_high: number | null;
    vlm_commentary: string | null;
    processed_at: string;
    model_versions: Record<string, string>;
  }>(
    `SELECT a.id::text,
            a.photo_id::text,
            p.captured_at,
            p.angle,
            a.bf_estimate_pct,
            a.bf_confidence_low,
            a.bf_confidence_high,
            a.vlm_commentary,
            a.processed_at,
            a.model_versions
       FROM body_composition_analyses a
       JOIN body_progress_photos p ON p.id = a.photo_id
      WHERE a.user_id = $1
        AND a.status = 'complete'
      ORDER BY p.captured_at DESC
      LIMIT 365`,
    [user.id]
  );

  return Response.json({
    analyses: rows.map((r) => ({
      id: r.id,
      photoId: r.photo_id,
      capturedAt: r.captured_at,
      angle: r.angle,
      bfEstimatePct: r.bf_estimate_pct,
      bfConfidenceLow: r.bf_confidence_low,
      bfConfidenceHigh: r.bf_confidence_high,
      vlmCommentary: r.vlm_commentary,
      processedAt: r.processed_at,
      modelVersions: r.model_versions,
    })),
  });
}
