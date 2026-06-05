import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Oura Ring daily summary proxy.
 *
 * DORMANT until OURA_PERSONAL_ACCESS_TOKEN is set in server env. Oura
 * personal access tokens are a simple long-lived bearer (Account → API →
 * Personal Access Tokens) — no OAuth dance needed for a single-user
 * personal app, so we skip the three-legged flow Strava/Google use.
 *
 * Bearer-gated via requireUser() like every other /api/* route. Merges
 * the three daily collections (readiness, sleep, activity) into one
 * normalized record per the requested date; null where a field is absent.
 */

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";

export type OuraDailySummary = {
  date: string;
  readinessScore: number | null;
  sleepScore: number | null;
  activityScore: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  totalSleepHours: number | null;
};

type OuraReadinessDoc = {
  day?: string;
  score?: number | null;
};
type OuraSleepDoc = {
  day?: string;
  score?: number | null;
};
type OuraActivityDoc = {
  day?: string;
  score?: number | null;
};
// daily_sleep carries the score; the richer per-period `sleep` collection
// carries hrv/hr/duration. We pull both: scores from daily_sleep, vitals
// from sleep.
type OuraSleepPeriodDoc = {
  day?: string;
  average_hrv?: number | null;
  average_heart_rate?: number | null;
  lowest_heart_rate?: number | null;
  total_sleep_duration?: number | null; // seconds
};

type OuraCollection<T> = { data?: T[] };

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function fetchCollection<T>(
  collection: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<T[]> {
  const url = new URL(`${OURA_BASE}/${collection}`);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`oura ${collection} failed: ${res.status}`);
  }
  const json = (await res.json()) as OuraCollection<T>;
  return json.data ?? [];
}

function byDay<T extends { day?: string }>(docs: T[], day: string): T | undefined {
  return docs.find((d) => d.day === day);
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const token = process.env.OURA_PERSONAL_ACCESS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "oura not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const startParam = searchParams.get("start_date");
  const endParam = searchParams.get("end_date");

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = (startParam && dateRe.test(startParam) && startParam) ||
    (dateParam && dateRe.test(dateParam) && dateParam) ||
    null;
  const endDate = (endParam && dateRe.test(endParam) && endParam) ||
    (dateParam && dateRe.test(dateParam) && dateParam) ||
    null;
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  }
  // Oura's range filter is end-exclusive on the day boundary for some
  // collections; widen the end by one day so the requested end_date is
  // included, then filter back to the requested days client-side.
  const endPlus = new Date(`${endDate}T00:00:00Z`);
  endPlus.setUTCDate(endPlus.getUTCDate() + 1);
  const endExclusive = endPlus.toISOString().slice(0, 10);

  let readiness: OuraReadinessDoc[];
  let sleepDaily: OuraSleepDoc[];
  let activity: OuraActivityDoc[];
  let sleepPeriods: OuraSleepPeriodDoc[];
  try {
    [readiness, sleepDaily, activity, sleepPeriods] = await Promise.all([
      fetchCollection<OuraReadinessDoc>("daily_readiness", token, startDate, endExclusive),
      fetchCollection<OuraSleepDoc>("daily_sleep", token, startDate, endExclusive),
      fetchCollection<OuraActivityDoc>("daily_activity", token, startDate, endExclusive),
      fetchCollection<OuraSleepPeriodDoc>("sleep", token, startDate, endExclusive),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "oura failed" },
      { status: 502 }
    );
  }

  // Enumerate the requested days inclusively and merge per day.
  const days: string[] = [];
  {
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor <= end) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const summaries: OuraDailySummary[] = days.map((day) => {
    const period = byDay(sleepPeriods, day);
    const sleepSeconds = num(period?.total_sleep_duration);
    return {
      date: day,
      readinessScore: num(byDay(readiness, day)?.score),
      sleepScore: num(byDay(sleepDaily, day)?.score),
      activityScore: num(byDay(activity, day)?.score),
      hrvMs: num(period?.average_hrv),
      restingHr: num(period?.lowest_heart_rate ?? period?.average_heart_rate),
      totalSleepHours:
        sleepSeconds == null ? null : Math.round((sleepSeconds / 3600) * 10) / 10,
    };
  });

  // Single-date requests get the bare object; ranges get the array.
  if (dateParam && dateRe.test(dateParam) && !startParam && !endParam) {
    return NextResponse.json(summaries[0]);
  }
  return NextResponse.json({ days: summaries });
}
