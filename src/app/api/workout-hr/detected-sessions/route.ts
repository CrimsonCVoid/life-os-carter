import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  markNeedsReconnect,
} from "@/lib/integrations/google-health/tokens-server";
import { RefreshFailedError } from "@/lib/integrations/google-health/oauth-server";
import {
  fetchExerciseSessions,
  type DetectedSession,
} from "@/lib/integrations/google-health/heart-rate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SuccessResponse = { ok: true; sessions: DetectedSession[] };
type ErrorResponse = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "missing start/end" },
      { status: 400 }
    );
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof RefreshFailedError) {
      await markNeedsReconnect();
      return NextResponse.json<ErrorResponse>(
        { ok: false, error: "needs_reconnect" },
        { status: 401 }
      );
    }
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "token_error" },
      { status: 401 }
    );
  }

  if (!accessToken) {
    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "not_connected" },
      { status: 401 }
    );
  }

  const startTime = `${start}T00:00:00Z`;
  const endTime = `${end}T23:59:59Z`;

  const sessions = await fetchExerciseSessions({
    accessToken,
    startTime,
    endTime,
  });

  return NextResponse.json<SuccessResponse>({ ok: true, sessions });
}
