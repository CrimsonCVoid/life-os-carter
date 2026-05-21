/**
 * POST /api/workout-hr/sync
 *
 * Fetches HR samples + active calories from Google Health for a single
 * lift-session window, computes peak/avg/zone-minutes, and persists the
 * resulting series to Neon via upsertWorkoutHrSeries.
 *
 * Body: { sessionId, startedAt, endedAt, maxHr? }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
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
import { upsertWorkoutHrSeries } from "@/lib/data/workout-hr-series";
import { getSettings } from "@/lib/data/settings";
import { resolveMaxHr, type GymSettings, type WorkoutHRSeries } from "@/lib/types";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userOr = await requireUser();
  if (userOr instanceof NextResponse) return userOr;
  const user = userOr;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const { sessionId, startedAt, endedAt } = body;
  if (!sessionId || !startedAt || !endedAt) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "missing_fields" },
      { status: 400 }
    );
  }

  // Resolve the user's max HR for accurate zone bucketing. Body override
  // wins (e.g. for testing); else read from settings.gym; else default.
  const userSettings = await getSettings(user.id);
  const gymSettings = userSettings?.gym as GymSettings | undefined;
  const maxHr = body.maxHr ?? resolveMaxHr(gymSettings);

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

  let samples;
  let caloriesBurned;
  try {
    [samples, caloriesBurned] = await Promise.all([
      fetchHeartRateSeries({
        accessToken,
        startTime: startedAt,
        endTime: endedAt,
      }),
      fetchActiveCalories({
        accessToken,
        startTime: startedAt,
        endTime: endedAt,
      }),
    ]);
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect();
      return NextResponse.json<ErrorResponse>(
        { ok: false, error: "reconnect_needed" },
        { status: 401 }
      );
    }
    console.error("[workout-hr/sync] fetch error", e);
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: e instanceof Error ? e.message : "fetch_error" },
      { status: 500 }
    );
  }

  if (samples.length === 0) {
    return NextResponse.json<ErrorResponse>({
      ok: false,
      error: "No HR data for window",
    });
  }

  const computed = buildWorkoutHRSeries({
    sessionId,
    startedAt,
    endedAt,
    samples,
    maxHr,
    caloriesBurned,
  });

  const persisted = await upsertWorkoutHrSeries(user.id, sessionId, {
    startedAt: computed.startedAt,
    endedAt: computed.endedAt,
    samples: computed.samples,
    peakBpm: computed.peakBpm,
    avgBpm: computed.avgBpm,
    caloriesBurned: computed.caloriesBurned,
    zoneMinutes: computed.zoneMinutes,
  });

  return NextResponse.json<SuccessResponse>({ ok: true, series: persisted });
}
