import { NextRequest } from "next/server";
import { withUserRequest } from "@/lib/api-helpers";
import {
  getRestingHeartRate,
  readRestingHeartRateRange,
  setRestingHeartRate,
} from "@/lib/data/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET supports two modes:
 *   ?date=YYYY-MM-DD            → single-day row (or null)
 *   ?start=YYYY-MM-DD&end=...   → range, sorted by date
 *
 * The single-day shape feeds the Daily Pulse card; the range shape
 * feeds the 30-day drill-in chart and any future sparkline ranges.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (date) {
    return withUserRequest(req, ({ userId }) =>
      getRestingHeartRate(userId, date)
    );
  }
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return new Response(JSON.stringify({ error: "missing_range_or_date" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  return withUserRequest(req, ({ userId }) =>
    readRestingHeartRateRange(userId, start, end)
  );
}

export async function PUT(req: NextRequest) {
  return withUserRequest(req, async ({ userId, body }) => {
    const { date, bpm } = body as { date: string; bpm: number };
    await setRestingHeartRate(userId, date, bpm);
    return { ok: true };
  });
}
