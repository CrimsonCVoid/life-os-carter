import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  markNeedsReconnect,
} from "@/lib/integrations/google-health/tokens-server";
import { RefreshFailedError } from "@/lib/integrations/google-health/oauth-server";
import {
  fetchSleep,
  fetchSteps,
  mergeByDate,
  type SyncedDataPoint,
} from "@/lib/integrations/google-health/adapter";
import type { DateStr } from "@/lib/types";

export const dynamic = "force-dynamic";

function dateNDaysAgo(n: number): DateStr {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function today(): DateStr {
  return dateNDaysAgo(0);
}

type SyncRequest = {
  /** Number of days to backfill. 7 on incremental, 30 on initial. */
  days?: number;
};

export async function POST(req: NextRequest) {
  let body: SyncRequest = {};
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    body = {};
  }
  const days = body.days && body.days > 0 ? Math.min(body.days, 90) : 7;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect();
      return NextResponse.json(
        { error: "reconnect_needed" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "auth_error" },
      { status: 500 }
    );
  }

  const startDate = dateNDaysAgo(days);
  const endDate = today();

  // Stage 2: sleep + steps. Subsequent stages extend this list. Each
  // fetch is independent so a partial failure (e.g. one metric unavailable)
  // doesn't kill the whole sync.
  const results = await Promise.allSettled([
    fetchSleep({ accessToken, startDate, endDate }),
    fetchSteps({ accessToken, startDate, endDate }),
  ]);

  const sources: SyncedDataPoint[][] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      sources.push(r.value);
    } else {
      const reason = r.reason;
      if (reason instanceof RefreshFailedError) {
        await markNeedsReconnect();
        return NextResponse.json(
          { error: "reconnect_needed" },
          { status: 401 }
        );
      }
      errors.push(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const updates = mergeByDate(...sources);
  return NextResponse.json({
    updates,
    syncedAt: new Date().toISOString(),
    range: { startDate, endDate },
    partialErrors: errors.length ? errors : undefined,
  });
}
