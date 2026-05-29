/**
 * Timed sleep-stage segments for the night-timeline hypnogram.
 *
 * METHOD: POST /api/google-health/sleep
 * REQUEST BODY: { date?: string }  // "YYYY-MM-DD" wake date; defaults to server today
 * RESPONSE (200): SleepSegmentsResult, or an empty-segments shell when the
 *   tracker reports no staged data for the night:
 *   {
 *     date: "YYYY-MM-DD",
 *     segments: { stage: "AWAKE"|"LIGHT"|"DEEP"|"REM", startMs: number, endMs: number }[],
 *     inBedStartMs: number,   // epoch ms of first segment (0 when empty)
 *     wakeEndMs: number,      // epoch ms of last segment (0 when empty)
 *     deepMin: number, remMin: number, lightMin: number, awakeMin: number
 *   }
 * AUTH: 401 { error: "unauthenticated" } when no session;
 *       401 { error: "reconnect_needed" } when the Google token can't refresh.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  markNeedsReconnect,
} from "@/lib/integrations/google-health/tokens-db";
import { RefreshFailedError } from "@/lib/integrations/google-health/oauth-server";
import { fetchSleepSegments } from "@/lib/integrations/google-health/adapter";
import type { DateStr } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function today(): DateStr {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type SleepRequest = { date?: string };

function isDateStr(v: string): v is DateStr {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SleepRequest = {};
  try {
    body = (await req.json()) as SleepRequest;
  } catch {
    body = {};
  }
  const date: DateStr =
    body.date && isDateStr(body.date) ? body.date : today();

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(user.id);
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect(user.id);
      return NextResponse.json({ error: "reconnect_needed" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "auth_error" },
      { status: 500 }
    );
  }

  let result;
  try {
    result = await fetchSleepSegments({ accessToken, date });
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect(user.id);
      return NextResponse.json({ error: "reconnect_needed" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch_error" },
      { status: 502 }
    );
  }

  // No staged data → return an empty shell (not an error) so the client
  // can render a real "no stage data" state instead of spinning.
  if (!result) {
    return NextResponse.json({
      date,
      segments: [],
      inBedStartMs: 0,
      wakeEndMs: 0,
      deepMin: 0,
      remMin: 0,
      lightMin: 0,
      awakeMin: 0,
    });
  }

  return NextResponse.json(result);
}
