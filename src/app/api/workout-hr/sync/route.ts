import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  markNeedsReconnect,
} from "@/lib/integrations/google-health/tokens-server";
import { RefreshFailedError } from "@/lib/integrations/google-health/oauth-server";
import {
  buildWorkoutHRSeries,
  fetchActiveCalories,
  fetchHeartRateSeries,
} from "@/lib/integrations/google-health/heart-rate";
import type { WorkoutHRSeries } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sessionId?: string;
  startedAt?: string;
  endedAt?: string;
  maxHr?: number;
};

type SuccessResponse = { ok: true; series: WorkoutHRSeries };
type ErrorResponse = { ok: false; error: string };

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const { sessionId, startedAt, endedAt, maxHr } = body;
  if (!sessionId || !startedAt || !endedAt) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "missing_fields" },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect();
    }
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "reconnect_needed" },
      { status: 401 }
    );
  }

  const [samples, caloriesBurned] = await Promise.all([
    fetchHeartRateSeries({ accessToken, startTime: startedAt, endTime: endedAt }),
    fetchActiveCalories({ accessToken, startTime: startedAt, endTime: endedAt }),
  ]);

  if (samples.length === 0) {
    return NextResponse.json<ErrorResponse>({
      ok: false,
      error: "No HR data for window",
    });
  }

  const series = buildWorkoutHRSeries({
    sessionId,
    startedAt,
    endedAt,
    samples,
    maxHr,
    caloriesBurned,
  });

  return NextResponse.json<SuccessResponse>({ ok: true, series });
}
