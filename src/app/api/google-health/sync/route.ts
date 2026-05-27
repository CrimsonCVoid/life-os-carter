import { NextRequest, NextResponse } from "next/server";
import {
  getValidAccessToken,
  markNeedsReconnect,
  setLastSyncedAt,
} from "@/lib/integrations/google-health/tokens-db";
import { RefreshFailedError } from "@/lib/integrations/google-health/oauth-server";
import {
  fetchActiveEnergy,
  fetchCardioLoad,
  fetchDistance,
  fetchFloors,
  fetchHeartRateVariability,
  fetchRestingHeartRate,
  fetchSleep,
  fetchSteps,
  fetchTotalCalories,
  fetchVo2Max,
  fetchWeight,
  mergeByDate,
  type SyncedDataPoint,
} from "@/lib/integrations/google-health/adapter";
import type { DateStr } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth-server";
import { setRestingHeartRate } from "@/lib/data/metrics";
import {
  getProvenanceRange,
  setSynced,
} from "@/lib/data/integrations";

export const runtime = "nodejs";
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: SyncRequest = {};
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    body = {};
  }
  const days = body.days && body.days > 0 ? Math.min(body.days, 90) : 7;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(user.id);
  } catch (e) {
    if (e instanceof RefreshFailedError) {
      await markNeedsReconnect(user.id);
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

  // Each fetch is independent so a partial failure (e.g. one metric
  // unavailable) doesn't kill the whole sync.
  const results = await Promise.allSettled([
    fetchSleep({ accessToken, startDate, endDate }),
    fetchSteps({ accessToken, startDate, endDate }),
    fetchRestingHeartRate({ accessToken, startDate, endDate }),
    fetchHeartRateVariability({ accessToken, startDate, endDate }),
    fetchWeight({ accessToken, startDate, endDate }),
    fetchCardioLoad({ accessToken, startDate, endDate }),
    fetchActiveEnergy({ accessToken, startDate, endDate }),
    fetchTotalCalories({ accessToken, startDate, endDate }),
    fetchDistance({ accessToken, startDate, endDate }),
    fetchFloors({ accessToken, startDate, endDate }),
    fetchVo2Max({ accessToken, startDate, endDate }),
  ]);

  const sources: SyncedDataPoint[][] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      sources.push(r.value);
    } else {
      const reason = r.reason;
      if (reason instanceof RefreshFailedError) {
        await markNeedsReconnect(user.id);
        return NextResponse.json(
          { error: "reconnect_needed" },
          { status: 401 }
        );
      }
      errors.push(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const updates = mergeByDate(...sources);
  const syncedAtDate = new Date();

  // Persist RHR to Neon so the Daily Pulse card + drill-in chart see
  // synced values across devices. Other metrics still flow client-side
  // into Zustand via /lib/integrations/google-health/sync-client.ts —
  // server-side persistence for those is a separate follow-up.
  //
  // Honors the manual-override-wins rule: if the user logged RHR
  // manually after the most recent sync, skip overwriting on this run.
  const provenance = await getProvenanceRange(
    user.id,
    "google_health",
    startDate,
    endDate
  );
  const overrideByDate = new Map<string, Date>();
  for (const p of provenance) {
    if (p.field !== "restingHeartRate" || !p.manualOverrideAt) continue;
    if (!p.syncedAt || p.manualOverrideAt > p.syncedAt) {
      overrideByDate.set(p.date, p.manualOverrideAt);
    }
  }

  let rhrPersisted = 0;
  for (const u of updates) {
    const bpm = u.fields.restingHeartRate;
    if (bpm == null) continue;
    if (overrideByDate.has(u.date)) continue;
    try {
      await setRestingHeartRate(user.id, u.date, bpm);
      await setSynced(
        user.id,
        "google_health",
        u.date,
        "restingHeartRate",
        syncedAtDate
      );
      rhrPersisted += 1;
    } catch (e) {
      // Don't fail the whole sync on one bad row — surface in partialErrors.
      errors.push(
        `rhr persist ${u.date}: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  // Stamp the lastSyncedAt on the integrations row so the Settings
  // card can show "synced 5m ago" without a separate query.
  try {
    await setLastSyncedAt(user.id, syncedAtDate);
  } catch {
    // intentional: stamping is metadata-only
  }

  return NextResponse.json({
    updates,
    syncedAt: syncedAtDate.toISOString(),
    range: { startDate, endDate },
    persisted: { restingHeartRate: rhrPersisted },
    partialErrors: errors.length ? errors : undefined,
  });
}
