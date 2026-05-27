/**
 * Intraday heart-rate endpoint for the HR analytics graph.
 *
 * METHOD: POST /api/google-health/heart-rate
 * REQUEST BODY: { date?: string }  // "YYYY-MM-DD"; defaults to server today
 * RESPONSE (200): IntradayHeartRate + restingHr
 *   {
 *     date: "YYYY-MM-DD",
 *     samples: { minute: number, avg: number, min: number, max: number }[], // per minute-of-day (0..1439), sorted ascending
 *     min: number,        // day-level min bpm (0 if no data)
 *     max: number,        // day-level max bpm (0 if no data)
 *     avg: number,        // day-level avg bpm rounded (0 if no data)
 *     count: number,      // total samples seen
 *     restingHr: number | null  // daily resting HR for `date` if available
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
import {
  fetchIntradayHeartRate,
  fetchRestingHeartRate,
} from "@/lib/integrations/google-health/adapter";
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

type HeartRateRequest = {
  /** "YYYY-MM-DD"; defaults to server today. */
  date?: string;
};

function isDateStr(v: string): v is DateStr {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: HeartRateRequest = {};
  try {
    body = (await req.json()) as HeartRateRequest;
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

  // Resting HR is best-effort — a failure there shouldn't drop the intraday
  // curve, which is the primary payload.
  const [intradayResult, restingResult] = await Promise.allSettled([
    fetchIntradayHeartRate({ accessToken, date }),
    fetchRestingHeartRate({ accessToken, startDate: date, endDate: date }),
  ]);

  if (intradayResult.status === "rejected") {
    const reason = intradayResult.reason;
    if (reason instanceof RefreshFailedError) {
      await markNeedsReconnect(user.id);
      return NextResponse.json({ error: "reconnect_needed" }, { status: 401 });
    }
    return NextResponse.json(
      { error: reason instanceof Error ? reason.message : "fetch_error" },
      { status: 502 }
    );
  }

  let restingHr: number | null = null;
  if (restingResult.status === "fulfilled") {
    const match = restingResult.value.find((p) => p.date === date);
    restingHr = match?.fields.restingHeartRate ?? null;
  }

  return NextResponse.json({ ...intradayResult.value, restingHr });
}
