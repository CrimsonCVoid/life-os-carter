import { requireUser } from "@/lib/auth/session";
import { query, withUser } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostBody = {
  blobUrl: string;
  blobPathname: string;
  angle: "front" | "side" | "back";
  capturedAt: string; // ISO
  captureMeta?: {
    weightKg?: number;
    timeOfDay?: "morning" | "midday" | "evening";
    fasted?: boolean;
    hydrationState?: "low" | "normal" | "high";
    lightingNotes?: string;
  };
};

const ANGLES = new Set(["front", "side", "back"]);

/** POST: insert a new body_progress_photos row. Trigger fires pg_notify → sidecar. */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) return Response.json({ error: "bad-request" }, { status: 400 });

  if (!body.blobUrl || !body.blobPathname) {
    return Response.json({ error: "missing-blob-fields" }, { status: 400 });
  }
  if (!ANGLES.has(body.angle)) {
    return Response.json({ error: "invalid-angle" }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(body.capturedAt))) {
    return Response.json({ error: "invalid-captured-at" }, { status: 400 });
  }
  // Pathname must be in this user's prefix — defense in depth alongside the
  // /api/uploads/sign pathname gate.
  if (!body.blobPathname.startsWith(`users/${user.id}/progress/`)) {
    return Response.json({ error: "invalid-pathname" }, { status: 400 });
  }

  type Row = {
    id: string;
    captured_at: string;
    created_at: string;
  };

  const inserted = await withUser(user.id, async (tx) => {
    const result = await tx.query<Row>(
      `INSERT INTO body_progress_photos
         (user_id, blob_url, blob_pathname, angle, captured_at, capture_meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id::text, captured_at, created_at`,
      [
        user.id,
        body.blobUrl,
        body.blobPathname,
        body.angle,
        body.capturedAt,
        JSON.stringify(body.captureMeta ?? {}),
      ]
    );
    return result.rows[0];
  });

  return Response.json({ photo: inserted }, { status: 201 });
}

/** GET: list this user's progress photos with their analyses (left-joined). */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await query<{
    id: string;
    blob_url: string;
    blob_pathname: string;
    angle: string;
    captured_at: string;
    capture_meta: Record<string, unknown>;
    analysis_id: string | null;
    analysis_status: string | null;
    bf_estimate_pct: number | null;
    bf_confidence_low: number | null;
    bf_confidence_high: number | null;
    measurements: Record<string, unknown> | null;
    silhouette_features: Record<string, unknown> | null;
    vlm_commentary: string | null;
    vlm_observations: Record<string, unknown> | null;
    segmentation_url: string | null;
    analysis_processed_at: string | null;
  }>(
    `SELECT p.id::text,
            p.blob_url, p.blob_pathname, p.angle,
            p.captured_at, p.capture_meta,
            a.id::text                AS analysis_id,
            a.status                  AS analysis_status,
            a.bf_estimate_pct,
            a.bf_confidence_low,
            a.bf_confidence_high,
            a.measurements,
            a.silhouette_features,
            a.vlm_commentary,
            a.vlm_observations,
            a.segmentation_url,
            a.processed_at            AS analysis_processed_at
       FROM body_progress_photos p
       LEFT JOIN body_composition_analyses a ON a.photo_id = p.id
      WHERE p.user_id = $1
      ORDER BY p.captured_at DESC`,
    [user.id]
  );

  return Response.json({
    photos: rows.map((r) => ({
      id: r.id,
      blobUrl: r.blob_url,
      blobPathname: r.blob_pathname,
      angle: r.angle,
      capturedAt: r.captured_at,
      captureMeta: r.capture_meta,
      analysis: r.analysis_id
        ? {
            id: r.analysis_id,
            status: r.analysis_status,
            bfEstimatePct: r.bf_estimate_pct,
            bfConfidenceLow: r.bf_confidence_low,
            bfConfidenceHigh: r.bf_confidence_high,
            measurements: r.measurements,
            silhouetteFeatures: r.silhouette_features,
            vlmCommentary: r.vlm_commentary,
            vlmObservations: r.vlm_observations,
            segmentationUrl: r.segmentation_url,
            processedAt: r.analysis_processed_at,
          }
        : null,
    })),
  });
}
